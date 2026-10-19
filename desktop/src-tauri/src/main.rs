#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ads;
mod account_sync;
mod extensions;
mod inventory;
mod launcher;
mod manifest;
mod menu_visibility;
#[cfg(target_os = "linux")]
mod fonts;
mod placement;
mod players;
mod profile;
mod ruffle;

use std::path::Path;
use std::str::FromStr;
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
    #[serde(rename = "showMenuBar")]
    show_menu_bar: bool,
    #[serde(rename = "menuBarSupported")]
    menu_bar_supported: bool,
}

fn config_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

#[tauri::command]
fn launcher_settings(app: tauri::AppHandle) -> Result<LauncherSettings, String> {
    let dir = config_dir(&app)?;
    Ok(LauncherSettings {
        hide_launcher: ruffle::load_hide_launcher(&dir),
        show_menu_bar: app.state::<menu_visibility::Visibility>().get(),
        menu_bar_supported: !cfg!(target_os = "macos"),
    })
}

#[tauri::command]
fn set_hide_launcher(app: tauri::AppHandle, hide: bool) -> Result<LauncherSettings, String> {
    let dir = config_dir(&app)?;
    ruffle::save_hide_launcher(&dir, hide)?;
    sync_launcher(&app, app.state::<Players>().presence());
    Ok(LauncherSettings {
        hide_launcher: hide,
        show_menu_bar: app.state::<menu_visibility::Visibility>().get(),
        menu_bar_supported: !cfg!(target_os = "macos"),    })
}

#[tauri::command]
async fn set_show_menu_bar(app: tauri::AppHandle, show: bool) -> Result<LauncherSettings, String> {
    if cfg!(target_os = "macos") {
        return Err("macOS manages the application menu in the system menu bar".into());
    }
    let dir = config_dir(&app)?;
    let state = app.state::<menu_visibility::Visibility>();
    let previous = state.get();
    state.set(show);
    if let Err(error) = menu_visibility::apply(&app) {
        state.set(previous);
        let _ = menu_visibility::apply(&app);
        return Err(error);
    }
    if let Err(error) = ruffle::save_show_menu_bar(&dir, show) {
        state.set(previous);
        let _ = menu_visibility::apply(&app);
        return Err(error);
    }
    launcher_settings(app)
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

async fn play_extension(app: tauri::AppHandle, source: String, engine: Engine) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let resource_dir = app.path().resource_dir().ok();
    let exe_dir = std::env::current_exe().ok().and_then(|path|path.parent().map(Path::to_path_buf));
    let placement = app.state::<placement::Placement>().inner().clone();
    let roots = placement.player_roots(&app_data,resource_dir.as_deref(),exe_dir.as_deref());
    let settings = load_ruffle_settings(&app);
    let saves = placement.ruffle_save_directory().map(Path::to_path_buf);
    let players = app.state::<Players>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || players.launch_source(&roots,engine,&source,&settings,saves.as_deref())).await.map_err(|e|e.to_string())?
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

fn allowed_site(url: &str) -> Result<tauri::Url, String> {
    manifest::accept_site(url)
}

/// Windows deadlocks when a window is built on the main thread, which is where Tauri
/// runs synchronous commands and menu handlers. Window-building commands are `async`
/// and handler paths go through `spawn_tool` / `open_dialog`.
#[tauri::command]
async fn open_tool(app: tauri::AppHandle, name: String) -> Result<(), String> {
    open_tool_window(&app, &name)
}

fn spawn_tool(app: &tauri::AppHandle, name: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = open_tool_window(&app, &name) {
            eprintln!("aquastar-lite: could not open {name}: {error}");
        }
    });
}

