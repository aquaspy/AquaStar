mod audio;
mod backend;
mod encoder;

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
    pub audio: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub screenshots: PathBuf,
    pub videos: PathBuf,
    pub audio: bool,
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
            audio: true,
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
    fn begin(&self) -> Result<(), String> {
        self.0
            .busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "A capture is already running.".to_string())?;
        self.0.stop.store(false, Ordering::SeqCst);
        Ok(())
    }
    fn finish(&self, app: &tauri::AppHandle) {
        self.0.busy.store(false, Ordering::SeqCst);
        if app.state::<crate::players::Players>().presence() == crate::players::Presence::Idle {
            crate::sync_launcher(app, crate::players::Presence::Idle);
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
        audio: bool,
    ) {
        let status = Status {
            phase: phase.into(),
            elapsed_seconds: seconds,
            path,
            error,
            audio,
        };
        *self.0.status.lock().unwrap_or_else(|e| e.into_inner()) = status.clone();
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
    audio: bool,
    reason: Option<String>,
    settings: Settings,
    status: Status,
    last_screenshot: Option<PathBuf>,
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
        let audio = targets.iter().any(|t| audio::available(t.pid));
        let state = app.state::<CaptureState>();
        let status = state.status();
        let last_screenshot = state.0.screenshot.lock().unwrap().clone();
        Ok(Capabilities {
            screenshot: !targets.is_empty(),
            video: reason.is_none() && !targets.is_empty(),
            audio,
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
#[tauri::command]
pub async fn capture_set_audio(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    host(&window)?;
    let mut saved = settings(&app);
    saved.audio = enabled;
    save_settings(&app, &saved)
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
        let image = backend::Source::new(&target, None)?.frame()?;
        let path = destination(&settings(&app).screenshots, "png")?;
        let temporary = path.with_extension("png.partial");
        image
            .save_with_format(&temporary, xcap::image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        fs::rename(&temporary, &path).map_err(|e| e.to_string())?;
        let state = app.state::<CaptureState>();
        *state.0.screenshot.lock().unwrap() = Some(path.clone());
        let _ = app.emit_to("capture", "capture-screenshot", &path);
        if !state.active() {
            state.update(&app, "saved", 0, Some(path.clone()), None, false);
        }
        Ok(path)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn capture_start(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: Option<String>,
    silent: bool,
) -> Result<(), String> {
    host(&window)?;
    start(app, id, silent).await
}
pub async fn start(app: tauri::AppHandle, id: Option<String>, silent: bool) -> Result<(), String> {
    let state = app.state::<CaptureState>().inner().clone();
    state.begin()?;
    state.update(&app, "preparing", 0, None, None, false);
    let outcome = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || prepare(&app, id, silent)
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    let prepared = match outcome {
        Ok(prepared) => prepared,
        Err(error) => {
            if state.0.stop.load(Ordering::SeqCst) {
                state.update(&app, "canceled", 0, None, None, false);
                state.finish(&app);
                return Ok(());
            }
            state.update(&app, "failed", 0, None, Some(error.clone()), false);
            state.finish(&app);
            return Err(error);
        }
    };
    let controls = show_controls(&app).await;
    if let Err(error) = controls {
        state.update(&app, "failed", 0, None, Some(error.clone()), false);
        state.finish(&app);
        return Err(error);
    }
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
            state.update(&app, "failed", 0, None, Some(error), false);
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
    audio: bool,
}
fn prepare(app: &tauri::AppHandle, id: Option<String>, silent: bool) -> Result<Prepared, String> {
    let target = target(app, id)?;
    let binary = encoder::binary(app)?;
    let mut source =
        backend::Source::new(&target, Some(app.state::<CaptureState>().0.stop.clone()))?;
    let first = source.frame()?;
    let audio = settings(app).audio && !silent;
    if audio && !audio::available(target.pid) {
        return Err(
            "Game audio is unavailable on this system. Choose Record Without Audio to continue."
                .into(),
        );
    }
    let path = destination(&settings(app).videos, "mp4")?;
    Ok(Prepared {
        target,
        first,
        source,
        binary,
        path,
        audio,
    })
}
fn record(app: &tauri::AppHandle, state: &CaptureState, prepared: Prepared) -> Result<(), String> {
    if state.0.stop.load(Ordering::SeqCst) {
        state.update(app, "canceled", 0, None, None, false);
        return Ok(());
    }
    let Prepared {
        target,
        first,
        mut source,
        binary,
        path,
        audio,
    } = prepared;
    let audio_enabled = audio;
    let audio = if audio {
        Some(audio::start(target.pid).map_err(|e| {
            format!("Game audio is unavailable: {e}. Choose Record Without Audio to continue.")
        })?)
    } else {
        None
    };
    let temporary = path.with_extension("recording.mp4");
    let audio_path = path.with_extension("recording.m4a");
    let size = encoder::dimensions(first.width(), first.height())?;
    let fps = backend::fps();
    let mut encoder = encoder::Video::new(&binary, &temporary, size, fps)?;
    let mut audio = audio
        .map(|session| encoder::Audio::new(&binary, &audio_path, session))
        .transpose()?;
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
            if audio.as_ref().is_some_and(|a| !a.healthy()) {
                return Err(
                    "Game audio stopped unexpectedly. The completed recording has been saved."
                        .into(),
                );
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
                state.update(
                    app,
                    "recording",
                    seconds,
                    Some(path.clone()),
                    None,
                    audio_enabled,
                );
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
        audio_enabled,
    );
    let audio_result = audio.as_mut().map(|audio| audio.finish());
    encoder.finish()?;
    let audio_ok = matches!(audio_result, Some(Ok(())));
    if audio_ok {
        encoder::mux(&binary, &temporary, &audio_path, &path)?;
    } else {
        encoder::seal(&binary, &temporary, &path)?;
    }
    let _ = fs::remove_file(&temporary);
    let _ = fs::remove_file(&audio_path);
    let warning = result.err().or_else(|| {
        audio_result
            .and_then(Result::err)
            .map(|e| format!("Video saved without audio: {e}"))
    });
    state.update(
        app,
        "saved",
        started.elapsed().as_secs(),
        Some(path),
        warning,
        audio_ok,
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
    } else if let Err(error) = start(app.clone(), None, false).await {
        let _ = show_controls(&app).await;
        app.state::<CaptureState>()
            .update(&app, "failed", 0, None, Some(error), false);
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
        let barrier = Arc::new(std::sync::Barrier::new(8));
        let workers: Vec<_> = (0..8)
            .map(|_| {
                let state = state.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    state.begin().is_ok()
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
