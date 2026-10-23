#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod account_sync;
mod ads;
mod capture;
mod cli;
mod extensions;
#[cfg(target_os = "linux")]
mod fonts;
mod hyprland_shortcuts;
mod inventory;
mod launcher;
mod manifest;
mod menu_visibility;
mod placement;
mod players;
#[cfg(target_os = "linux")]
mod portal_identity;
mod profile;
mod ruffle;
mod startup;
mod studio;

use std::path::Path;
#[cfg(target_os = "linux")]
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use players::Engine;
use players::MovieKind;
use players::Players;
#[cfg(target_os = "linux")]
use players::LIMITED_FONTS_MARKER;
use serde::Serialize;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

#[derive(Clone, Default)]
struct RestartAdmission(Arc<Mutex<bool>>);

impl RestartAdmission {
    fn try_restart(
        &self,
        capture: &capture::CaptureState,
    ) -> Result<RestartAdmissionGuard, String> {
        let mut active = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if *active {
            return Err("A player restart is already in progress.".into());
        }
        if capture.active() {
            return Err("Stop the active recording before restarting the game.".into());
        }
        *active = true;
        Ok(RestartAdmissionGuard(self.0.clone()))
    }

    fn with_recording_start<T>(
        &self,
        start: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        let active = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if *active {
            return Err("A player restart is in progress.".into());
        }
        start()
    }