fn open_tool_window(app: &tauri::AppHandle, name: &str) -> Result<(), String> {
    let (title, width, height) =
        profile::tool_spec(name).ok_or_else(|| format!("unknown window {name}"))?;
    if let Some(window) = app.get_webview_window(name) {
        let _ = window.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(app, name, WebviewUrl::App(profile::feature_page(name).into()))
        .title(title)
        .inner_size(width, height)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_keybindings() -> serde_json::Value {
    profile::keybindings_payload(&profile::live_files())
}

#[tauri::command]
fn get_settings_messages() -> serde_json::Value {
    profile::settings_messages()
}

#[tauri::command]
fn save_keybindings(binds: serde_json::Value) -> Result<serde_json::Value, String> {
    profile::save_keybindings(&profile::live_files(), &binds)
}

#[tauri::command]
fn get_ruffle_status() -> serde_json::Value {
    profile::ruffle_status(&profile::live_files())
}

#[tauri::command]
fn update_ruffle(channel: Option<String>) -> serde_json::Value {
    let _ = channel;
    serde_json::json!({
        "ok": false,
        "error": "AquaStar 3.0 uses the pinned desktop players. The in-page Ruffle download is not used."
    })
}

#[tauri::command]
fn restore_bundled_ruffle() -> serde_json::Value {
    serde_json::json!({ "ok": true })
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
fn get_custom_swf_status() -> serde_json::Value {
    profile::swf_status(&profile::live_files())
}

#[tauri::command]
fn choose_custom_swf(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let picked = rfd::FileDialog::new()
            .set_title("Select a custom SWF file")
            .add_filter("Flash SWF", &["swf"])
            .pick_file();
        let _ = tx.send(picked);
    })
    .map_err(|e| e.to_string())?;
    let Some(path) = rx.recv().map_err(|e| e.to_string())? else {
        return Ok(serde_json::json!({ "canceled": true }));
    };
    let mut status = profile::install_swf(&profile::live_files(), &path)?;
    if let Some(obj) = status.as_object_mut() {
        obj.insert("canceled".into(), serde_json::Value::Bool(false));
    }
    Ok(status)
}

#[tauri::command]
fn remove_custom_swf() -> serde_json::Value {
    profile::remove_swf(&profile::live_files())
}

#[tauri::command]
fn get_plugin_list(opts: Option<serde_json::Value>) -> serde_json::Value {
    profile::plugin_list(&profile::live_files(), opts.as_ref().unwrap_or(&serde_json::Value::Null))
}

#[tauri::command]
fn get_plugin_settings() -> serde_json::Value {
    profile::plugin_settings(&profile::live_files())
}

#[tauri::command]
fn get_settings_layout() -> serde_json::Value {
    profile::settings_layout()
}

#[tauri::command]
fn get_reminders() -> Result<serde_json::Value, String> {
    profile::reminders_document(&profile::live_files())
}

#[tauri::command]
fn get_reminders_messages() -> serde_json::Value {
    profile::reminders_messages()
}

#[tauri::command]
fn save_reminders(state: serde_json::Value) -> Result<serde_json::Value, String> {
    profile::save_reminders(&profile::live_files(), &state)
}

#[tauri::command]
fn get_todo() -> Result<serde_json::Value, String> {
    profile::todo_document(&profile::live_files())
}

#[tauri::command]
fn get_todo_messages() -> serde_json::Value {
    profile::todo_messages()
}

#[tauri::command]
fn save_todo(state: serde_json::Value) -> Result<serde_json::Value, String> {
    profile::save_todo(&profile::live_files(), &state)
}

#[tauri::command]
async fn open_todo_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed: tauri::Url = url.parse().map_err(|_| "bad url".to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("only http(s) links open".into());
    }
    let label = "todo-link";
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.navigate(parsed);
        let _ = window.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(parsed))
        .title("AquaStar - To-Do")
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

#[tauri::command]
fn get_strategy() -> Result<serde_json::Value, String> {
    profile::strategy_document(&profile::live_files())
}

#[tauri::command]
fn get_strategy_messages() -> serde_json::Value {
    profile::strategy_messages()
}

#[tauri::command]
fn save_strategy(data: serde_json::Value) -> Result<serde_json::Value, String> {
    profile::save_strategy(&profile::live_files(), &data)
}

#[tauri::command]
fn get_inventory_item_counts(names: Option<Vec<String>>) -> serde_json::Value {
    inventory::item_counts(&profile::live_files(), names.as_deref().unwrap_or(&[]))
}


#[tauri::command]
fn get_inventory() -> serde_json::Value {
    inventory::document(&profile::live_files())
}

#[tauri::command]
fn get_inventory_messages() -> serde_json::Value {
    inventory::inventory_messages()
}

#[tauri::command]
fn get_wiki_messages() -> serde_json::Value {
    inventory::wiki_messages()
}

