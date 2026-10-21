#[path = "../src/account_sync.rs"]
mod account_sync;

use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct AccountLoads(AtomicUsize);

mod profile {
    pub struct Files {
        pub inventory: std::path::PathBuf,
    }
    pub fn live_files() -> Files {
        Files {
            inventory: std::path::PathBuf::from(
                std::env::var("AQUASTAR_ACCOUNT_PROBE_OUTPUT").unwrap(),
            )
            .join("inventory-fixture.json"),
        }
    }
}

mod inventory {
    use serde_json::{json, Value};
    use std::{
        path::Path,
        sync::{Mutex, OnceLock},
    };

    pub const TARGETS: [(&str, &str, &str); 3] = [
        (
            "https://account.aq.com/Home",
            "aquastar_probe_home",
            "/Home",
        ),
        (
            "https://account.aq.com/AQW/InventoryData",
            "aquastar_probe_inventory",
            "/AQW",
        ),
        (
            "https://account.aq.com/myapi/inventory/BuyBackData",
            "aquastar_probe_buyback",
            "/myapi/inventory",
        ),
    ];
    static READS: OnceLock<Mutex<Vec<Value>>> = OnceLock::new();

    pub fn sync_locked(_path: &Path, fetch: impl Fn(&str) -> Result<String, String>) -> Value {
        for (url, _, _) in TARGETS {
            if let Err(error) = fetch(url) {
                return json!({"ok":false,"error":error,"url":url});
            }
        }
        json!({"ok":true,"fixtureEndpoints":3})
    }

    pub fn live_get(url: &str, cookies: &str) -> Result<String, String> {
        let (_, expected, _) = TARGETS
            .iter()
            .find(|(target, _, _)| *target == url)
            .ok_or("unexpected fixture endpoint")?;
        let own: Vec<_> = cookies
            .split(';')
            .map(str::trim)
            .filter(|cookie| cookie.starts_with("aquastar_probe_"))
            .collect();
        if own.len() != 1 || own[0] != format!("{expected}=dummy-fixture") {
            return Err("path-scoped dummy cookie mismatch".into());
        }
        READS
            .get_or_init(Default::default)
            .lock()
            .unwrap()
            .push(json!({"url":url,"dummyCookieCount":own.len()}));
        Ok("fixture response".into())
    }

    pub fn reads() -> Value {
        json!(*READS.get_or_init(Default::default).lock().unwrap())
    }
}

fn run_probe(app: &tauri::AppHandle) -> Result<Value, String> {
    let response = ureq::get("https://account.aq.com/Home")
        .timeout(Duration::from_secs(10))
        .call();
    let anonymous_status = match response {
        Ok(response) | Err(ureq::Error::Status(_, response)) => response.status(),
        Err(error) => return Err(format!("anonymous account network unavailable: {error}")),
    };
    if matches!(anonymous_status, 403 | 429 | 500..=599) {
        return Err(format!(
            "anonymous account endpoint blocked or unavailable: HTTP {anonymous_status}"
        ));
    }
    let main = app
        .get_webview_window("main")
        .ok_or("main window missing")?;
    for (_, name, path) in inventory::TARGETS {
        main.set_cookie(
            tauri::webview::Cookie::build((name, "dummy-fixture"))
                .domain("account.aq.com")
                .path(path)
                .secure(true)
                .http_only(true)
                .build(),
        )
        .map_err(|error| error.to_string())?;
    }
    let file = profile::live_files().inventory;
    let first = account_sync::sync_blocking(app, &file, None);
    if first["ok"] != true {
        return Err(format!("first hidden-session sync failed: {first}"));
    }
    let session = app
        .get_webview_window("account-session")
        .ok_or("hidden account session missing")?;
    if session.is_visible().map_err(|error| error.to_string())? {
        return Err("account session became visible".into());
    }
    let loads = app.state::<AccountLoads>().0.load(Ordering::SeqCst);
    if loads == 0 {
        return Err("native account page did not finish loading".into());
    }
    let second = account_sync::sync_blocking(app, &file, Some("inventory"));
    if second["ok"] != true {
        return Err(format!("reused hidden-session sync failed: {second}"));
    }
    if app.state::<AccountLoads>().0.load(Ordering::SeqCst) != loads {
        return Err("second sync unexpectedly reloaded the account session".into());
    }
    let mut labels: Vec<_> = app.webview_windows().into_keys().collect();
    labels.sort();
    if labels != ["account-session", "main"] {
        return Err("unexpected account or tool window opened".into());
    }
    if session.is_visible().map_err(|error| error.to_string())?
        || main.is_visible().map_err(|error| error.to_string())?
    {
        return Err("probe windows must remain hidden".into());
    }
    Ok(
        json!({"ok":true,"anonymousHttpStatus":anonymous_status,"syncCalls":2,"nativeAccountPageLoads":loads,"hiddenSession":true,"visibleAccountWindow":false,"windowLabels":labels,"cookieReads":inventory::reads(),"fixtureBoundary":"Real native cookie store and account_sync helper; inventory HTTP responses are synthetic, no authenticated account tested"}),
    )
}

fn main() {
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = format!(
        "io.github.aquaspy.account-session-probe-{}",
        std::process::id()
    );
    context.config_mut().app.windows.clear();
    tauri::Builder::default()
        .manage(AccountLoads(AtomicUsize::new(0)))
        .on_page_load(|webview, payload| {
            if webview.label() == "account-session"
                && payload.event() == tauri::webview::PageLoadEvent::Finished
            {
                webview
                    .app_handle()
                    .state::<AccountLoads>()
                    .0
                    .fetch_add(1, Ordering::SeqCst);
            }
        })
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External("about:blank".parse()?))
                .visible(false)
                .build()?;
            let app = app.handle().clone();
            std::thread::spawn(move || {
                let result =
                    run_probe(&app).unwrap_or_else(|error| json!({"ok":false,"limitation":error}));
                let output = PathBuf::from(std::env::var("AQUASTAR_ACCOUNT_PROBE_OUTPUT").unwrap());
                std::fs::create_dir_all(&output).unwrap();
                std::fs::write(
                    output.join("results.json"),
                    serde_json::to_vec_pretty(&result).unwrap(),
                )
                .unwrap();
                eprintln!("account-session probe: {result}");
                app.exit(if result["ok"] == true { 0 } else { 1 });
            });
            Ok(())
        })
        .run(context)
        .expect("native account session probe");
}