    fn active(&self) -> bool {
        *self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

struct RestartAdmissionGuard(Arc<Mutex<bool>>);

impl Drop for RestartAdmissionGuard {
    fn drop(&mut self) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = false;
    }
}

fn hide_launcher_enabled(app: &tauri::AppHandle) -> bool {
    app.path()
        .app_config_dir()
        .map(|dir| ruffle::load_hide_launcher(&dir))
        .unwrap_or(false)
}

#[derive(Default)]
struct HideLauncherTrace {
    hide: bool,
    config_dir_ms: f64,
    persistence_ms: f64,
    sync_ms: f64,
    shortcut_total_ms: f64,
    shortcut_cleanup_ms: f64,
    capture_shortcut_sync_ms: f64,
    wayland_shortcut_sync_ms: f64,
    profile_merge_ms: f64,
    native_registration_ms: f64,
    sync_outcome: &'static str,
}

impl HideLauncherTrace {
    fn log(&self, total: Instant) {
        let trace = serde_json::json!({
            "hide": self.hide,
            "total_ms": total.elapsed().as_secs_f64() * 1000.0,
            "config_dir_ms": self.config_dir_ms,
            "persistence_ms": self.persistence_ms,
            "sync_ms": self.sync_ms,
            "shortcut_total_ms": self.shortcut_total_ms,
            "shortcut_cleanup_ms": self.shortcut_cleanup_ms,
            "capture_shortcut_sync_ms": self.capture_shortcut_sync_ms,
            "wayland_shortcut_sync_ms": self.wayland_shortcut_sync_ms,
            "profile_merge_ms": self.profile_merge_ms,
            "native_registration_ms": self.native_registration_ms,
            "sync_outcome": self.sync_outcome,
        });
        eprintln!("[hide-launcher-trace] {trace}");
    }
}

fn hide_launcher_trace_enabled() -> bool {
    matches!(
        std::env::var("AQUASTAR_TRACE_HIDE_LAUNCHER").as_deref(),
        Ok("1")
    )
}

fn sync_launcher(app: &tauri::AppHandle) {
    sync_launcher_inner(app, None, true);
}

fn sync_launcher_visibility(app: &tauri::AppHandle) {
    sync_launcher_inner(app, None, false);
}

fn sync_launcher_for_hide_setting(app: &tauri::AppHandle, trace: &mut HideLauncherTrace) {
    let started = Instant::now();
    // This setting only changes launcher visibility. Re-registering every native
    // shortcut here can take seconds on Linux and does not affect the preference.
    sync_launcher_inner(app, Some(trace), false);
    trace.sync_ms = started.elapsed().as_secs_f64() * 1000.0;
}

fn sync_launcher_inner(
    app: &tauri::AppHandle,
    trace: Option<&mut HideLauncherTrace>,
    register_shortcuts: bool,
) {
    let mut trace = trace;
    let presence = app.state::<Players>().current_presence();
    if presence == players::Presence::Idle && app.state::<RestartAdmission>().active() {
        if let Some(trace) = trace.as_deref_mut() {
            trace.sync_outcome = "restart-suppressed";
        }
        return;
    }
    if presence == players::Presence::Idle && app.state::<capture::CaptureState>().active() {
        if let Some(trace) = trace.as_deref_mut() {
            trace.sync_outcome = "capture-suppressed";
        }
        return;
    }
    // Started straight into a game: there is no launcher to bring back, so AquaStar NEO ends
    // with the game.
    if app.state::<startup::StartupState>().is_direct() {
        if register_shortcuts {
            register_shortcuts_for_sync(app, &mut trace);
        }
        if let Some(trace) = trace.as_deref_mut() {
            trace.sync_outcome = "direct-start";
        }
        if presence == players::Presence::Idle {
            app.exit(0);
        }
        return;
    }
    let Some(window) = app.get_webview_window("main") else {
        if let Some(trace) = trace.as_deref_mut() {
            trace.sync_outcome = "no-main-window";
        }
        return;
    };
    match (presence, hide_launcher_enabled(app)) {
        (players::Presence::Running, true) => {
            if !app.state::<startup::StartupState>().launcher_requested() {
                let _ = window.hide();
            }
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
    if register_shortcuts {
        register_shortcuts_for_sync(app, &mut trace);
    }
    if let Some(trace) = trace.as_deref_mut() {
        trace.sync_outcome = "launcher-window";
    }
}

fn register_shortcuts_for_sync(app: &tauri::AppHandle, trace: &mut Option<&mut HideLauncherTrace>) {
    if let Some(trace) = trace.as_deref_mut() {
        register_saved_shortcuts_with_trace(app, trace);
    } else {
        register_saved_shortcuts(app);
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
    let trace_enabled = hide_launcher_trace_enabled();
    let total_started = Instant::now();
    let mut trace = HideLauncherTrace {
        hide,
        ..HideLauncherTrace::default()
    };
    let phase_started = Instant::now();
    let dir = config_dir(&app)?;
    trace.config_dir_ms = phase_started.elapsed().as_secs_f64() * 1000.0;
    let phase_started = Instant::now();
    ruffle::save_hide_launcher(&dir, hide)?;
    trace.persistence_ms = phase_started.elapsed().as_secs_f64() * 1000.0;
    if hide {
        app.state::<startup::StartupState>().game_launching();
    }
    if trace_enabled {
        sync_launcher_for_hide_setting(&app, &mut trace);
        trace.log(total_started);
    } else {
        sync_launcher_visibility(&app);
    }
    Ok(LauncherSettings {
        hide_launcher: hide,
        show_menu_bar: app.state::<menu_visibility::Visibility>().get(),
        menu_bar_supported: !cfg!(target_os = "macos"),
    })
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

fn player_roots(app: &tauri::AppHandle) -> Result<placement::PlayerRoots, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let resource_dir = app.path().resource_dir().ok();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf));
    let placement = app.state::<placement::Placement>().inner().clone();
    Ok(placement.player_roots(&app_data, resource_dir.as_deref(), exe_dir.as_deref()))
}

fn load_ruffle_settings(app: &tauri::AppHandle) -> ruffle::RuffleSettings {
    match app.path().app_config_dir() {
        Ok(dir) => ruffle::RuffleSettings::load(&dir),
        Err(e) => {
            eprintln!("aquastar-neo: no config dir ({e}); using default Ruffle settings");
            ruffle::RuffleSettings::default()
        }
    }
}

async fn game_launch_with_visibility(
    app: &tauri::AppHandle,
    launch: impl std::future::Future<Output = Result<String, String>>,
) -> Result<String, String> {
    app.state::<startup::StartupState>().game_launching();
    let restore_on_error = if hide_launcher_enabled(app) {
        if let Some(window) = app.get_webview_window("main") {
            let visible = window.is_visible().unwrap_or(false);
            if visible {
                let _ = window.hide();
            }
            visible
        } else {
            false
        }
    } else {
        false
    };
    let result = launch.await;
    if result.is_err() && restore_on_error {
        startup::show_main(app);
    }
    result
}

#[tauri::command]
async fn play(app: tauri::AppHandle, engine: Engine, movie: MovieKind) -> Result<String, String> {
    play_movie_with_mode(app, engine, movie, false).await
}

async fn play_movie_with_mode(
    app: tauri::AppHandle,
    engine: Engine,
    movie: MovieKind,
    new_instance: bool,
) -> Result<String, String> {
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
    game_launch_with_visibility(&app, async move {
        tauri::async_runtime::spawn_blocking(move || {
            if new_instance {
                players.launch_movie_instance(
                    &roots,
                    engine,
                    &profile,
                    movie,
                    &settings,
                    saves.as_deref(),
                )
            } else {
                players.launch_movie(&roots, engine, &profile, movie, &settings, saves.as_deref())
            }
        })
        .await
        .map_err(|e| e.to_string())?
    })
    .await
}

fn new_instance_engine() -> Result<Engine, String> {
    let configured = profile::setting_str(&profile::live_files(), "newInstanceEngine");
    let engine = match configured.as_str() {
        "" | "automatic" => Engine::preferred(),
        other => Engine::from_id(other),
    }
    .ok_or_else(|| "No game player is available on this system.".to_string())?;
    if !engine.supported() {
        return Err(format!(
            "{} is not available on this system. Choose another player in Preferences.",
            engine.id()
        ));
    }
    Ok(engine)
}

#[tauri::command]
async fn restart_ruffle(app: tauri::AppHandle) -> Result<String, String> {
    restart_player(app, Engine::Ruffle).await
}

#[tauri::command]
async fn restart_flash(app: tauri::AppHandle) -> Result<String, String> {
    restart_player(app, Engine::Flash).await
}

async fn restart_player(app: tauri::AppHandle, engine: Engine) -> Result<String, String> {
    let admission = app.state::<RestartAdmission>().inner().clone();
    let capture = app.state::<capture::CaptureState>().inner().clone();
    let _guard = admission.try_restart(&capture)?;
    let players = app.state::<Players>().inner().clone();
    let result = if !players.has_live(engine) {
        Err(format!("No active {engine:?} game to restart"))
    } else {
        game_launch_with_visibility(&app, async move {
            tauri::async_runtime::spawn_blocking(move || players.restart(engine))
                .await
                .map_err(|error| error.to_string())?
        })
        .await
    };
    if result.is_err() {
        startup::show_main(&app);
    }
    drop(_guard);
    sync_launcher(&app);
    result
}

async fn play_extension(
    app: tauri::AppHandle,
    source: String,
    engine: Engine,
) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let resource_dir = app.path().resource_dir().ok();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf));
    let placement = app.state::<placement::Placement>().inner().clone();
    let roots = placement.player_roots(&app_data, resource_dir.as_deref(), exe_dir.as_deref());
    let settings = load_ruffle_settings(&app);
    let saves = placement.ruffle_save_directory().map(Path::to_path_buf);
    let players = app.state::<Players>().inner().clone();
    game_launch_with_visibility(&app, async move {
        tauri::async_runtime::spawn_blocking(move || {
            players.launch_source(&roots, engine, &source, &settings, saves.as_deref())
        })
        .await
        .map_err(|e| e.to_string())?
    })
    .await
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
            eprintln!("aquastar-neo: could not open {name}: {error}");
        }
    });
}

