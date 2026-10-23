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
    // Without Screen Recording permission, macOS reports other apps' windows
    // with sharing state 0. xcap drops those, so F2 and Ctrl+J look dead even
    // though the game window is on screen. The window id is still valid for
    // ScreenCaptureKit, which is what asks for permission.
    #[cfg(target_os = "macos")]
    {
        let windows = mac_windows();
        let found = targets_from_listed(&windows, pids);
        if found.is_empty() {
            eprintln!(
                "aquastar-neo: no on-screen game window for pids {pids:?} ({} windows listed)",
                windows.len()
            );
        }
        return Ok(found);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let windows = xcap::Window::all().map_err(|e| format!("Cannot list game windows: {e}"))?;
        return Ok(windows
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
            .collect());
    }
}
struct ListedWindow {
    id: u32,
    pid: u32,
    layer: i32,
    width: i64,
    height: i64,
    title: String,
}
fn targets_from_listed(windows: &[ListedWindow], pids: &[u32]) -> Vec<Target> {
    let owned: Vec<&ListedWindow> = windows
        .iter()
        .filter(|window| window.layer == 0 && pids.contains(&window.pid))
        .collect();
    let playable: Vec<&ListedWindow> = owned
        .iter()
        .copied()
        .filter(|window| window.width >= 200 && window.height >= 200)
        .collect();
    let chosen = if playable.is_empty() { owned } else { playable };
    let best = chosen
        .iter()
        .max_by_key(|window| window.width.saturating_mul(window.height))
        .map(|window| window.id);
    chosen
        .into_iter()
        .map(|window| Target {
            id: window.id,
            pid: window.pid,
            title: if window.title.is_empty() {
                "Game".into()
            } else {
                window.title.clone()
            },
            focused: Some(window.id) == best,
            token: format!("{}:{}", window.pid, window.id),
        })
        .collect()
}
#[cfg(target_os = "macos")]
fn mac_windows() -> Vec<ListedWindow> {
    use std::ffi::c_void;
    extern "C" {
        static _dispatch_main_q: u8;
        fn dispatch_sync_f(
            queue: *mut c_void,
            context: *mut c_void,
            work: extern "C" fn(*mut c_void),
        );
        fn pthread_main_np() -> i32;
    }
    extern "C" fn fill(context: *mut c_void) {
        let slot = unsafe { &mut *(context as *mut Vec<ListedWindow>) };
        *slot = mac_windows_inner();
    }
    if unsafe { pthread_main_np() } != 0 {
        return mac_windows_inner();
    }
    let mut windows = Vec::new();
    unsafe {
        dispatch_sync_f(
            std::ptr::addr_of!(_dispatch_main_q) as *mut c_void,
            &mut windows as *mut Vec<ListedWindow> as *mut c_void,
            fill,
        );
    }
    windows
}
#[cfg(target_os = "macos")]
fn mac_windows_inner() -> Vec<ListedWindow> {
    use std::ffi::{c_void, CStr, CString};
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWindowListCopyWindowInfo(option: u32, relative: u32) -> *const c_void;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFArrayGetCount(array: *const c_void) -> isize;
        fn CFArrayGetValueAtIndex(array: *const c_void, index: isize) -> *const c_void;
        fn CFDictionaryGetValue(dict: *const c_void, key: *const c_void) -> *const c_void;
        fn CFStringCreateWithCString(
            alloc: *const c_void,
            cstr: *const i8,
            encoding: u32,
        ) -> *const c_void;
        fn CFStringGetCString(
            string: *const c_void,
            buffer: *mut i8,
            size: isize,
            encoding: u32,
        ) -> bool;
        fn CFNumberGetValue(number: *const c_void, kind: isize, value: *mut c_void) -> bool;
        fn CFGetTypeID(value: *const c_void) -> usize;
        fn CFStringGetTypeID() -> usize;
        fn CFNumberGetTypeID() -> usize;
        fn CFDictionaryGetTypeID() -> usize;
        fn CFRelease(value: *const c_void);
    }
    const ON_SCREEN: u32 = 1 | 16;
    const UTF8: u32 = 0x0800_0100;
    const SINT64: isize = 4;
    unsafe {
        let list = CGWindowListCopyWindowInfo(ON_SCREEN, 0);
        if list.is_null() {
            return Vec::new();
        }
        let make_key = |name: &str| {
            let c = CString::new(name).unwrap();
            CFStringCreateWithCString(std::ptr::null(), c.as_ptr(), UTF8)
        };
        let pid_key = make_key("kCGWindowOwnerPID");
        let id_key = make_key("kCGWindowNumber");
        let layer_key = make_key("kCGWindowLayer");
        let bounds_key = make_key("kCGWindowBounds");
        let width_key = make_key("Width");
        let height_key = make_key("Height");
        let name_key = make_key("kCGWindowName");
        let owner_key = make_key("kCGWindowOwnerName");
        let number = |value: *const c_void| -> Option<i64> {
            if value.is_null() || CFGetTypeID(value) != CFNumberGetTypeID() {
                return None;
            }
            let mut out = 0i64;
            CFNumberGetValue(value, SINT64, &mut out as *mut i64 as *mut c_void).then_some(out)
        };
        let text = |value: *const c_void| -> String {
            if value.is_null() || CFGetTypeID(value) != CFStringGetTypeID() {
                return String::new();
            }
            let mut buf = [0i8; 512];
            if CFStringGetCString(value, buf.as_mut_ptr(), buf.len() as isize, UTF8) {
                CStr::from_ptr(buf.as_ptr()).to_string_lossy().into_owned()
            } else {
                String::new()
            }
        };
        let mut windows = Vec::new();
        for index in 0..CFArrayGetCount(list) {
            let dict = CFArrayGetValueAtIndex(list, index);
            if dict.is_null() || CFGetTypeID(dict) != CFDictionaryGetTypeID() {
                continue;
            }
            let Some(pid) = number(CFDictionaryGetValue(dict, pid_key)) else {
                continue;
            };
            let Some(id) = number(CFDictionaryGetValue(dict, id_key)) else {
                continue;
            };
            let bounds = CFDictionaryGetValue(dict, bounds_key);
            let (width, height) = if !bounds.is_null() && CFGetTypeID(bounds) == CFDictionaryGetTypeID()
            {
                (
                    number(CFDictionaryGetValue(bounds, width_key)).unwrap_or(0),
                    number(CFDictionaryGetValue(bounds, height_key)).unwrap_or(0),
                )
            } else {
                (0, 0)
            };
            let mut title = text(CFDictionaryGetValue(dict, name_key));
            if title.is_empty() {
                title = text(CFDictionaryGetValue(dict, owner_key));
            }
            windows.push(ListedWindow {
                id: id as u32,
                pid: pid as u32,
                layer: number(CFDictionaryGetValue(dict, layer_key)).unwrap_or(0) as i32,
                width,
                height,
                title,
            });
        }
        for key in [
            pid_key, id_key, layer_key, bounds_key, width_key, height_key, name_key, owner_key,
        ] {
            if !key.is_null() {
                CFRelease(key);
            }
        }
        CFRelease(list);
        windows
    }
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
#[cfg(not(target_os = "macos"))]
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
    #[cfg(target_os = "macos")]
    {
        let listed = mac_windows();
        return Ok(!listed
            .iter()
            .any(|window| window.id == target.id && window.pid == target.pid));
    }
    #[cfg(not(target_os = "macos"))]
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
        #[cfg(target_os = "macos")]
        {
            let _ = &self.target;
            return Err("Screen capture requires macOS 12.3.".into());
        }
        #[cfg(not(target_os = "macos"))]
        {
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
fn mac_screen_capture_allowed() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
    }
    unsafe { CGPreflightScreenCaptureAccess() }
}
#[cfg(target_os = "macos")]
fn mac_request_screen_capture() {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGRequestScreenCaptureAccess() -> bool;
    }
    unsafe {
        let _ = CGRequestScreenCaptureAccess();
    }
}
#[cfg(target_os = "macos")]
fn mac_activate() {
    use std::ffi::c_void;
    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const i8) -> *mut c_void;
        fn sel_registerName(name: *const i8) -> *mut c_void;
        fn objc_msgSend();
    }
    unsafe {
        let class = objc_getClass(c"NSApplication".as_ptr());
        if class.is_null() {
            return;
        }
        let shared: unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        let app = shared(class, sel_registerName(c"sharedApplication".as_ptr()));
        if app.is_null() {
            return;
        }
        let activate: unsafe extern "C" fn(*mut c_void, *mut c_void, bool) =
            std::mem::transmute(objc_msgSend as *const ());
        activate(
            app,
            sel_registerName(c"activateIgnoringOtherApps:".as_ptr()),
            true,
        );
    }
}
/// Screen Recording prompts are dropped when this runs off the main thread, so
/// Control+J looks like it did nothing. Bring the app forward only when asking
/// for permission; an authorized capture must leave the game focused.
#[cfg(target_os = "macos")]
fn mac_prepare_screen_capture() -> bool {
    use std::{ffi::c_void, sync::atomic::{AtomicBool, Ordering}};
    static ALLOWED: AtomicBool = AtomicBool::new(false);
    extern "C" {
        // C `dispatch_get_main_queue()` is `&_dispatch_main_q`.
        static _dispatch_main_q: u8;
        fn dispatch_sync_f(
            queue: *mut c_void,
            context: *mut c_void,
            work: extern "C" fn(*mut c_void),
        );
        fn pthread_main_np() -> i32;
    }
    extern "C" fn work(_: *mut c_void) {
        if !mac_screen_capture_allowed() {
            mac_activate();
            mac_request_screen_capture();
        }
        ALLOWED.store(mac_screen_capture_allowed(), Ordering::SeqCst);
    }
    unsafe {
        if pthread_main_np() != 0 {
            work(std::ptr::null_mut());
        } else {
            dispatch_sync_f(
                std::ptr::addr_of!(_dispatch_main_q) as *mut c_void,
                std::ptr::null_mut(),
                work,
            );
        }
    }
    ALLOWED.load(Ordering::SeqCst)
}
/// A switch that already looks on is not a grant for this process. macOS
/// keeps the old grant until the switch is toggled and the app is reopened.
#[cfg(any(target_os = "macos", test))]
fn screen_recording_denied() -> String {
    "In Privacy & Security, Screen Recording, switch AquaStar NEO off and back on, then quit and reopen AquaStar NEO.".into()
}
#[cfg(any(target_os = "macos", test))]
fn helper_line_denies_screen_recording(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.contains("declined tccs") || lower.contains("code=-3801")
}
#[cfg(target_os = "macos")]
fn mac_frames(target: &Target) -> Result<Frames, String> {
    use std::{
        io::Read,
        process::{Command, Stdio},
        sync::atomic::Ordering,
    };
    // Preflight stays false while the switch is already on. Ask here, then
    // let ScreenCaptureKit accept or return the real denial.
    let _ = mac_prepare_screen_capture();
    let mut child = Command::new(mac_helper()?)
        .args(["frames", &target.pid.to_string(), &target.id.to_string()])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let mut output = child.stdout.take().unwrap();
    let helper_error = Arc::new(Mutex::new(String::new()));
    if let Some(mut stderr) = child.stderr.take() {
        let helper_error = helper_error.clone();
        std::thread::spawn(move || {
            let mut text = String::new();
            let _ = stderr.read_to_string(&mut text);
            *helper_error.lock().unwrap() = text;
        });
    }
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
    let helper_error = helper_error.clone();
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
            *error.lock().unwrap() = Some(native_capture_error(e, &helper_error));
        }
    });
    Ok(frames)
}
#[cfg(target_os = "macos")]
fn native_capture_error(fallback: String, helper_error: &Arc<Mutex<String>>) -> String {
    let mut helper = String::new();
    for _ in 0..10 {
        helper = helper_error.lock().unwrap().clone();
        if !helper.trim().is_empty() {
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    if let Some(line) = helper.lines().map(str::trim).find(|line| !line.is_empty()) {
        if helper_line_denies_screen_recording(line) {
            eprintln!("aquastar-neo: capture helper: {line}");
            return screen_recording_denied();
        }
        return line.to_string();
    }
    if !mac_screen_capture_allowed() {
        return screen_recording_denied();
    }
    fallback
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
    #[test]
    fn keeps_the_visible_game_window() {
        let windows = vec![
            ListedWindow {
                id: 1,
                pid: 10,
                layer: 0,
                width: 40,
                height: 40,
                title: "tiny".into(),
            },
            ListedWindow {
                id: 2,
                pid: 10,
                layer: 0,
                width: 960,
                height: 578,
                title: String::new(),
            },
            ListedWindow {
                id: 3,
                pid: 99,
                layer: 0,
                width: 960,
                height: 578,
                title: "other".into(),
            },
            ListedWindow {
                id: 4,
                pid: 10,
                layer: 3,
                width: 960,
                height: 578,
                title: "overlay".into(),
            },
        ];
        let found = targets_from_listed(&windows, &[10]);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, 2);
        assert!(found[0].focused);
        assert_eq!(found[0].title, "Game");
        assert_eq!(found[0].token, "10:2");
    }
    #[test]
    fn only_a_tcc_denial_asks_to_reset_screen_recording() {
        assert!(helper_line_denies_screen_recording(
            "Capture: Error Domain=com.apple.ScreenCaptureKit.SCStreamErrorDomain Code=-3801 \"The user declined TCCs for application, window, display capture\""
        ));
        assert!(!helper_line_denies_screen_recording(
            "ScreenCaptureKit requires macOS 12.3."
        ));
        assert!(!helper_line_denies_screen_recording(
            "Capture: Error Domain=Game window is no longer available Code=4"
        ));
        assert!(screen_recording_denied().contains("off and back on"));
        assert!(screen_recording_denied().contains("Screen Recording"));
    }
}
