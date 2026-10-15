#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod players;

#[cfg(target_os = "linux")]
use std::path::PathBuf;

use players::Engine;
#[cfg(target_os = "linux")]
use players::LIMITED_FONTS_MARKER;
use players::Players;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

const AQW_LOADER: &str = "https://game.aq.com/game/gamefiles/Loader4.swf?ver=b";

#[tauri::command]
async fn play(app: tauri::AppHandle, engine: Engine) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let players = app.state::<Players>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || players.launch(&dir, engine, AQW_LOADER))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn engines() -> Vec<(Engine, bool)> {
    Engine::ALL.iter().map(|e| (*e, e.supported())).collect()
}

#[tauri::command]
async fn open_site(app: tauri::AppHandle, label: String, url: String) -> Result<(), String> {
    let parsed: tauri::Url = url.parse().map_err(|_| "bad url".to_string())?;
    let host = parsed.host_str().unwrap_or("");
    let allowed = ["aqwwiki.wikidot.com", "account.aq.com", "www.aq.com", "www.artix.com"];
    if parsed.scheme() != "https" || !allowed.contains(&host) {
        return Err(format!("{host} is not an allowed site"));
    }
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.navigate(parsed);
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(format!("AquaStar Lite - {label}"))
        .inner_size(1100.0, 750.0)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Fontconfig handed to WebKitGTK. Only small families: the web process walks
/// every file under each `<dir>` on its main thread before the first commit.
#[cfg(any(target_os = "linux", test))]
fn webkit_fonts_conf(cache_dir: &str) -> String {
    format!(
        r#"<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>/usr/share/fonts/truetype/dejavu</dir>
  <dir>/usr/share/fonts/dejavu</dir>
  <cachedir>{cache_dir}</cachedir>
</fontconfig>
"#
    )
}

#[cfg(any(target_os = "linux", test))]
fn xml_text(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// Point WebKit at a DejaVu-only fontconfig unless the user already chose one.
///
/// On a desktop with ~3200 fonts (2380 of them Noto), WebKitGTK 2.50 and 2.52
/// keep `WebKitWebProcess` at 100% CPU and never leave `about:blank`. The GTK
/// window is allocated correctly and just shows its own background, which looks
/// like a blank white window. `fc-list` itself is instant; this is WebKit's
/// startup scan, not a broken fontconfig cache. A config that does not include
/// `/usr/share/fonts` lets the page commit within about a second.
///
/// A `FONTCONFIG_FILE` already set in the environment is left alone. The marker
/// tells player launches to drop the limit so Ruffle and Flash keep system fonts.
#[cfg(target_os = "linux")]
fn limit_webkit_fonts() {
    if std::env::var_os("FONTCONFIG_FILE").is_some() {
        return;
    }
    let dir = fontconfig_dir();
    let cache = dir.join("fontconfig-cache");
    if std::fs::create_dir_all(&cache).is_err() {
        return;
    }
    let conf_path = dir.join("fonts.conf");
    let conf = webkit_fonts_conf(&xml_text(&cache.to_string_lossy()));
    let unchanged = std::fs::read_to_string(&conf_path).ok().as_deref() == Some(conf.as_str());
    if !unchanged && std::fs::write(&conf_path, &conf).is_err() {
        return;
    }
    std::env::set_var("FONTCONFIG_FILE", &conf_path);
    std::env::set_var(LIMITED_FONTS_MARKER, "1");
}

#[cfg(target_os = "linux")]
fn fontconfig_dir() -> PathBuf {
    std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty())
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".cache")))
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("aquastar-lite")
}

fn main() {
    // WebKitGTK's DMA-BUF renderer costs ~125 MB PSS here (measured under Xvfb) and is a
    // known source of blank windows on NVIDIA/older Mesa. Users can still opt back in.
    // It does not fix the blank window caused by the font scan below.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    #[cfg(target_os = "linux")]
    limit_webkit_fonts();
    let app = tauri::Builder::default()
        .manage(Players::default())
        .invoke_handler(tauri::generate_handler![play, engines, open_site])
        .build(tauri::generate_context!())
        .expect("failed to build AquaStar Lite");
    app.run(|app, event| {
        let main_gone = matches!(
            &event,
            RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } if label == "main"
        );
        if main_gone || matches!(event, RunEvent::Exit) {
            app.state::<Players>().kill_all();
            if main_gone {
                app.exit(0);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    #[test]
    fn webkit_fontconfig_does_not_scan_the_system_font_root() {
        let conf = super::webkit_fonts_conf("/tmp/aquastar-lite & cache");
        assert!(conf.contains("<dir>/usr/share/fonts/truetype/dejavu</dir>"));
        assert!(conf.contains("<dir>/usr/share/fonts/dejavu</dir>"));
        assert!(conf.contains("<cachedir>/tmp/aquastar-lite &amp; cache</cachedir>"));
        assert!(!conf.contains("<dir>/usr/share/fonts</dir>"));
        assert!(!conf.contains("noto"));
    }
}