fn open_tool_window(app: &tauri::AppHandle, name: &str) -> Result<(), String> {
    if name == "settings" {
        startup::open_preferences(app);
        return Ok(());
    }
    let (title, width, height) =
        profile::tool_spec(name).ok_or_else(|| format!("unknown window {name}"))?;
    if let Some(window) = app.get_webview_window(name) {
        let _ = window.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(
        app,
        name,
        WebviewUrl::App(profile::feature_page(name).into()),
    )
    .title(title)
    .inner_size(width, height)
    .build()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_profile_preferences() -> Result<profile::ProfilePreferences, String> {
    profile::profile_preferences(&profile::live_files())
}

#[tauri::command]
fn change_profile_preference(
    app: tauri::AppHandle,
    change: profile::ProfilePreferenceChange,
) -> Result<profile::ProfilePreferences, String> {
    let refresh_shortcuts = matches!(change, profile::ProfilePreferenceChange::Keybind(_));
    let saved = profile::change_profile_preference(&profile::live_files(), change)?;
    if refresh_shortcuts {
        let app = app.clone();
        if let Err(error) = app.clone().run_on_main_thread(move || {
            register_saved_shortcuts_inner(&app, None);
            let lang = current_language();
            if let Err(err) = manifest::install_menu(&app, lang.as_str()) {
                eprintln!("aquastar-neo: menu was not installed ({err})");
            } else {
                extensions::install_contributions(&app);
            }
        }) {
            eprintln!("aquastar-neo: saved shortcut was not applied ({error})");
        }
    }
    Ok(saved)
}

#[tauri::command]
fn get_hyprland_shortcut_setup() -> hyprland_shortcuts::SetupStatus {
    hyprland_shortcuts::status()
}

#[tauri::command]
fn setup_hyprland_shortcuts() -> Result<hyprland_shortcuts::SetupStatus, String> {
    hyprland_shortcuts::install()
}

#[tauri::command]
fn remove_hyprland_shortcuts() -> Result<hyprland_shortcuts::SetupStatus, String> {
    hyprland_shortcuts::remove()
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
fn restart_app(app: tauri::AppHandle) {
    app.restart();
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
        .title("AquaStar NEO - To-Do")
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
    open_site(
        app,
        "account".into(),
        "https://account.aq.com/".into(),
        Some("AQW Account".into()),
    )
    .await
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
    open_site(
        app,
        "wiki".into(),
        format!("https://aqwwiki.wikidot.com/{slug}"),
        None,
    )
    .await
}

struct TimerShortcut(std::sync::Mutex<Option<tauri_plugin_global_shortcut::Shortcut>>);
struct ShortcutBook(
    std::sync::Mutex<std::collections::HashMap<tauri_plugin_global_shortcut::Shortcut, String>>,
);

pub(crate) fn shortcut_from(
    accel: &profile::Accelerator,
) -> Option<tauri_plugin_global_shortcut::Shortcut> {
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
        mods |= if cfg!(target_os = "macos") {
            Modifiers::META
        } else {
            Modifiers::CONTROL
        };
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
async fn open_site(
    app: tauri::AppHandle,
    label: String,
    url: String,
    title: Option<String>,
) -> Result<(), String> {
    let parsed = allowed_site(&url)?;
    let title = title.unwrap_or_else(|| label.clone());
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.navigate(parsed);
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(format!("AquaStar NEO - {title}"))
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
        eprintln!("aquastar-neo: FONTCONFIG_FILE is set, leaving WebKit fonts alone");
        return;
    }
    let dirs: Vec<PathBuf> = fonts::SEARCH_DIRS.iter().map(PathBuf::from).collect();
    let installed = fonts::base_dir()
        .and_then(|base| fonts::install(&base, &dirs, Path::new("/etc/fonts/conf.d")));
    match installed {
        Ok((conf, count)) => {
            eprintln!("aquastar-neo: WebKit uses {} ({count} font files)", conf.display());
            std::env::set_var("FONTCONFIG_FILE", &conf);
            std::env::set_var(LIMITED_FONTS_MARKER, "1");
        }
        Err(e) => eprintln!(
            "aquastar-neo: could not write the WebKit fontconfig ({e}); using system fonts, the window may stay blank"
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
    let caption = wide("AquaStar NEO");
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
            eprintln!("aquastar-neo: ignoring AQUASTAR_LITE_SMOKE={value}");
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

#[tauri::command]
fn show_about(app: tauri::AppHandle) {
    open_dialog(
        &app,
        "about",
        manifest::about_dialog(current_language().as_str()),
        520.0,
        420.0,
    );
}

#[tauri::command]
fn close_dialog(window: tauri::WebviewWindow) -> Result<(), String> {
    match window.label() {
        "about" | "help" => window.close().map_err(|error| error.to_string()),
        _ => Err("This window cannot be closed with the dialog action.".into()),
    }
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

fn open_dialog(
    app: &tauri::AppHandle,
    label: &str,
    dialog: manifest::Dialog,
    width: f64,
    height: f64,
) {
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
        let _ = WebviewWindowBuilder::new(
            &app,
            &label,
            WebviewUrl::App(profile::feature_page(&label).into()),
        )
        .title(dialog.title)
        .inner_size(width, height)
        .initialization_script(script)
        .build();
    });
}

fn dispatch(app: &tauri::AppHandle, id: &str, from_menu: bool) {
    // A menu key equivalent and the global hotkey can both deliver one
    // keypress while the launcher is focused. Record would toggle twice and
    // a screenshot would be taken twice.
    if !begin_shortcut_action(id) {
        return;
    }
    if extensions::dispatch_action(app, id) {
        return;
    }
    let Some(command) = manifest::command_for(id) else {
        return;
    };
    match command.action.as_str() {
        "help" => {
            let files = profile::live_files();
            let merged = profile::merged_settings(&files);
            let mut current = std::collections::HashMap::new();
            for bind in manifest::keybinds() {
                current.insert(
                    bind.id.clone(),
                    manifest::accelerators(&bind, merged.get(&bind.id)),
                );
            }
            open_dialog(
                app,
                "help",
                manifest::help_dialog(current_language().as_str(), Some(&current)),
                560.0,
                480.0,
            );
        }
        "fullscreen" => {
            if let Some(window) = focused_window(app) {
                let next = !window.is_fullscreen().unwrap_or(false);
                let _ = window.set_fullscreen(next);
            }
        }
        "settings" => {
            startup::open_preferences(app);
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
        "capture" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                capture::open_controls(&app).await;
            });
        }
        "sshot" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = capture::screenshot(app.clone(), None).await {
                    capture::screenshot_failed(&app, error);
                }
            });
        }
        "record" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                capture::toggle(app).await;
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
        match new_instance_engine() {
            Ok(engine) => {
                if let Err(error) = play_movie_with_mode(app, engine, movie, true).await {
                    eprintln!(
                        "aquastar-neo: could not open new {:?} instance: {error}",
                        movie
                    );
                }
            }
            Err(error) => {
                eprintln!("aquastar-neo: could not choose a player for a new instance: {error}")
            }
        }
    });
}