#[tauri::command]
fn save_inventory_labels(labels: serde_json::Value) -> serde_json::Value {
    inventory::save_labels(&profile::live_files(), &labels)
}

#[tauri::command]
fn set_inventory_active_char(char_id: String) -> serde_json::Value {
    inventory::set_active_char(&profile::live_files(), &char_id)
}

#[tauri::command]
async fn open_account_for_sync(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("account") {
        window.show().map_err(|error| error.to_string())?;
        return window.set_focus().map_err(|error| error.to_string());
    }
    open_site(app, "account".into(), "https://account.aq.com/".into(), Some("AQW Account".into())).await
}

#[tauri::command]
async fn sync_inventory_now(app: tauri::AppHandle, webview: tauri::Webview) -> serde_json::Value {
    account_sync::sync(app, Some(webview.label().to_string())).await
}

#[tauri::command]
async fn fetch_wiki_page(url: String) -> serde_json::Value {
    tauri::async_runtime::spawn_blocking(move || {
        inventory::fetch_wiki(&url, |target| inventory::live_get(target, ""))
    })
    .await
    .unwrap_or_else(|error| serde_json::json!({ "ok": false, "error": error.to_string() }))
}

#[tauri::command]
fn match_wiki_item(title: String) -> serde_json::Value {
    inventory::match_title(&profile::live_files(), &title)
}

#[tauri::command]
fn match_wiki_items(titles: Vec<String>) -> serde_json::Value {
    inventory::match_titles(&profile::live_files(), &titles)
}

#[tauri::command]
async fn open_inventory_item_wiki(app: tauri::AppHandle, item_name: String) -> Result<(), String> {
    let slug = inventory::wiki_slug(&item_name);
    if slug.is_empty() {
        return Err("bad item".into());
    }
    open_site(app, "wiki".into(), format!("https://aqwwiki.wikidot.com/{slug}"), None).await
}

struct TimerShortcut(std::sync::Mutex<Option<tauri_plugin_global_shortcut::Shortcut>>);
struct ShortcutBook(std::sync::Mutex<std::collections::HashMap<tauri_plugin_global_shortcut::Shortcut, String>>);

fn shortcut_from(accel: &profile::Accelerator) -> Option<tauri_plugin_global_shortcut::Shortcut> {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    let mut mods = Modifiers::empty();
    if accel.alt {
        mods |= Modifiers::ALT;
    }
    if accel.shift {
        mods |= Modifiers::SHIFT;
    }
    if accel.control {
        mods |= Modifiers::CONTROL;
    }
    if accel.meta {
        mods |= Modifiers::SUPER;
    }
    if accel.command_or_control {
        mods |= if cfg!(target_os = "macos") { Modifiers::META } else { Modifiers::CONTROL };
    }
    let key = accel.key.as_str();
    let code = if key.len() == 1 && key.chars().next().unwrap().is_ascii_alphabetic() {
        Code::from_str(&format!("Key{}", key.to_ascii_uppercase())).ok()?
    } else if key.len() == 1 && key.chars().next().unwrap().is_ascii_digit() {
        Code::from_str(&format!("Digit{key}")).ok()?
    } else if key.starts_with('F') && key[1..].parse::<u8>().is_ok() {
        Code::from_str(key).ok()?
    } else {
        match key.to_ascii_lowercase().as_str() {
            "esc" | "escape" => Code::Escape,
            "space" => Code::Space,
            "enter" | "return" => Code::Enter,
            "tab" => Code::Tab,
            "up" => Code::ArrowUp,
            "down" => Code::ArrowDown,
            "left" => Code::ArrowLeft,
            "right" => Code::ArrowRight,
            _ => return None,
        }
    };
    Some(Shortcut::new(Some(mods), code))
}

