//! Short, silent desktop feedback; never creates or focuses an AquaStar NEO window.
pub fn show(app: &tauri::AppHandle, title: &str, body: &str) {
    let title = title.to_owned();
    let body: String = body.chars().take(240).collect();
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        static QUEUE: std::sync::OnceLock<std::sync::mpsc::SyncSender<(String, String)>> =
            std::sync::OnceLock::new();
        let queue = QUEUE.get_or_init(|| {
            let (sender, receiver) = std::sync::mpsc::sync_channel::<(String, String)>(8);
            std::thread::spawn(move || {
                let mut previous = 0u32;
                // GNOME binds notification IDs and source lifetime to this D-Bus sender.
                // Keep the connection alive across messages and while the app is idle.
                let mut connection = None;
                for (title, body) in receiver {
                    let result = tauri::async_runtime::block_on(async {
                        use ashpd::zvariant::{OwnedValue, Value};
                        if connection.is_none() {
                            connection = Some(ashpd::zbus::Connection::session().await?);
                        }
                        let proxy = ashpd::zbus::Proxy::new(
                            connection.as_ref().unwrap(),
                            "org.freedesktop.Notifications",
                            "/org/freedesktop/Notifications",
                            "org.freedesktop.Notifications",
                        )
                        .await?;
                        let mut hints = std::collections::HashMap::<&str, OwnedValue>::new();
                        hints.insert("urgency", Value::from(1u8).try_into().unwrap());
                        hints.insert("suppress-sound", Value::from(true).try_into().unwrap());
                        hints.insert("transient", Value::from(true).try_into().unwrap());
                        proxy
                            .call::<_, _, u32>(
                                "Notify",
                                &(
                                    "AquaStar NEO",
                                    previous,
                                    "camera-photo",
                                    title,
                                    body,
                                    Vec::<String>::new(),
                                    hints,
                                    2500i32,
                                ),
                            )
                            .await
                    });
                    match result {
                        Ok(id) => previous = id,
                        Err(error) => {
                            eprintln!("AquaStar NEO: desktop notification failed: {error}");
                            previous = 0;
                            connection = None;
                        }
                    }
                }
            });
            sender
        });
        let _ = queue.try_send((title, body));
    }
    #[cfg(target_os = "macos")]
    if title.contains("failed") && body.contains("Screen Recording") {
        mac_open_screen_recording_settings();
        mac_alert(&title, &body);
    }
    #[cfg(not(target_os = "linux"))]
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