fn extension_bindings(
    book: &std::collections::HashMap<tauri_plugin_global_shortcut::Shortcut, String>,
) -> Vec<(tauri_plugin_global_shortcut::Shortcut, String)> {
    let mut kept: Vec<_> = book
        .iter()
        .filter(|(_, id)| id.starts_with("extension:"))
        .map(|(shortcut, id)| (*shortcut, id.clone()))
        .collect();
    kept.sort_by(|left, right| left.1.cmp(&right.1));
    kept
}

fn register_saved_shortcuts(app: &tauri::AppHandle) {
    let app = app.clone();
    // Setup runs on the main thread, so this closure runs inline and the book
    // is populated before plugin contributions read it. The presence reaper
    // calls this off the main thread: queue the refresh and return. Waiting
    // there stalls process cleanup, and the old unregister-all path dropped
    // every hotkey when the later register did not land.
    if let Err(error) =
        app.clone()
            .run_on_main_thread(move || register_saved_shortcuts_inner(&app, None))
    {
        eprintln!("aquastar-neo: could not refresh shortcuts ({error})");
    }
}

fn register_saved_shortcuts_with_trace(app: &tauri::AppHandle, trace: &mut HideLauncherTrace) {
    register_saved_shortcuts_inner(app, Some(trace));
}