#[tauri::command]
fn set_strategy_timer_shortcut(app: tauri::AppHandle, key: String) -> serde_json::Value {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let state = app.state::<TimerShortcut>();
    let mut slot = state.0.lock().unwrap_or_else(|err| err.into_inner());
    if let Some(previous) = slot.take() {
        let _ = app.global_shortcut().unregister(previous);
    }
    let key = key.trim();
    if key.is_empty() {
        return serde_json::json!({ "ok": true });
    }
    let Some(accel) = profile::parse_accelerator(key) else {
        return serde_json::json!({ "ok": false, "error": "invalid" });
    };
    let Some(shortcut) = shortcut_from(&accel) else {
        return serde_json::json!({ "ok": false, "error": "invalid" });
    };
    match app.global_shortcut().register(shortcut) {
        Ok(()) => {
            *slot = Some(shortcut);
            serde_json::json!({ "ok": true })
        }
        Err(_) => serde_json::json!({ "ok": false, "error": "unavailable" }),
    }
}

#[tauri::command]
fn clear_strategy_timer_shortcut(app: tauri::AppHandle) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let state = app.state::<TimerShortcut>();
    let mut slot = state.0.lock().unwrap_or_else(|err| err.into_inner());
    if let Some(previous) = slot.take() {
        let _ = app.global_shortcut().unregister(previous);
    }
}

#[tauri::command]
async fn open_site(app: tauri::AppHandle, label: String, url: String, title: Option<String>) -> Result<(), String> {
    let parsed = allowed_site(&url)?;
    let title = title.unwrap_or_else(|| label.clone());
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.navigate(parsed);
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(format!("AquaStar - {title}"))
        .inner_size(1100.0, 750.0)
        .initialization_script_for_all_frames(ads::init_script())
        .on_page_load(|window, payload| {
            if payload.event() != tauri::webview::PageLoadEvent::Finished {
                return;
            }
            let script = inventory::page_script(payload.url().as_str());
            if !script.is_empty() {
                let _ = window.eval(&script);
            }
        })
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

#[tauri::command]
fn get_shell_pages() -> serde_json::Value {
    manifest::shell_pages(current_language().as_str())
}

#[tauri::command]
async fn open_project_page(app: tauri::AppHandle) -> Result<(), String> {
    let url = manifest::releases_url().to_string();
    let title = manifest::about_dialog(current_language().as_str()).primary;
    open_site(app, "project".into(), url, Some(title)).await
}

fn current_language() -> String {
    let files = profile::live_files();
    manifest::resolve_language(&profile::setting_str(&files, "appLanguage")).to_string()
}

fn focused_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    app.webview_windows()
        .into_values()
        .find(|window| window.is_focused().unwrap_or(false))
        .or_else(|| app.get_webview_window("main"))
}

fn open_dialog(app: &tauri::AppHandle, label: &str, dialog: manifest::Dialog, width: f64, height: f64) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.set_focus();
        return;
    }
    let script = format!(
        "window.__aquastarDialog = {};",
        serde_json::to_string(&dialog).unwrap_or_else(|_| "{}".into())
    );
    let (app, label) = (app.clone(), label.to_string());
    tauri::async_runtime::spawn(async move {
        let _ = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(profile::feature_page(&label).into()))
            .title(dialog.title)
            .inner_size(width, height)
            .initialization_script(script)
            .build();
    });
}

fn dispatch(app: &tauri::AppHandle, id: &str, from_menu: bool) {
    if extensions::dispatch_action(app, id) { return; }
    let Some(command) = manifest::command_for(id) else {
        return;
    };
    match command.action.as_str() {
        "about" => open_dialog(app, "about", manifest::about_dialog(current_language().as_str()), 520.0, 420.0),
        "help" => {
            let files = profile::live_files();
            let merged = profile::merged_settings(&files);
            let mut current = std::collections::HashMap::new();
            for bind in manifest::keybinds() {
                current.insert(bind.id.clone(), manifest::accelerators(&bind, merged.get(&bind.id)));
            }
            open_dialog(app, "help", manifest::help_dialog(current_language().as_str(), Some(&current)), 560.0, 480.0);
        }
        "fullscreen" => {
            if let Some(window) = focused_window(app) {
                let next = !window.is_fullscreen().unwrap_or(false);
                let _ = window.set_fullscreen(next);
            }
        }
        "reload" => {
            if let Some(window) = focused_window(app) {
                let _ = window.eval("location.reload()");
            }
        }
        "reload-cache" => {
            if let Some(window) = focused_window(app) {
                let _ = window.eval("location.reload(true)");
            }
        }
        "forward" => {
            if let Some(window) = focused_window(app) {
                let _ = window.eval("history.forward()");
            }
        }
        "backward" => {
            if let Some(window) = focused_window(app) {
                let _ = window.eval("history.back()");
            }
        }
        "settings" => {
            spawn_tool(app, "settings".into());
        }
        "tool" => {
            spawn_tool(app, command.target);
        }
        "page" => {
            let lang = current_language();
            let url = if command.target == "charpage" && !from_menu {
                let name = profile::setting_str(&profile::live_files(), "playerCharacter");
                manifest::charpage_url(&name)
            } else {
                manifest::page_url(&command.target).unwrap_or_default()
            };
            if url.is_empty() {
                return;
            }
            let app = app.clone();
            let label = command.target.clone();
            let title = manifest::page_label(lang.as_str(), &label);
            tauri::async_runtime::spawn(async move {
                let _ = open_site(app, label, url, Some(title)).await;
            });
        }
        "play-primary" => spawn_play(app, MovieKind::Primary),
        "play-dragonfable" => spawn_play(app, MovieKind::DragonFable),
        _ => {}
    }
}

