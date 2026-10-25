//! Silent desktop feedback and nonactivating game borders; never focuses a window.
#[cfg(target_os = "macos")]
extern "C" {
    fn aquastar_capture_screenshot_border(pid: u32, window: u32);
    fn aquastar_capture_recording_border(pid: u32, window: u32, generation: u64, active: bool);
    fn aquastar_capture_notify(title: *const std::ffi::c_char, body: *const std::ffi::c_char);
}

#[cfg(target_os = "macos")]
pub fn screenshot_taken(target: &super::backend::Target) {
    unsafe {
        aquastar_capture_screenshot_border(target.pid, target.id);
    }
}

#[cfg(not(target_os = "macos"))]
#[path = "border.rs"]
mod border;

#[cfg(not(target_os = "macos"))]
pub fn screenshot_taken(target: &super::backend::Target) {
    border::flash(target.pid, target.id);
}

pub struct RecordingBorder {
    #[cfg(target_os = "macos")]
    generation: u64,
    #[cfg(not(target_os = "macos"))]
    generation: u64,
}
impl RecordingBorder {
    #[cfg(target_os = "macos")]
    pub fn new(target: &super::backend::Target) -> Self {
        use std::sync::atomic::{AtomicU64, Ordering};
        static GENERATION: AtomicU64 = AtomicU64::new(1);
        let generation = GENERATION.fetch_add(1, Ordering::Relaxed);
        unsafe {
            aquastar_capture_recording_border(target.pid, target.id, generation, true);
        }
        Self { generation }
    }

    #[cfg(not(target_os = "macos"))]
    pub fn new(target: &super::backend::Target) -> Self {
        Self {
            generation: border::show_recording(target.pid, target.id),
        }
    }
}
impl Drop for RecordingBorder {
    fn drop(&mut self) {
        #[cfg(target_os = "macos")]
        unsafe {
            aquastar_capture_recording_border(0, 0, self.generation, false);
        }
        #[cfg(not(target_os = "macos"))]
        border::hide_recording(self.generation);
    }
}

#[cfg(target_os = "linux")]
#[path = "notify_linux.rs"]
mod notify_linux;

pub fn show(app: &tauri::AppHandle, title: &str, body: &str) {
    let title = title.to_owned();
    let body: String = body.chars().take(240).collect();
    #[cfg(target_os = "linux")]
    notify_linux::show(app, &title, &body);
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        if title.contains("failed") && body.contains("Screen Recording") {
            mac_open_screen_recording_settings();
            mac_alert(&title, &body);
        }
        let title = match title.as_str() {
            "AquaStar NEO · Screenshot saved" => "Screenshot taken",
            "AquaStar NEO · Recording" => "Recording started",
            "AquaStar NEO · Video saved" => "Recording stopped",
            _ => &title,
        };
        if let (Ok(title), Ok(body)) = (std::ffi::CString::new(title), std::ffi::CString::new(body)) {
            unsafe { aquastar_capture_notify(title.as_ptr(), body.as_ptr()) };
        }
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        use tauri_plugin_notification::NotificationExt;
        let _ = app.notification().builder().title(title).body(body).show();
    }
}
#[cfg(target_os = "macos")]
fn mac_open_screen_recording_settings() {
    let _ = std::process::Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture")
        .spawn();
}
#[cfg(target_os = "macos")]
fn mac_alert(title: &str, body: &str) {
    use std::ffi::{c_void, CString};
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithCString(
            alloc: *const c_void,
            cstr: *const i8,
            encoding: u32,
        ) -> *const c_void;
        fn CFRelease(value: *const c_void);
        fn CFUserNotificationDisplayAlert(
            timeout: f64,
            flags: usize,
            icon: *const c_void,
            sound: *const c_void,
            localization: *const c_void,
            header: *const c_void,
            message: *const c_void,
            default_button: *const c_void,
            alternate_button: *const c_void,
            other_button: *const c_void,
            response: *mut usize,
        ) -> i32;
    }
    const UTF8: u32 = 0x0800_0100;
    let string = |text: &str| {
        let c = CString::new(text).unwrap_or_else(|_| CString::new("AquaStar NEO").unwrap());
        unsafe { CFStringCreateWithCString(std::ptr::null(), c.as_ptr(), UTF8) }
    };
    unsafe {
        let header = string(title);
        let message = string(body);
        let button = string("OK");
        if !header.is_null() && !message.is_null() {
            let _ = CFUserNotificationDisplayAlert(
                0.0,
                1,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                header,
                message,
                button,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null_mut(),
            );
        }
        for value in [header, message, button] {
            if !value.is_null() {
                CFRelease(value);
            }
        }
    }
}