fn register_saved_shortcuts_inner(app: &tauri::AppHandle, trace: Option<&mut HideLauncherTrace>) {
    let mut trace = trace;
    let total_started = trace.as_ref().map(|_| Instant::now());
    let phase_started = trace.as_ref().map(|_| Instant::now());
    capture::sync_shortcuts(app);
    if let (Some(trace), Some(started)) = (trace.as_deref_mut(), phase_started) {
        trace.capture_shortcut_sync_ms = started.elapsed().as_secs_f64() * 1000.0;
    }
    #[cfg(target_os = "linux")]
    {
        let phase_started = trace.as_ref().map(|_| Instant::now());
        capture::wayland_shortcuts::sync(app);
        if let (Some(trace), Some(started)) = (trace.as_deref_mut(), phase_started) {
            trace.wayland_shortcut_sync_ms = started.elapsed().as_secs_f64() * 1000.0;
        }
    }
    let old = app
        .state::<ShortcutBook>()
        .0
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .clone();
    let phase_started = trace.as_ref().map(|_| Instant::now());
    let desired = desired_shortcut_book(app, &old);
    if let (Some(trace), Some(started)) = (trace.as_deref_mut(), phase_started) {
        trace.profile_merge_ms = started.elapsed().as_secs_f64() * 1000.0;
    }
    let phase_started = trace.as_ref().map(|_| Instant::now());
    let next = commit_shortcut_book(app, &old, &desired);
    if let (Some(trace), Some(started)) = (trace.as_deref_mut(), phase_started) {
        trace.native_registration_ms = started.elapsed().as_secs_f64() * 1000.0;
    }
    *app.state::<ShortcutBook>()
        .0
        .lock()
        .unwrap_or_else(|err| err.into_inner()) = next;
    if let (Some(trace), Some(started)) = (trace.as_deref_mut(), total_started) {
        trace.shortcut_total_ms = started.elapsed().as_secs_f64() * 1000.0;
    }
}

fn desired_shortcut_book(
    app: &tauri::AppHandle,
    old: &std::collections::HashMap<tauri_plugin_global_shortcut::Shortcut, String>,
) -> std::collections::HashMap<tauri_plugin_global_shortcut::Shortcut, String> {
    let mut desired = std::collections::HashMap::new();
    // Wayland has no X11 global shortcuts. Leave app chords out of the book so
    // the refresh releases them and the portal owns capture.
    if !capture::is_wayland() {
        let running = !app.state::<Players>().capture_pids().is_empty();
        let merged = profile::merged_settings(&profile::live_files());
        for bind in manifest::keybinds() {
            if matches!(bind.id.as_str(), "sshot" | "record")
                && (!running || capture::gnome_shortcuts_enabled(app))
            {
                continue;
            }
            for accel in manifest::accelerators(&bind, merged.get(&bind.id)) {
                let Some(parsed) = profile::parse_accelerator(&accel) else {
                    eprintln!(
                        "aquastar-neo: skipping invalid shortcut {accel} for {}",
                        bind.id
                    );
                    continue;
                };
                let Some(shortcut) = shortcut_from(&parsed) else {
                    eprintln!("aquastar-neo: cannot map shortcut {accel} for {}", bind.id);
                    continue;
                };
                if let Some(previous) = desired.insert(shortcut, bind.id.clone()) {
                    eprintln!(
                        "aquastar-neo: shortcut {accel} for {} replaces {previous}",
                        bind.id
                    );
                }
            }
        }
    }
    for (shortcut, id) in extension_bindings(old) {
        if desired.contains_key(&shortcut) {
            eprintln!(
                "aquastar-neo: extension shortcut for {id} was not registered (already reserved)"
            );
            continue;
        }
        desired.insert(shortcut, id);
    }
    desired
}

fn commit_shortcut_book(
    app: &tauri::AppHandle,
    old: &std::collections::HashMap<tauri_plugin_global_shortcut::Shortcut, String>,
    desired: &std::collections::HashMap<tauri_plugin_global_shortcut::Shortcut, String>,
) -> std::collections::HashMap<tauri_plugin_global_shortcut::Shortcut, String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let mut next = std::collections::HashMap::new();
    for (shortcut, id) in desired {
        if old.get(shortcut) == Some(id) {
            next.insert(*shortcut, id.clone());
            continue;
        }
        if old.contains_key(shortcut) {
            let _ = app.global_shortcut().unregister(*shortcut);
        }
        match app.global_shortcut().register(*shortcut) {
            Ok(()) => {
                next.insert(*shortcut, id.clone());
            }
            Err(err) => {
                if app.global_shortcut().is_registered(*shortcut) {
                    next.insert(*shortcut, id.clone());
                    continue;
                }
                eprintln!("aquastar-neo: shortcut for {id} was not registered ({err})");
                if let Some(previous) = old.get(shortcut) {
                    if app.global_shortcut().register(*shortcut).is_ok() {
                        next.insert(*shortcut, previous.clone());
                    }
                }
            }
        }
    }
    for (shortcut, id) in old {
        if next.contains_key(shortcut) {
            continue;
        }
        let landed = next.values().any(|live| live == id);
        let wanted = desired.values().any(|wanted| wanted == id);
        if wanted && !landed {
            // The replacement chord did not register. Keep the working one.
            next.insert(*shortcut, id.clone());
            continue;
        }
        if let Err(err) = app.global_shortcut().unregister(*shortcut) {
            eprintln!("aquastar-neo: shortcut for {id} stayed registered ({err})");
            next.insert(*shortcut, id.clone());
        }
    }
    next
}

fn shortcut_book_delta(
    old: &std::collections::HashMap<tauri_plugin_global_shortcut::Shortcut, String>,
    desired: &std::collections::HashMap<tauri_plugin_global_shortcut::Shortcut, String>,
) -> (Vec<tauri_plugin_global_shortcut::Shortcut>, Vec<tauri_plugin_global_shortcut::Shortcut>) {
    let mut register = Vec::new();
    let mut unregister = Vec::new();
    for (shortcut, id) in desired {
        if old.get(shortcut) != Some(id) {
            register.push(*shortcut);
        }
    }
    for shortcut in old.keys() {
        if !desired.contains_key(shortcut) {
            unregister.push(*shortcut);
        }
    }
    register.sort_by_key(|shortcut| shortcut.id());
    unregister.sort_by_key(|shortcut| shortcut.id());
    (register, unregister)
}

