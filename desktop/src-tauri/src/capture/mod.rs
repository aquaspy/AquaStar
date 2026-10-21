mod backend;
pub(crate) use backend::is_wayland;
#[cfg(target_os = "linux")]
pub(crate) mod wayland_shortcuts;
mod encoder;
mod feedback;
#[cfg(target_os = "linux")]
mod shortcuts;

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};

pub const EVENT: &str = "capture-state";
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub phase: String,
    pub elapsed_seconds: u64,
    pub path: Option<PathBuf>,
    pub error: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub screenshots: PathBuf,
    pub videos: PathBuf,
    #[serde(default, rename = "audio", skip_serializing)]
    _legacy_audio: Option<serde::de::IgnoredAny>,
    #[serde(default = "remember_authorization_default")]
    pub remember_authorization: bool,
    #[serde(default)]
    pub gnome_shortcuts: bool,
}
fn remember_authorization_default() -> bool {
    true
}
impl Default for Settings {
    fn default() -> Self {
        let home = dirs::home_dir().unwrap_or_else(std::env::temp_dir);
        Self {
            screenshots: dirs::picture_dir()
                .unwrap_or_else(|| home.clone())
                .join("AquaStar Screenshots"),
            videos: dirs::video_dir()
                .unwrap_or(home)
                .join("AquaStar Recordings"),
            _legacy_audio: None,
            remember_authorization: true,
            gnome_shortcuts: false,
        }
    }
}
#[derive(Default)]
struct Inner {
    busy: AtomicBool,
    stop: Arc<AtomicBool>,
    status: Mutex<Status>,
    screenshot: Mutex<Option<PathBuf>>,
}
#[derive(Clone, Default)]
pub struct CaptureState(Arc<Inner>);
impl CaptureState {
    pub fn active(&self) -> bool {
        self.0.busy.load(Ordering::SeqCst)
    }
    pub fn shutdown(&self) {
        self.0.stop.store(true, Ordering::SeqCst);
        let start = Instant::now();
        while self.active() && start.elapsed() < Duration::from_secs(12) {
            std::thread::sleep(Duration::from_millis(25));
        }
    }
    pub(crate) fn begin(&self, admission: &crate::RestartAdmission) -> Result<(), String> {
        admission.with_recording_start(|| {
            self.0
                .busy
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .map_err(|_| "A capture is already running.".to_string())?;
            self.0.stop.store(false, Ordering::SeqCst);
            Ok(())
        })
    }
    fn finish(&self, app: &tauri::AppHandle) {
        self.0.busy.store(false, Ordering::SeqCst);
        if app.state::<crate::players::Players>().presence() == crate::players::Presence::Idle {
            crate::sync_launcher(app);
        }
    }
    fn status(&self) -> Status {
        self.0
            .status
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
    fn update(
        &self,
        app: &tauri::AppHandle,
        phase: &str,
        seconds: u64,
        path: Option<PathBuf>,
        error: Option<String>,
    ) {
        let status = Status {
            phase: phase.into(),
            elapsed_seconds: seconds,
            path,
            error,
        };
        let previous = {
            let mut current = self.0.status.lock().unwrap_or_else(|e| e.into_inner());
            let previous = current.phase.clone();
            *current = status.clone();
            previous
        };
        if phase == "failed" {
            eprintln!(
                "AquaStar capture failed: {}",
                status.error.as_deref().unwrap_or("Unknown capture error")
            );
        }
        if phase != previous || phase == "failed" {
            match phase {
                "recording" => feedback::show(
                    app,
                    "AquaStar · Recording",
                    "Recording started. Press Ctrl+J again to stop.",
                ),
                "failed" => feedback::show(
                    app,
                    "AquaStar · Capture failed",
                    status
                        .error
                        .as_deref()
                        .unwrap_or("Open Capture Controls for details."),
                ),
                "saved"
                    if status
                        .path
                        .as_ref()
                        .is_some_and(|p| p.extension().is_some_and(|e| e == "mp4")) =>
                {
                    feedback::show(
                        app,
                        "AquaStar · Video saved",
                        &status.path.as_ref().unwrap().display().to_string(),
                    )
                }
                _ => {}
            }
        }
        let _ = app.emit_to("main", EVENT, &status);
        let _ = app.emit_to("capture", EVENT, &status);
    }
}
fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.join("capture-settings.json"))
        .map_err(|e| e.to_string())
}
fn settings(app: &tauri::AppHandle) -> Settings {
    settings_path(app)
        .ok()
        .and_then(|p| fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}
fn host(window: &tauri::WebviewWindow) -> Result<(), String> {
    match window.label() {
        "main" | "capture" => Ok(()),
        _ => Err("Capture is available only to AquaStar's capture controls.".into()),
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    targets: Vec<backend::Target>,
    screenshot: bool,
    video: bool,
    reason: Option<String>,
    settings: Settings,
    status: Status,
    last_screenshot: Option<PathBuf>,
    wayland: bool,
    gnome_shortcuts_available: bool,
}
#[tauri::command]
pub async fn capture_info(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Capabilities, String> {
    host(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let targets = backend::targets(&app.state::<crate::players::Players>().capture_pids())?;
        let reason = encoder::binary(&app).err();
        let state = app.state::<CaptureState>();
        let status = state.status();
        let last_screenshot = state.0.screenshot.lock().unwrap().clone();
        Ok(Capabilities {
            wayland: backend::is_wayland(),
            gnome_shortcuts_available: gnome_shortcuts_available(),
            screenshot: !targets.is_empty(),
            video: reason.is_none() && !targets.is_empty(),
            reason,
            targets,
            settings: settings(&app),
            status,
            last_screenshot,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn capture_choose_folder(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    kind: String,
) -> Result<Settings, String> {
    host(&window)?;
    if !matches!(kind.as_str(), "screenshots" | "videos") {
        return Err("Unknown capture folder.".into());
    }
    let parent = window.clone();
    let folder = rfd::AsyncFileDialog::new()
        .set_parent(&parent)
        .set_title("Choose capture folder")
        .pick_folder()
        .await;
    let mut saved = settings(&app);
    if let Some(folder) = folder {
        if kind == "videos" {
            saved.videos = folder.path().to_path_buf();
        } else {
            saved.screenshots = folder.path().to_path_buf();
        }
        save_settings(&app, &saved)?;
    }
    Ok(saved)
}
fn save_settings(app: &tauri::AppHandle, value: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(
        path,
        serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
fn authorization_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    (backend::is_wayland() && settings(app).remember_authorization)
        .then(|| {
            app.path()
                .app_config_dir()
                .ok()
                .map(|p| p.join("capture-wayland-authorization.json"))
        })
        .flatten()
}
#[tauri::command]
pub async fn capture_set_remember_authorization(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    host(&window)?;
    if app.state::<CaptureState>().active() {
        return Err("Stop the recording before changing its authorization setting.".into());
    }
    let mut saved = settings(&app);
    saved.remember_authorization = enabled;
    save_settings(&app, &saved)?;
    if !enabled {
        if let Ok(dir) = app.path().app_config_dir() {
            match fs::remove_file(dir.join("capture-wayland-authorization.json")) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.to_string()),
            }
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn capture_open_folder(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    kind: String,
) -> Result<(), String> {
    host(&window)?;
    let saved = settings(&app);
    let folder = match kind.as_str() {
        "screenshots" => saved.screenshots,
        "videos" => saved.videos,
        _ => return Err("Unknown capture folder.".into()),
    };
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "linux")]
    let mut command = std::process::Command::new("xdg-open");
    command.arg(folder).spawn().map_err(|e| e.to_string())?;
    Ok(())
}
fn target(app: &tauri::AppHandle, id: Option<String>) -> Result<backend::Target, String> {
    backend::select(
        backend::targets(&app.state::<crate::players::Players>().capture_pids())?,
        id,
    )
}
#[tauri::command]
pub async fn capture_screenshot(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: Option<String>,
) -> Result<PathBuf, String> {
    host(&window)?;
    screenshot(app, id).await
}
pub async fn screenshot(app: tauri::AppHandle, id: Option<String>) -> Result<PathBuf, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target = target(&app, id)?;
        let image = backend::Source::new(&target, None, authorization_path(&app))?.frame()?;
        let path = destination(&settings(&app).screenshots, "png")?;
        let temporary = path.with_extension("png.partial");
        image
            .save_with_format(&temporary, xcap::image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        fs::rename(&temporary, &path).map_err(|e| e.to_string())?;
        let state = app.state::<CaptureState>();
        *state.0.screenshot.lock().unwrap() = Some(path.clone());
        feedback::show(
            &app,
            "AquaStar · Screenshot saved",
            &path.display().to_string(),
        );
        let _ = app.emit_to("capture", "capture-screenshot", &path);
        let _ = app.emit_to("main", "capture-screenshot", &path);
        if !state.active() {
            state.update(&app, "saved", 0, Some(path.clone()), None);
        }
        Ok(path)
    })
    .await
    .map_err(|e| e.to_string())?
}
pub fn screenshot_failed(app: &tauri::AppHandle, error: String) {
    let state = app.state::<CaptureState>();
    if state.active() {
        // A failed screenshot must not replace the active recording's state.
        feedback::show(app, "AquaStar · Screenshot failed", &error);
        let _ = app.emit_to("main", "capture-screenshot-error", &error);
        let _ = app.emit_to("capture", "capture-screenshot-error", &error);
    } else {
        state.update(app, "failed", 0, None, Some(error));
    }
}
#[tauri::command]
pub async fn capture_start(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: Option<String>,
) -> Result<(), String> {
    host(&window)?;
    start(app, id).await
}
pub async fn start(app: tauri::AppHandle, id: Option<String>) -> Result<(), String> {
    let state = app.state::<CaptureState>().inner().clone();
    let admission = app.state::<crate::RestartAdmission>();
    state.begin(admission.inner())?;
    state.update(&app, "preparing", 0, None, None);
    let outcome = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || prepare(&app, id)
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    let prepared = match outcome {
        Ok(prepared) => prepared,
        Err(error) => {
            if state.0.stop.load(Ordering::SeqCst) {
                state.update(&app, "canceled", 0, None, None);
                state.finish(&app);
                return Ok(());
            }
            state.update(&app, "failed", 0, None, Some(error.clone()));
            state.finish(&app);
            return Err(error);
        }
    };
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            record(&app, &state, prepared)
        }))
        .unwrap_or_else(|_| {
            Err(
                "The native capture service stopped unexpectedly. Temporary files were kept."
                    .into(),
            )
        });
        if let Err(error) = result {
            state.update(&app, "failed", 0, None, Some(error));
        }
        state.finish(&app);
    });
    Ok(())
}
struct Prepared {
    target: backend::Target,
    first: xcap::image::RgbaImage,
    source: backend::Source,
    binary: PathBuf,
    path: PathBuf,
}
fn prepare(app: &tauri::AppHandle, id: Option<String>) -> Result<Prepared, String> {
    let target = target(app, id)?;
    let binary = encoder::binary(app)?;
    let mut source = backend::Source::new(
        &target,
        Some(app.state::<CaptureState>().0.stop.clone()),
        authorization_path(app),
    )?;
    let first = source.frame()?;
    let path = destination(&settings(app).videos, "mp4")?;
    Ok(Prepared {
        target,
        first,
        source,
        binary,
        path,
    })
}
fn record(app: &tauri::AppHandle, state: &CaptureState, prepared: Prepared) -> Result<(), String> {
    if state.0.stop.load(Ordering::SeqCst) {
        state.update(app, "canceled", 0, None, None);
        return Ok(());
    }
    let Prepared {
        target,
        first,
        mut source,
        binary,
        path,
    } = prepared;
    let temporary = path.with_extension("recording.mp4");
    let size = encoder::dimensions(first.width(), first.height())?;
    let fps = backend::fps();
    let mut encoder = encoder::Video::new(&binary, &temporary, size, fps)?;
    let started = Instant::now();
    encoder.write(&first)?;
    let mut frames = 1u64;
    let mut seconds = u64::MAX;
    let result = (|| {
        loop {
            if state.0.stop.load(Ordering::SeqCst)
                || !app
                    .state::<crate::players::Players>()
                    .capture_pids()
                    .contains(&target.pid)
            {
                break;
            }
            let now = started.elapsed();
            let due = (now.as_secs_f64() * fps as f64).floor() as u64;
            if frames <= due {
                if backend::minimized(&target)? {
                    return Err(
                        "The game was minimized. The completed portion has been saved.".into(),
                    );
                }
                let frame = match source.frame() {
                    Ok(frame) => frame,
                    Err(_) if state.0.stop.load(Ordering::SeqCst) => break,
                    Err(error) => return Err(error),
                };
                while frames <= due {
                    encoder.write(&frame)?;
                    frames += 1;
                }
            }
            if seconds != now.as_secs() {
                seconds = now.as_secs();
                state.update(app, "recording", seconds, Some(path.clone()), None);
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        Ok(())
    })();
    state.update(
        app,
        "finalizing",
        started.elapsed().as_secs(),
        Some(path.clone()),
        None,
    );
    encoder.finish()?;
    encoder::seal(&binary, &temporary, &path)?;
    let _ = fs::remove_file(&temporary);
    let warning = result.err();
    state.update(
        app,
        "saved",
        started.elapsed().as_secs(),
        Some(path),
        warning,
    );
    Ok(())
}
#[tauri::command]
pub async fn capture_stop(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    host(&window)?;
    app.state::<CaptureState>()
        .0
        .stop
        .store(true, Ordering::SeqCst);
    Ok(())
}
pub async fn toggle(app: tauri::AppHandle) {
    if app.state::<CaptureState>().active() {
        app.state::<CaptureState>()
            .0
            .stop
            .store(true, Ordering::SeqCst);
    } else if let Err(error) = start(app.clone(), None).await {
        app.state::<CaptureState>()
            .update(&app, "failed", 0, None, Some(error));
    }
}
async fn show_controls(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("capture") {
        window.show().map_err(|e| e.to_string())?;
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        app,
        "capture",
        tauri::WebviewUrl::App("features/capture/capture.html".into()),
    )
    .title("AquaStar — Capture")
    .inner_size(420.0, 410.0)
    .resizable(true)
    .always_on_top(true)
    .focused(false)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn capture_show(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    host(&window)?;
    show_controls(&app).await
}
pub async fn open_controls(app: &tauri::AppHandle) {
    let _ = show_controls(app).await;
}
fn destination(dir: &Path, extension: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(dir).map_err(|e| format!("Cannot create capture folder: {e}"))?;
    let name = chrono::Local::now().format("AquaStar-%Y%m%d-%H%M%S-%f");
    let path = dir.join(format!("{name}.{extension}"));
    if path.exists() {
        return Err("Capture filename already exists. Try again.".into());
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn concurrent_start_requests_cannot_create_two_recordings() {
        let state = CaptureState::default();
        let admission = crate::RestartAdmission::default();
        let barrier = Arc::new(std::sync::Barrier::new(8));
        let workers: Vec<_> = (0..8)
            .map(|_| {
                let state = state.clone();
                let admission = admission.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    state.begin(&admission).is_ok()
                })
            })
            .collect();
        let successes = workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .filter(|started| *started)
            .count();
        assert_eq!(successes, 1);
        assert!(state.active());
    }
}

pub fn no_game_feedback(app: &tauri::AppHandle) {
    feedback::show(
        app,
        "AquaStar · No game running",
        "Open a game in AquaStar before using capture shortcuts.",
    );
}

fn gnome_shortcuts_available() -> bool {
    #[cfg(target_os = "linux")]
    {
        shortcuts::supported()
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}
pub fn gnome_shortcuts_enabled(app: &tauri::AppHandle) -> bool {
    backend::is_wayland() && settings(app).gnome_shortcuts && gnome_shortcuts_available()
}
pub fn sync_shortcuts(app: &tauri::AppHandle) {
    #[cfg(target_os = "linux")]
    shortcuts::sync(app);
    #[cfg(not(target_os = "linux"))]
    let _ = app;
}
pub fn suspend_shortcuts(app: &tauri::AppHandle) {
    #[cfg(target_os = "linux")]
    shortcuts::suspend(app);
    #[cfg(not(target_os = "linux"))]
    let _ = app;
}
#[tauri::command]
pub async fn capture_set_gnome_shortcuts(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    host(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "linux")]
        shortcuts::configure(&app, enabled)?;
        #[cfg(not(target_os = "linux"))]
        return Err("GNOME integration is only available on Linux.".into());
        let mut saved = settings(&app);
        saved.gnome_shortcuts = enabled;
        if let Err(error) = save_settings(&app, &saved) {
            #[cfg(target_os = "linux")]
            let _ = shortcuts::configure(&app, !enabled);
            return Err(error);
        }
        crate::register_saved_shortcuts(&app);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod settings_defaults_tests {
    #[test]
    fn remembered_authorization_defaults_on_but_preserves_explicit_choices() {
        let defaults = super::Settings::default();
        assert!(defaults.remember_authorization);
        for old_audio in [true, false] {
            let mut legacy = serde_json::to_value(&defaults).unwrap();
            legacy["audio"] = old_audio.into();
            legacy["rememberAuthorization"] = false.into();
            let saved: super::Settings = serde_json::from_value(legacy).unwrap();
            assert_eq!(saved.screenshots, defaults.screenshots);
            assert!(!saved.remember_authorization);
            assert!(serde_json::to_value(saved).unwrap().get("audio").is_none());
        }
        let mut value = serde_json::to_value(&defaults).unwrap();
        value
            .as_object_mut()
            .unwrap()
            .remove("rememberAuthorization");
        assert!(
            serde_json::from_value::<super::Settings>(value.clone())
                .unwrap()
                .remember_authorization
        );
        value["rememberAuthorization"] = serde_json::Value::Bool(false);
        assert!(
            !serde_json::from_value::<super::Settings>(value)
                .unwrap()
                .remember_authorization
        );
    }
}
