#[cfg(target_os = "linux")]
#[path = "backend/portal_identity.rs"]
mod portal_identity;
#[cfg(target_os = "linux")]
pub(crate) use portal_identity::register as register_portal_identity;
use serde::Serialize;
#[cfg(target_os = "linux")]
#[path = "backend/wayland.rs"]
mod wayland;
#[cfg(windows)]
#[path = "backend/windows.rs"]
mod windows;
#[cfg(target_os = "linux")]
#[path = "backend/x11.rs"]
mod x11;
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
pub fn fps() -> u32 {
    #[cfg(target_os = "macos")]
    if !mac_modern() {
        return 15;
    }
    30
}
pub fn is_wayland() -> bool {
    cfg!(target_os = "linux") && std::env::var("XDG_SESSION_TYPE").is_ok_and(|v| v == "wayland")
}

#[derive(Clone, Serialize)]
pub struct Target {
    pub id: u32,
    pub pid: u32,
    pub title: String,
    pub focused: bool,
    pub token: String,
}
pub fn targets(pids: &[u32]) -> Result<Vec<Target>, String> {
    if pids.is_empty() {
        return Ok(Vec::new());
    }
    if is_wayland() {
        return Ok(pids
            .iter()
            .map(|pid| Target {
                id: *pid,
                pid: *pid,
                title: format!("Game {pid} — select its window in the system picker"),
                focused: pids.len() == 1,
                token: format!("{pid}:{pid}"),
            })
            .collect());
    }
    let windows = xcap::Window::all().map_err(|e| format!("Cannot list game windows: {e}"))?;
    Ok(windows
        .into_iter()
        .filter_map(|w| {
            let pid = w.pid().ok()?;
            if !pids.contains(&pid) {
                return None;
            }
            Some(Target {
                id: w.id().ok()?,
                pid,
                title: w.title().unwrap_or_else(|_| "Game".into()),
                focused: w.is_focused().unwrap_or(false),
                token: format!("{pid}:{}", w.id().ok()?),
            })
        })
        .collect())
}
pub fn select(targets: Vec<Target>, id: Option<String>) -> Result<Target, String> {
    if let Some(id) = id {
        return targets
            .into_iter()
            .find(|t| t.token == id)
            .ok_or("That game window is no longer available.".into());
    }
    if targets.len() == 1 {
        return Ok(targets[0].clone());
    }
    targets.iter().find(|t| t.focused).cloned().ok_or_else(|| {
        if targets.is_empty() {
            "Open a game before capturing.".into()
        } else {
            "Choose which game window to capture.".into()
        }
    })
}
fn window(target: &Target) -> Result<xcap::Window, String> {
    xcap::Window::all()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|w| w.id().ok() == Some(target.id) && w.pid().ok() == Some(target.pid))
        .ok_or("The game window has closed.".into())
}
pub fn minimized(target: &Target) -> Result<bool, String> {
    if is_wayland() {
        return Ok(false);
    }
    window(target)?.is_minimized().map_err(|e| e.to_string())
}
pub struct Source {
    target: Target,
    native: Option<Frames>,
    cancel: Option<Arc<std::sync::atomic::AtomicBool>>,
}
impl Source {
    pub fn new(
        target: &Target,
        cancel: Option<Arc<std::sync::atomic::AtomicBool>>,
        _authorization: Option<std::path::PathBuf>,
    ) -> Result<Self, String> {
        #[cfg(windows)]
        {
            return Ok(Self {
                target: target.clone(),
                native: Some(windows::start(target.id)?),
                cancel,
            });
        }
        #[cfg(target_os = "linux")]
        if is_wayland() {
            return Ok(Self {
                target: target.clone(),
                native: Some(wayland::start(target.pid, _authorization)?),
                cancel,
            });
        }
        #[cfg(target_os = "macos")]
        if mac_modern() {
            return Ok(Self {
                target: target.clone(),
                native: Some(mac_frames(target)?),
                cancel,
            });
        }
        Ok(Self {
            target: target.clone(),
            native: None,
            cancel,
        })
    }
    pub fn frame(&mut self) -> Result<xcap::image::RgbaImage, String> {
        if self
            .cancel
            .as_ref()
            .is_some_and(|c| c.load(std::sync::atomic::Ordering::SeqCst))
        {
            return Err("Capture canceled.".into());
        }
        if let Some(native) = self.native.as_ref() {
            return native.frame(self.cancel.as_deref());
        }
        let owned_window = window(&self.target)?;
        #[cfg(target_os = "linux")]
        if let Ok(frame) = x11::grab(self.target.id) {
            return Ok(frame);
        }
        owned_window
            .capture_image()
            .map_err(|e| format!("Cannot capture game window: {e}"))
    }
}
pub struct Frames {
    pub latest: Arc<Mutex<Option<xcap::image::RgbaImage>>>,
    pub error: Arc<Mutex<Option<String>>>,
    pub stop: Arc<std::sync::atomic::AtomicBool>,
}
impl Frames {
    pub fn new() -> Self {
        Self {
            latest: Arc::new(Mutex::new(None)),
            error: Arc::new(Mutex::new(None)),
            stop: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }
    fn frame(
        &self,
        cancel: Option<&std::sync::atomic::AtomicBool>,
    ) -> Result<xcap::image::RgbaImage, String> {
        let deadline = Instant::now() + Duration::from_secs(60);
        loop {
            if cancel.is_some_and(|c| c.load(std::sync::atomic::Ordering::SeqCst)) {
                return Err("Capture canceled.".into());
            }
            if let Some(error) = self.error.lock().unwrap().clone() {
                return Err(error);
            }
            if let Some(image) = self.latest.lock().unwrap().as_ref() {
                return Ok(image.clone());
            }
            if Instant::now() > deadline {
                return Err("No game frames arrived. Check screen capture permission.".into());
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}
impl Drop for Frames {
    fn drop(&mut self) {
        self.stop.store(true, std::sync::atomic::Ordering::SeqCst);
    }
}
#[cfg(target_os = "macos")]
fn mac_modern() -> bool {
    std::process::Command::new("/usr/bin/sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .is_some_and(|v| {
            let mut parts = v.trim().split('.').filter_map(|v| v.parse::<u32>().ok());
            let major = parts.next().unwrap_or(0);
            major > 12 || (major == 12 && parts.next().unwrap_or(0) >= 3)
        })
}
#[cfg(target_os = "macos")]
pub fn mac_helper() -> Result<std::path::PathBuf, String> {
    let name = format!("capture-macos-{}", std::env::consts::ARCH);
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut candidates = vec![
        exe.parent().unwrap().join("media").join(&name),
        exe.parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("Resources/media")
            .join(&name),
    ];
    #[cfg(debug_assertions)]
    candidates.push(
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("media")
            .join(name),
    );
    candidates
        .into_iter()
        .find(|p| p.is_file())
        .ok_or("The bundled macOS capture component is missing.".into())
}
#[cfg(target_os = "macos")]
fn mac_frames(target: &Target) -> Result<Frames, String> {
    use std::{
        io::Read,
        process::{Command, Stdio},
        sync::atomic::Ordering,
    };
    let mut child = Command::new(mac_helper()?)
        .args(["frames", &target.pid.to_string(), &target.id.to_string()])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let mut output = child.stdout.take().unwrap();
    let frames = Frames::new();
    let latest = frames.latest.clone();
    let error = frames.error.clone();
    let stop = frames.stop.clone();
    let child = Arc::new(Mutex::new(child));
    let killer = child.clone();
    let flag = stop.clone();
    std::thread::spawn(move || {
        while !flag.load(Ordering::SeqCst) {
            if killer.lock().unwrap().try_wait().ok().flatten().is_some() {
                return;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        let mut child = killer.lock().unwrap();
        let _ = child.kill();
        let _ = child.wait();
    });
    std::thread::spawn(move || {
        let result = (|| -> Result<(), String> {
            while !stop.load(Ordering::SeqCst) {
                let mut header = [0; 12];
                output
                    .read_exact(&mut header)
                    .map_err(|e| format!("Native capture stopped: {e}"))?;
                let width = u32::from_le_bytes(header[0..4].try_into().unwrap());
                let height = u32::from_le_bytes(header[4..8].try_into().unwrap());
                let length = u32::from_le_bytes(header[8..12].try_into().unwrap());
                if width == 0
                    || height == 0
                    || width.checked_mul(height).and_then(|n| n.checked_mul(4)) != Some(length)
                    || length > 64 * 1024 * 1024
                {
                    return Err("Invalid native frame size.".into());
                }
                let mut bytes = vec![0; length as usize];
                output.read_exact(&mut bytes).map_err(|e| e.to_string())?;
                *latest.lock().unwrap() = xcap::image::RgbaImage::from_raw(width, height, bytes);
            }
            Ok(())
        })();
        if let Err(e) = result {
            *error.lock().unwrap() = Some(e);
        }
    });
    Ok(frames)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn t(id: u32, focused: bool) -> Target {
        Target {
            id,
            pid: 10,
            focused,
            title: "Game".into(),
            token: format!("10:{id}"),
        }
    }
    #[test]
    fn selects_only_owned_targets() {
        assert!(select(vec![t(1, false)], Some("10:2".into())).is_err());
        assert_eq!(select(vec![t(1, false)], None).unwrap().id, 1);
        assert!(select(vec![t(1, false), t(2, false)], None).is_err());
        assert_eq!(select(vec![t(1, false), t(2, true)], None).unwrap().id, 2);
    }
}
