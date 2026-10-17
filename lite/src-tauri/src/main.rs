#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ads;
#[cfg(target_os = "linux")]
mod fonts;
mod placement;
mod players;
mod profile;
mod ruffle;

use std::path::Path;
#[cfg(target_os = "linux")]
use std::path::PathBuf;

use players::Engine;
use players::MovieKind;
use players::Players;
#[cfg(target_os = "linux")]
use players::LIMITED_FONTS_MARKER;
use serde::Serialize;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

fn hide_launcher_enabled(app: &tauri::AppHandle) -> bool {
    app.path()
        .app_config_dir()
        .map(|dir| ruffle::load_hide_launcher(&dir))
        .unwrap_or(false)
}

fn sync_launcher(app: &tauri::AppHandle, presence: players::Presence) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    match (presence, hide_launcher_enabled(app)) {
        (players::Presence::Running, true) => {
            let _ = window.hide();
        }
        (players::Presence::Running, false) => {
            let _ = window.show();
        }
        (players::Presence::Idle, true) => {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
        (players::Presence::Idle, false) => {}
    }
}

#[derive(Serialize)]
struct LauncherSettings {
    #[serde(rename = "hideLauncher")]
    hide_launcher: bool,
}

fn config_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

#[tauri::command]
fn launcher_settings(app: tauri::AppHandle) -> Result<LauncherSettings, String> {
    let dir = config_dir(&app)?;
    Ok(LauncherSettings {
        hide_launcher: ruffle::load_hide_launcher(&dir),
    })
}

#[tauri::command]
fn set_hide_launcher(app: tauri::AppHandle, hide: bool) -> Result<LauncherSettings, String> {
    let dir = config_dir(&app)?;
    ruffle::save_hide_launcher(&dir, hide)?;
    sync_launcher(&app, app.state::<Players>().presence());
    Ok(LauncherSettings {
        hide_launcher: hide,
    })
}

fn load_ruffle_settings(app: &tauri::AppHandle) -> ruffle::RuffleSettings {
    match app.path().app_config_dir() {
        Ok(dir) => ruffle::RuffleSettings::load(&dir),
        Err(e) => {
            eprintln!("aquastar-lite: no config dir ({e}); using default Ruffle settings");
            ruffle::RuffleSettings::default()
        }
    }
}

#[tauri::command]
async fn play(app: tauri::AppHandle, engine: Engine, movie: MovieKind) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let resource_dir = app.path().resource_dir().ok();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf));
    let placement = app.state::<placement::Placement>().inner().clone();
    let roots = placement.player_roots(&app_data, resource_dir.as_deref(), exe_dir.as_deref());
    let profile = placement::electron_profile(exe_dir.as_deref());
    let settings = load_ruffle_settings(&app);
    let saves = placement.ruffle_save_directory().map(Path::to_path_buf);
    let players = app.state::<Players>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        players.launch_movie(&roots, engine, &profile, movie, &settings, saves.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn ruffle_settings(app: tauri::AppHandle) -> Result<ruffle::SettingsView, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(ruffle::RuffleSettings::load(&dir).view())
}

#[tauri::command]
fn set_ruffle_settings(
    app: tauri::AppHandle,
    quality: String,
    graphics: String,
) -> Result<ruffle::SettingsView, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let settings = ruffle::RuffleSettings::from_choice(&quality, &graphics);
    settings.save(&dir)?;
    Ok(settings.view())
}

#[tauri::command]
fn engines() -> Vec<(Engine, bool)> {
    Engine::ALL.iter().map(|e| (*e, e.supported())).collect()
}

#[tauri::command]
fn preferred_engine() -> Option<Engine> {
    Engine::preferred()
}

const SITE_HOSTS: &[&str] = &[
    "aqwwiki.wikidot.com",
    "account.aq.com",
    "www.aq.com",
    "www.artix.com",
];

/// HTTPS pages on the launcher's site list. Navigation inside a site window
/// still drops ad hosts (`ads::host_blocked`); these hosts are not on that list.
fn allowed_site(url: &str) -> Result<tauri::Url, String> {
    let parsed: tauri::Url = url.parse().map_err(|_| "bad url".to_string())?;
    let host = parsed.host_str().unwrap_or("");
    if parsed.scheme() != "https" || !SITE_HOSTS.contains(&host) {
        return Err(format!("{host} is not an allowed site"));
    }
    Ok(parsed)
}

fn profile_paths() -> placement::ProfilePaths {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf));
    placement::electron_profile(exe_dir.as_deref())
}