fn begin_shortcut_action(id: &str) -> bool {
    let coalesced = id.starts_with("extension:")
        || manifest::keybinds().iter().any(|bind| bind.id == id);
    if !coalesced {
        return true;
    }
    static RECENT: Mutex<Vec<(String, Instant)>> = Mutex::new(Vec::new());
    let mut recent = RECENT.lock().unwrap_or_else(|err| err.into_inner());
    note_shortcut_action(&mut recent, id, Instant::now())
}

fn note_shortcut_action(recent: &mut Vec<(String, Instant)>, id: &str, now: Instant) -> bool {
    const WINDOW: Duration = Duration::from_millis(250);
    recent.retain(|(_, at)| now.saturating_duration_since(*at) < WINDOW);
    if recent.iter().any(|(seen, _)| seen == id) {
        return false;
    }
    recent.push((id.to_string(), now));
    true
}

fn schedule_inventory_sync(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(30));
        loop {
            let files = profile::live_files();
            if inventory::auto_sync_enabled(&files)
                && inventory::auto_sync_due(&files.inventory, chrono::Utc::now().timestamp_millis())
            {
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
        eprintln!("aquastar-neo: smoke {engine:?}: {result:?}");
    });
}

fn app_context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
}

fn main() {
    // Registry must precede every portal request, including rfd file dialogs.
    #[cfg(target_os = "linux")]
    if let Err(error) = tauri::async_runtime::block_on(portal_identity::register()) {
            eprintln!("aquastar-neo: {error}");
    }
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
                "AquaStar NEO could not create its data folder next to the executable.\n\n{err}\n\nportable.txt is present, so data was not stored in AppData."
            );
            #[cfg(target_os = "windows")]
            tell_user(&message);
            #[cfg(not(target_os = "windows"))]
            eprintln!("aquastar-neo: {message}");
            std::process::exit(1);
        }
    };
    // Going straight into a game: keep the launcher window from ever appearing.
    let args: Vec<String> = std::env::args().skip(1).collect();
    let has_saved_startup = ruffle::load_startup(&placement::launcher_config_dir()).is_some();
    if cli::capture_action(&args).is_some()
        || startup::probably_direct(&cli::parse(&args), has_saved_startup)
    {
        if let Some(window) = context.config_mut().app.windows.first_mut() {
            window.visible = false;
        }
    }
    let extension_root = match &placement {
        placement::Placement::Portable(_) => std::env::current_exe()
            .unwrap()
            .parent()
            .unwrap()
            .join("data"),
        placement::Placement::Installed => dirs::data_dir()
            .expect("Application data directory")
            .join(context.config().identifier.clone()),
    };
    let extension_state = extensions::Extensions::load(extension_root);
    let extension_sources = extension_state.sources();
    let builder = tauri::Builder::default();
    let builder = extensions::runtime::configure(builder, extension_sources)
        .manage(extension_state)
        .manage(menu_visibility::Visibility::default())
        .on_page_load(|webview, _| menu_visibility::apply_to_window(webview))
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // A second launch with options (`aquastar --aqw`) is carried out here; a plain
            // second launch just brings the launcher forward.
            let args: Vec<String> = argv.into_iter().skip(1).collect();
            if let Some(action) = cli::capture_action(&args) {
                dispatch(app, action, false);
            } else if args.iter().any(|arg| arg.starts_with("--")) {
                startup::apply(app, &args, false);
            } else {
                startup::show_main(app);
            }
        }));
    #[cfg(not(target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_notification::init());
    let app = builder
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        return;
                    }
                    let timer = app.state::<TimerShortcut>();
                    let slot = timer.0.lock().unwrap_or_else(|err| err.into_inner());
                    if slot.as_ref() == Some(shortcut) {
                        drop(slot);
                        if let Some(window) = app.get_webview_window("strategy") {
                            let _ = window.eval(
                                "window.__aquastarTimerToggle&&window.__aquastarTimerToggle()",
                            );
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
                })
                .build(),
        )
        .manage(placement)
        .manage(Players::default())
        .manage(startup::StartupState::default())
        .manage(studio::StudioState::default())
        .manage(capture::CaptureState::default())
        .manage(RestartAdmission::default())
        .manage(TimerShortcut(std::sync::Mutex::new(None)))
        .manage(ShortcutBook(std::sync::Mutex::new(
            std::collections::HashMap::new(),
        )))
        .invoke_handler(tauri::generate_handler![
            capture::capture_show,
            capture::capture_info,
            capture::capture_choose_folder,
            capture::capture_set_gnome_shortcuts,
            capture::capture_set_remember_authorization,
            capture::capture_open_folder,
            capture::capture_screenshot,
            capture::capture_start,
            capture::capture_stop,
            play,
            restart_ruffle,
            restart_flash,
            launcher::launcher_model,
            launcher::play_game,
            launcher::launcher_search,
            launcher::set_startup,
            studio::studio_defaults,
            studio::studio_messages,
            studio::studio_load_character,
            studio::studio_render,
            studio::studio_capture,
            studio::studio_close_preview,
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
            get_profile_preferences,
            change_profile_preference,
            get_hyprland_shortcut_setup,
            setup_hyprland_shortcuts,
            remove_hyprland_shortcuts,
            get_custom_swf_status,
            choose_custom_swf,
            remove_custom_swf,
            restart_app,
            show_about,
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
            open_project_page,
            close_dialog
        ])
        .setup(move |app| {
            app.state::<extensions::Extensions>().finish_startup();
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(Path::to_path_buf));
            let profile = placement::electron_profile(exe_dir.as_deref());
            std::thread::spawn(move || players::warm_loader(&profile));
            schedule_smoke(app.handle().clone());
            schedule_inventory_sync(app.handle().clone());
            let show_menu = app
                .path()
                .app_config_dir()
                .ok()
                .map(|dir| ruffle::load_show_menu_bar(&dir))
                .unwrap_or(false);
            app.state::<menu_visibility::Visibility>().set(show_menu);
            let lang = current_language();
            if let Err(err) = manifest::install_menu(app.handle(), lang.as_str()) {
                eprintln!("aquastar-neo: menu was not installed ({err})");
            }
            app.handle().on_menu_event(|app, event| {
                dispatch(app, event.id().0.as_str(), true);
            });
            register_saved_shortcuts(app.handle());
            extensions::install_contributions(app.handle());
            if cli::capture_action(&args).is_some() {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    capture::no_game_feedback(&handle);
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    handle.exit(0);
                });
            } else {
                startup::apply(app.handle(), &args, true);
            }
            if let Err(error) = menu_visibility::apply(app.handle()) {
                eprintln!("AquaStar NEO: could not apply menu visibility: {error}");
            }
            Ok(())
        })
        .build(context)
        .expect("failed to build AquaStar NEO");
    app.state::<Players>()
        .watch_presence({
            let app = app.handle().clone();
            move |_| sync_launcher(&app)
        })
        .expect("presence hook");
    app.run(|app, event| {
        if let RunEvent::WindowEvent { label, event: tauri::WindowEvent::CloseRequested { api, .. }, .. } = &event {
            if label == "capture" && app.state::<capture::CaptureState>().active() {
                api.prevent_close();
                if let Some(window) = app.get_webview_window(label) { let _ = window.hide(); }
            }
        }
        let main_gone = matches!(
            &event,
            RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } if label == "main"
        );
        if let RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } = &event {
            if label == "studio" {
                app.state::<studio::StudioState>().stop_preview();
            }
            if label != "main" {
                startup::exit_when_finished(app, label);
            }
        }
        if main_gone || matches!(event, RunEvent::Exit) {
            capture::suspend_shortcuts(app);
            #[cfg(target_os = "linux")]
            capture::wayland_shortcuts::suspend();
            app.state::<capture::CaptureState>().shutdown();
            app.state::<Players>().kill_all();
            app.state::<studio::StudioState>().stop_preview();
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
    fn a_shortcut_refresh_keeps_extension_bindings_and_drops_app_bindings() {
        let extension = shortcut_from(&profile::parse_accelerator("Alt+Shift+E").unwrap()).unwrap();
        let screenshot = shortcut_from(&profile::parse_accelerator("F2").unwrap()).unwrap();
        let mut book = std::collections::HashMap::new();
        book.insert(screenshot, "sshot".into());
        book.insert(extension, "extension:demo:open".into());
        assert_eq!(
            extension_bindings(&book),
            vec![(extension, "extension:demo:open".into())]
        );
    }

    #[test]
    fn a_presence_change_keeps_registered_shortcuts_and_only_adds_capture() {
        let help = shortcut_from(&profile::parse_accelerator("Alt+H").unwrap()).unwrap();
        let shot = shortcut_from(&profile::parse_accelerator("F2").unwrap()).unwrap();
        let extension = shortcut_from(&profile::parse_accelerator("Alt+Shift+E").unwrap()).unwrap();
        let mut old = std::collections::HashMap::new();
        old.insert(help, "help".into());
        old.insert(extension, "extension:demo:open".into());
        let mut desired = old.clone();
        desired.insert(shot, "sshot".into());
        let (register, unregister) = shortcut_book_delta(&old, &desired);
        assert_eq!(register, vec![shot]);
        assert!(unregister.is_empty());
    }

    #[test]
    fn stopping_capture_only_releases_capture_shortcuts() {
        let help = shortcut_from(&profile::parse_accelerator("Alt+H").unwrap()).unwrap();
        let shot = shortcut_from(&profile::parse_accelerator("F2").unwrap()).unwrap();
        let record = shortcut_from(&profile::parse_accelerator("Ctrl+J").unwrap()).unwrap();
        let mut old = std::collections::HashMap::new();
        old.insert(help, "help".into());
        old.insert(shot, "sshot".into());
        old.insert(record, "record".into());
        let mut desired = std::collections::HashMap::new();
        desired.insert(help, "help".into());
        let (register, unregister) = shortcut_book_delta(&old, &desired);
        assert!(register.is_empty());
        let mut expected = vec![shot, record];
        expected.sort_by_key(|shortcut| shortcut.id());
        assert_eq!(unregister, expected);
    }

    #[test]
    fn one_keypress_does_not_run_the_action_twice() {
        use std::time::{Duration, Instant};
        let mut recent = Vec::new();
        let start = Instant::now();
        assert!(note_shortcut_action(&mut recent, "record", start));
        assert!(!note_shortcut_action(
            &mut recent,
            "record",
            start + Duration::from_millis(10)
        ));
        assert!(note_shortcut_action(
            &mut recent,
            "sshot",
            start + Duration::from_millis(10)
        ));
        assert!(note_shortcut_action(
            &mut recent,
            "record",
            start + Duration::from_millis(251)
        ));
    }

    #[test]
    fn restart_admission_is_exclusive_until_the_guard_drops() {
        let admission = RestartAdmission::default();
        let capture = capture::CaptureState::default();
        let guard = admission
            .try_restart(&capture)
            .expect("first restart admission");
        assert!(admission.active());
        assert!(admission.try_restart(&capture).is_err());
        assert!(capture.begin(&admission).is_err());
        drop(guard);
        assert!(!admission.active());
        capture.begin(&admission).unwrap();
        assert!(capture.active());
        assert!(admission.try_restart(&capture).is_err());
    }

    #[test]
    fn restart_command_is_available_only_to_the_main_launcher_capability() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let permissions = std::fs::read_to_string(root.join("permissions/app.toml")).unwrap();
        let launcher = permissions
            .split("[[permission]]")
            .find(|entry| entry.contains("identifier = \"launcher-commands\""))
            .unwrap();
        assert!(launcher.contains("\"restart_ruffle\""));
        assert!(launcher.contains("\"restart_flash\""));
        assert!(launcher.contains("\"show_about\""));
        let capability: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("capabilities/default.json")).unwrap())
                .unwrap();
        assert_eq!(capability["windows"], serde_json::json!(["main"]));
        for path in std::fs::read_dir(root.join("capabilities")).unwrap() {
            let path = path.unwrap().path();
            if path.file_name().and_then(|name| name.to_str()) == Some("default.json") {
                continue;
            }
            let value: serde_json::Value =
                serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
            assert!(!value["permissions"]
                .to_string()
                .contains("launcher-commands"));
        }
    }

    #[test]
    fn remote_pages_do_not_receive_core_default_or_cleartext_origins() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
        let mut remote_files = 0;
        for entry in std::fs::read_dir(&root).unwrap() {
            let path = entry.unwrap().path();
            let value: serde_json::Value =
                serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            let Some(remote) = value.get("remote") else {
                continue;
            };
            remote_files += 1;
            let permissions = value["permissions"].as_array().unwrap();
            assert!(
                !permissions.iter().any(|item| item == "core:default"),
                "{}",
                path.display()
            );
            let urls = remote["urls"].as_array().unwrap();
            assert!(!urls.is_empty(), "{}", path.display());
            assert!(
                urls.iter().all(|url| url.as_str().unwrap().starts_with("https://")),
                "{}",
                path.display()
            );
        }
        assert_eq!(remote_files, 2);
    }

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
    fn product_strings_say_aquastar_neo() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let read = |path: &str| std::fs::read_to_string(root.join(path)).unwrap();
        let cargo = read("Cargo.toml");
        let conf = read("tauri.conf.json");
        assert!(cargo.contains("name = \"aquastar-neo\""));
        assert!(cargo.contains(&format!("version = \"{}\"", env!("CARGO_PKG_VERSION"))));
        let parsed: serde_json::Value = serde_json::from_str(&conf).unwrap();
        assert_eq!(parsed["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(parsed["productName"], "AquaStar NEO");
        assert_eq!(parsed["mainBinaryName"], "aquastar-neo");
        // Keep the established app identity so existing profiles and portal bindings survive.
        assert_eq!(parsed["identifier"], "io.github.aquaspy.aquastar-lite");
        assert_eq!(parsed["app"]["windows"][0]["title"], "AquaStar NEO");
        assert_eq!(parsed["bundle"]["macOS"]["bundleName"], "AquaStar NEO");
        let linux: serde_json::Value =
            serde_json::from_str(&read("tauri.linux.conf.json")).unwrap();
        assert_eq!(
            linux["bundle"]["linux"]["deb"]["desktopTemplate"],
            "assets/aquastar-lite.desktop"
        );
        assert!(linux["bundle"]["linux"]["deb"]["replaces"]
            .as_array()
            .unwrap()
            .iter()
            .any(|package| package == "aqua-star"));
        let arch = read("../packaging/arch/PKGBUILD.in");
        assert!(arch.contains("pkgname=aquastar-neo"));
        assert!(arch.contains("replaces=('aqua-star'"));
        assert!(arch.contains("/usr/bin/aquastar-neo"));
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
        }
        assert!(visible[3].contains("<title>AquaStar NEO</title>"));
        assert!(visible[4].contains("PLAYER_TITLE: &str = \"AquaStar NEO\""));
        assert!(visible[2].lines().any(|line| line == "Name=AquaStar NEO"));
        assert!(visible[7].contains("<string>AquaStar NEO</string>"));
    }
}
