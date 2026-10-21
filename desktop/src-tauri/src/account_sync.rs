use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Mutex,
};
use std::time::Duration;
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const SESSION_LABEL: &str = "account-session";
static SESSION_CREATION: Mutex<()> = Mutex::new(());
static SESSION_READY: AtomicBool = AtomicBool::new(false);

fn is_account_url(url: &tauri::Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        && url.host_str() == Some("account.aq.com")
        && url.username().is_empty()
        && url.password().is_none()
}

fn candidate_labels(caller: Option<&str>) -> Vec<&str> {
    let mut labels = Vec::new();
    if let Some(label @ ("account" | "charpage" | "char-page")) = caller {
        labels.push(label);
    }
    for label in ["account", "charpage", "char-page"] {
        if !labels.contains(&label) {
            labels.push(label);
        }
    }
    labels
}

fn account_window(app: &tauri::AppHandle, caller: Option<&str>) -> Result<WebviewWindow, String> {
    for label in candidate_labels(caller) {
        if let Some(window) = app.get_webview_window(label) {
            if window.url().is_ok_and(|url| is_account_url(&url)) {
                return Ok(window);
            }
        }
    }
    hidden_account_window(app)
}

fn hidden_account_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    let _creation = SESSION_CREATION
        .lock()
        .map_err(|_| "account-session-unavailable")?;
    if let Some(window) = app.get_webview_window(SESSION_LABEL) {
        if SESSION_READY.load(Ordering::Acquire) {
            return Ok(window);
        }
        return Err("account-session-not-ready".into());
    }
    SESSION_READY.store(false, Ordering::Release);
    let (sender, receiver) = mpsc::channel();
    let url = "https://account.aq.com/Home"
        .parse()
        .map_err(|_| "invalid-account-url")?;
    let window = WebviewWindowBuilder::new(app, SESSION_LABEL, WebviewUrl::External(url))
        .title("AquaStar NEO Account Session")
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .on_navigation(|url| is_account_url(url) && url.scheme() == "https")
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .on_download(|_, _| false)
        .on_permission_request(|_, _| tauri::webview::PermissionResponse::Deny)
        .on_page_load(move |_, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished
                && is_account_url(payload.url())
            {
                let _ = sender.send(());
            }
        })
        .build()
        .map_err(|_| "account-session-unavailable")?;
    window.on_window_event(|event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            SESSION_READY.store(false, Ordering::Release);
        }
    });
    if receiver.recv_timeout(Duration::from_secs(20)).is_err() {
        let _ = window.destroy();
        return Err("account-session-load-timeout".into());
    }
    SESSION_READY.store(true, Ordering::Release);
    Ok(window)
}

fn cookie_header(window: &WebviewWindow, target: &str) -> Result<String, String> {
    let url: tauri::Url = target.parse().map_err(|_| "invalid-account-url")?;
    if !is_account_url(&url) {
        return Err("invalid-account-url".into());
    }
    let cookies = window
        .cookies_for_url(url)
        .map_err(|_| "account-cookies-unavailable")?;
    if cookies.is_empty() {
        return Err("unauthenticated".into());
    }
    Ok(cookies
        .iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; "))
}

pub fn sync_blocking(
    app: &tauri::AppHandle,
    inventory_file: &Path,
    caller: Option<&str>,
) -> serde_json::Value {
    let window = match account_window(app, caller) {
        Ok(window) => window,
        Err(error) => {
            return serde_json::json!({"ok":false,"error":"network","stage":"session","detail":error})
        }
    };
    crate::inventory::sync_locked(inventory_file, |target| {
        let cookies = cookie_header(&window, target)?;
        crate::inventory::live_get(target, &cookies)
    })
}

pub async fn sync(app: tauri::AppHandle, caller_label: Option<String>) -> serde_json::Value {
    let inventory_file = crate::profile::live_files().inventory;
    tauri::async_runtime::spawn_blocking(move || sync_blocking(&app,&inventory_file,caller_label.as_deref()))
        .await
        .unwrap_or_else(|_| serde_json::json!({"ok":false,"error":"network","stage":"session","detail":"account-sync-worker-failed"}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_account_callers_can_select_their_own_session() {
        assert_eq!(
            candidate_labels(Some("char-page")),
            vec!["char-page", "account", "charpage"]
        );
        for caller in [
            None,
            Some("inventory"),
            Some("extension-untrusted"),
            Some("wiki"),
        ] {
            assert_eq!(
                candidate_labels(caller),
                vec!["account", "charpage", "char-page"]
            );
        }
        for url in [
            "https://account.aq.com/Home",
            "http://account.aq.com/AQW/InventoryData",
        ] {
            assert!(is_account_url(&url.parse().unwrap()));
        }
        for url in [
            "https://account.aq.com.evil.example/Home",
            "https://user@account.aq.com/Home",
            "tauri://account.aq.com/Home",
            "https://evil.example/",
        ] {
            assert!(!is_account_url(&url.parse().unwrap()));
        }
    }
}