fn list_paths(profile: &placement::ProfilePaths) -> profile::ListPaths {
    profile::ListPaths {
        settings_files: profile.settings_files.clone(),
        reminders: profile.aqua_dir.join("aquastar_reminders.json"),
        legacy_reminders: profile.legacy_reminders.clone(),
        todo: profile.aqua_dir.join("aquastar_todo.json"),
        strategy: profile.aqua_dir.join("aquastar_strategy.json"),
    }
}

#[tauri::command]
fn open_tool(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let (title, width, height) =
        profile::tool_spec(&name).ok_or_else(|| format!("unknown window {name}"))?;
    if let Some(window) = app.get_webview_window(&name) {
        let _ = window.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, &name, WebviewUrl::App(format!("{name}.html").into()))
        .title(title)
        .inner_size(width, height)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn tool_document(name: String) -> Result<profile::ToolDocument, String> {
    if profile::tool_spec(&name).is_none() {
        return Err(format!("unknown window {name}"));
    }
    let profile = profile_paths();
    let paths = list_paths(&profile);
    profile::ensure_window(&paths, &name)?;
    documents_for(&paths)
        .into_iter()
        .find(|doc| doc.name == name)
        .ok_or_else(|| format!("unknown window {name}"))
}

fn documents_for(paths: &profile::ListPaths) -> Vec<profile::ToolDocument> {
    profile::documents(paths)
}

#[tauri::command]
async fn open_site(app: tauri::AppHandle, label: String, url: String) -> Result<(), String> {
    let parsed = allowed_site(&url)?;
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.navigate(parsed);
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(format!("AquaStar - {label}"))
        .inner_size(1100.0, 750.0)
        .initialization_script_for_all_frames(ads::init_script())
        .on_navigation(|url| match url.host_str() {
            Some(host) => !ads::host_blocked(host),
            None => true,
        })
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
    let caption = wide("AquaStar");
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            MB_ICONERROR,
        );
    }
}

/// `AQUASTAR_LITE_SMOKE=flash` or `=ruffle` starts that player. Anything else,
/// including an unset variable, leaves the launcher waiting for a click.
fn parse_smoke_engine(value: &str) -> Option<Engine> {
    match value.trim() {
        "flash" => Some(Engine::Flash),
        "ruffle" => Some(Engine::Ruffle),
        _ => None,
    }
}

fn smoke_request() -> Option<Engine> {
    let Ok(value) = std::env::var("AQUASTAR_LITE_SMOKE") else {
        return None;
    };
    match parse_smoke_engine(&value) {
        Some(engine) => Some(engine),
        None => {
            eprintln!("aquastar-lite: ignoring AQUASTAR_LITE_SMOKE={value}");
            None
        }
    }
}

