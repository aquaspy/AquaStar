#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod players;

use players::{Engine, Players};
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

fn main() {
    // WebKitGTK's DMA-BUF renderer costs ~125 MB PSS here (measured under Xvfb) and is a
    // known source of blank windows on NVIDIA/older Mesa. Users can still opt back in.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
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
