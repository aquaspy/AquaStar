#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
mod fonts;
mod placement;
mod players;

use std::path::Path;
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
    let placement = app.state::<placement::Placement>().inner().clone();
    let saves = placement.ruffle_save_directory().map(Path::to_path_buf);
    let players = app.state::<Players>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        players.launch(&dir, engine, AQW_LOADER, saves.as_deref())
    })
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

/// Point WebKit at a small curated fontconfig unless the user already chose one.
/// See `fonts.rs` for why. The marker tells player launches to drop the limit so
/// Ruffle and Flash keep the full system fonts.
#[cfg(target_os = "linux")]
fn limit_webkit_fonts() {
    if std::env::var_os("FONTCONFIG_FILE").is_some() {
        eprintln!("aquastar-lite: FONTCONFIG_FILE is set, leaving WebKit fonts alone");
        return;
    }
    let dirs: Vec<PathBuf> = fonts::SEARCH_DIRS.iter().map(PathBuf::from).collect();
    let installed = fonts::base_dir()
        .and_then(|base| fonts::install(&base, &dirs, Path::new("/etc/fonts/conf.d")));
    match installed {
        Ok((conf, count)) => {
            eprintln!("aquastar-lite: WebKit uses {} ({count} font files)", conf.display());
            std::env::set_var("FONTCONFIG_FILE", &conf);
            std::env::set_var(LIMITED_FONTS_MARKER, "1");
        }
        Err(e) => eprintln!(
            "aquastar-lite: could not write the WebKit fontconfig ({e}); using system fonts, the window may stay blank"
        ),
    }
}

#[cfg(target_os = "windows")]
fn tell_user(message: &str) {
    use std::os::windows::ffi::OsStrExt;

    const MB_ICONERROR: u32 = 0x10;

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut std::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            utype: u32,
        ) -> i32;
    }

    fn wide(text: &str) -> Vec<u16> {
        std::ffi::OsStr::new(text)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    let text = wide(message);
    let caption = wide("AquaStar Lite");
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            MB_ICONERROR,
        );
    }
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
    let mut context = tauri::generate_context!();
    let placement = match placement::apply(&mut context) {
        Ok(placement) => placement,
        Err(err) => {
            let message = format!(
                "AquaStar Lite could not create its data folder next to the executable.\n\n{err}\n\nportable.txt is present, so data was not stored in AppData."
            );
            #[cfg(target_os = "windows")]
            tell_user(&message);
            #[cfg(not(target_os = "windows"))]
            eprintln!("aquastar-lite: {message}");
            std::process::exit(1);
        }
    };
    let app = tauri::Builder::default()
        .manage(placement)
        .manage(Players::default())
        .invoke_handler(tauri::generate_handler![play, engines, open_site])
        .build(context)
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