fn schedule_smoke(app: tauri::AppHandle) {
    let Some(engine) = smoke_request() else {
        return;
    };
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let result = tauri::async_runtime::block_on(play(app, engine, MovieKind::Primary));
        eprintln!("aquastar-lite: smoke {engine:?}: {result:?}");
    });
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
                "AquaStar could not create its data folder next to the executable.\n\n{err}\n\nportable.txt is present, so data was not stored in AppData."
            );
            #[cfg(target_os = "windows")]
            tell_user(&message);
            #[cfg(not(target_os = "windows"))]
            eprintln!("aquastar-lite: {message}");
            std::process::exit(1);
        }
    };
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(placement)
        .manage(Players::default())
        .invoke_handler(tauri::generate_handler![
            play,
            engines,
            preferred_engine,
            open_site,
            open_tool,
            tool_document,
            ruffle_settings,
            set_ruffle_settings,
            launcher_settings,
            set_hide_launcher
        ])
        .setup(|app| {
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(Path::to_path_buf));
            let profile = placement::electron_profile(exe_dir.as_deref());
            std::thread::spawn(move || players::warm_loader(&profile));
            schedule_smoke(app.handle().clone());
            Ok(())
        })
        .build(context)
        .expect("failed to build AquaStar");
    app.state::<Players>()
        .watch_presence({
            let app = app.handle().clone();
            move |presence| sync_launcher(&app, presence)
        })
        .expect("presence hook");
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
    use super::*;

    #[test]
    fn launcher_pages_open_on_allowed_hosts_and_are_not_ad_hosts() {
        let pages = [
            "https://account.aq.com/CharPage",
            "https://account.aq.com/CharPage?id=Yulgar",
            "https://www.aq.com/gamedesignnotes/",
            "https://www.aq.com/lore/dailygifts",
            "https://www.aq.com/lore/calendar",
            "https://aqwwiki.wikidot.com/new-releases",
            "https://www.aq.com/lore/guides/enhancementtraits",
            "https://aqwwiki.wikidot.com/",
            "https://account.aq.com/",
            "https://www.aq.com/",
        ];
        for url in pages {
            let parsed = allowed_site(url).unwrap_or_else(|err| panic!("{url}: {err}"));
            let host = parsed.host_str().unwrap();
            assert!(!ads::host_blocked(host), "{host} is blocked");
        }
        assert!(allowed_site("http://www.aq.com/lore/calendar").is_err());
        assert!(allowed_site("https://evil.example/CharPage").is_err());
        assert!(allowed_site("not a url").is_err());
    }

    #[test]
    fn smoke_hook_accepts_only_the_two_players() {
        assert_eq!(parse_smoke_engine("flash"), Some(Engine::Flash));
        assert_eq!(parse_smoke_engine(" ruffle\n"), Some(Engine::Ruffle));
        assert_eq!(parse_smoke_engine(""), None);
        assert_eq!(parse_smoke_engine("both"), None);
        assert_eq!(parse_smoke_engine("FLASH"), None);
    }

    #[test]
    fn testing_and_dragonfable_buttons_stay_off_the_smoke_colors() {
        let ui = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../ui");
        let html = std::fs::read_to_string(ui.join("index.html")).unwrap();
        let css = std::fs::read_to_string(ui.join("style.css")).unwrap();
        let js = std::fs::read_to_string(ui.join("main.js")).unwrap();
        assert!(html.contains("data-movie=\"testing\""));
        assert!(html.contains("data-movie=\"dragonfable\""));
        for line in html.lines() {
            if line.contains("data-movie") {
                assert!(!line.contains("data-engine"), "{line}");
            }
        }
        assert!(html.contains("data-engine=\"ruffle\""));
        assert!(html.contains("data-engine=\"flash\""));
        assert!(css.contains(".sites button, .movies button { background: #2a9d8f; }"));
        assert!(css.contains("background: #4361ee"));
        assert!(css.contains("button.primary { background: #f4a261;"));
        let teal = (0x2a_i32, 0x9d_i32, 0x8f_i32);
        for (name, target) in [("orange", (244, 162, 97)), ("blue", (67, 97, 238))] {
            let dr = teal.0 - target.0;
            let dg = teal.1 - target.1;
            let db = teal.2 - target.2;
            assert!(
                dr * dr + dg * dg + db * db > 36 * 36,
                "teal matches the smoke {name} finder"
            );
        }
        assert!(js.contains("movie: 'primary'"));
        assert!(js.contains("movie: button.dataset.movie"));
    }

    #[test]
    fn product_strings_say_aquastar_3_alpha() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let read = |path: &str| std::fs::read_to_string(root.join(path)).unwrap();
        let lite = format!("{} {}", "AquaStar", "Lite");
        let cargo = read("Cargo.toml");
        let conf = read("tauri.conf.json");
        assert!(cargo.contains("name = \"aquastar-lite\""));
        assert!(cargo.contains("version = \"3.0.0-alpha.3\""));
        assert!(!cargo.contains(&lite));
        let parsed: serde_json::Value = serde_json::from_str(&conf).unwrap();
        assert_eq!(parsed["version"], "3.0.0-alpha.3");
        assert_eq!(parsed["productName"], "aquastar-lite");
        assert_eq!(parsed["mainBinaryName"], "aquastar-lite");
        assert_eq!(parsed["identifier"], "io.github.aquaspy.aquastar-lite");
        assert_eq!(parsed["app"]["windows"][0]["title"], "AquaStar");
        assert_eq!(parsed["bundle"]["macOS"]["bundleName"], "AquaStar");
        let visible = [
            conf,
            read("src/players/flash_gtk.c"),
            read("assets/aquastar-lite.desktop"),
            read("../ui/index.html"),
            read("src/players/flash_menu.rs"),
            read("src/main.rs"),
            read("src/players/mod.rs"),
            read("Info.plist"),
        ];
        for text in &visible {
            assert!(text.contains("AquaStar"));
            assert!(!text.contains(&lite), "{text}");
        }
        assert!(visible[3].contains("<title>AquaStar</title>"));
        assert!(visible[3].contains("<h1>AquaStar</h1>"));
        assert!(visible[4].contains("PLAYER_TITLE: &str = \"AquaStar\""));
        assert!(visible[2].lines().any(|line| line == "Name=AquaStar"));
        assert!(visible[7].contains("<string>AquaStar</string>"));
    }
}