fn spawn_play(app: &tauri::AppHandle, movie: MovieKind) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let engine = Engine::preferred().unwrap_or(Engine::Ruffle);
        let _ = play(app, engine, movie).await;
    });
}

fn register_saved_shortcuts(app: &tauri::AppHandle) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let merged = profile::merged_settings(&profile::live_files());
    let mut map = std::collections::HashMap::new();
    for bind in manifest::keybinds() {
        for accel in manifest::accelerators(&bind, merged.get(&bind.id)) {
            let Some(parsed) = profile::parse_accelerator(&accel) else {
                eprintln!("aquastar-lite: skipping invalid shortcut {accel} for {}", bind.id);
                continue;
            };
            let Some(shortcut) = shortcut_from(&parsed) else {
                eprintln!("aquastar-lite: cannot map shortcut {accel} for {}", bind.id);
                continue;
            };
            match app.global_shortcut().register(shortcut) {
                Ok(()) => {
                    map.insert(shortcut, bind.id.clone());
                }
                Err(err) => {
                    eprintln!("aquastar-lite: shortcut {accel} for {} was not registered ({err})", bind.id);
                }
            }
        }
    }
    *app.state::<ShortcutBook>().0.lock().unwrap_or_else(|err| err.into_inner()) = map;
}

fn schedule_inventory_sync(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(30));
        loop {
            let files = profile::live_files();
            if inventory::auto_sync_enabled(&files) && inventory::auto_sync_due(&files.inventory, chrono::Utc::now().timestamp_millis()) {
                let _ = account_sync::sync_blocking(&app, &files.inventory, None);
            }
            std::thread::sleep(std::time::Duration::from_secs(2 * 60 * 60));
        }
    });
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

fn app_context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
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
    let mut context = app_context();
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
    let extension_root = match &placement {
        placement::Placement::Portable(_) => std::env::current_exe().unwrap().parent().unwrap().join("data"),
        placement::Placement::Installed => dirs::data_dir().expect("Application data directory").join(context.config().identifier.clone()),
    };
    let extension_state = extensions::Extensions::load(extension_root);
    let extension_sources = extension_state.sources();
    let app = extensions::runtime::configure(tauri::Builder::default(), extension_sources)
        .manage(extension_state)
        .manage(menu_visibility::Visibility::default())
        .on_page_load(|webview, _| menu_visibility::apply_to_window(webview))
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, event| {
            if event.state != tauri_plugin_global_shortcut::ShortcutState::Pressed {
                return;
            }
            let timer = app.state::<TimerShortcut>();
            let slot = timer.0.lock().unwrap_or_else(|err| err.into_inner());
            if slot.as_ref() == Some(shortcut) {
                drop(slot);
                if let Some(window) = app.get_webview_window("strategy") {
                    let _ = window.eval("window.__aquastarTimerToggle&&window.__aquastarTimerToggle()");
                }
                return;
            }
            drop(slot);
            let id = {
                let book = app.state::<ShortcutBook>();
                let map = book.0.lock().unwrap_or_else(|err| err.into_inner());
                map.get(shortcut).cloned()
            };
            if let Some(id) = id {
                dispatch(app, &id, false);
            }
        }).build())
        .manage(placement)
        .manage(Players::default())
        .manage(TimerShortcut(std::sync::Mutex::new(None)))
        .manage(ShortcutBook(std::sync::Mutex::new(std::collections::HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            play,
            launcher::launcher_model,
            launcher::play_game,
            launcher::launcher_search,
            extensions::extensions_list,
            extensions::extensions_install,
            extensions::extensions_change,
            extensions::extensions_action,
            extensions::extensions_restart,
            extensions::runtime::extension_invoke,
            engines,
            preferred_engine,
            open_site,
            open_tool,
            get_keybindings,
            get_settings_messages,
            save_keybindings,
            get_ruffle_status,
            update_ruffle,
            restore_bundled_ruffle,
            restart_app,
            get_custom_swf_status,
            choose_custom_swf,
            remove_custom_swf,
            get_plugin_list,
            get_plugin_settings,
            get_settings_layout,
            get_reminders,
            get_reminders_messages,
            save_reminders,
            get_todo,
            get_todo_messages,
            save_todo,
            open_todo_link,
            get_strategy,
            get_strategy_messages,
            save_strategy,
            get_inventory_item_counts,
            get_inventory,
            get_inventory_messages,
            get_wiki_messages,
            save_inventory_labels,
            set_inventory_active_char,
            sync_inventory_now,
            open_account_for_sync,
            fetch_wiki_page,
            match_wiki_item,
            match_wiki_items,
            open_inventory_item_wiki,
            set_strategy_timer_shortcut,
            clear_strategy_timer_shortcut,
            ruffle_settings,
            set_ruffle_settings,
            launcher_settings,
            set_show_menu_bar,
            set_hide_launcher,
            get_shell_pages,
            open_project_page
        ])
        .setup(|app| {
            app.state::<extensions::Extensions>().finish_startup();
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(Path::to_path_buf));
            let profile = placement::electron_profile(exe_dir.as_deref());
            std::thread::spawn(move || players::warm_loader(&profile));
            schedule_smoke(app.handle().clone());
            schedule_inventory_sync(app.handle().clone());
            let show_menu = app.path().app_config_dir().ok().map(|dir| ruffle::load_show_menu_bar(&dir)).unwrap_or(false);
            app.state::<menu_visibility::Visibility>().set(show_menu);
            let lang = current_language();
            if let Err(err) = manifest::install_menu(app.handle(), lang.as_str()) {
                eprintln!("aquastar-lite: menu was not installed ({err})");
            }
            app.handle().on_menu_event(|app, event| {
                dispatch(app, event.id().0.as_str(), true);
            });
            register_saved_shortcuts(app.handle());
            extensions::install_contributions(app.handle());
            if let Err(error) = menu_visibility::apply(app.handle()) {
                eprintln!("AquaStar: could not apply menu visibility: {error}");
            }
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
    fn obsolete_testing_is_absent_from_the_launcher_and_manifest() {
        let ui = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../ui");
        let html = std::fs::read_to_string(ui.join("index.html")).unwrap();
        assert!(!html.contains("data-movie=\"testing\""));
        let game = include_str!("../games/adventure-quest-worlds.json");
        assert!(!game.contains("play-testing"));
        assert!(!game.contains("newTest"));
        assert!(!game.contains("Alt+Q"));
    }

    #[test]
    fn product_strings_say_aquastar_3() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let read = |path: &str| std::fs::read_to_string(root.join(path)).unwrap();
        let lite = format!("{} {}", "AquaStar", "Lite");
        let cargo = read("Cargo.toml");
        let conf = read("tauri.conf.json");
        assert!(cargo.contains("name = \"aquastar-lite\""));
        assert!(cargo.contains(&format!("version = \"{}\"", env!("CARGO_PKG_VERSION"))));
        assert!(!cargo.contains(&lite));
        let parsed: serde_json::Value = serde_json::from_str(&conf).unwrap();
        assert_eq!(parsed["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(parsed["productName"], "AquaStar");
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
        assert!(visible[4].contains("PLAYER_TITLE: &str = \"AquaStar\""));
        assert!(visible[2].lines().any(|line| line == "Name=AquaStar"));
        assert!(visible[7].contains("<string>AquaStar</string>"));
    }
}
