//! Short, silent desktop feedback; never creates or focuses an AquaStar window.
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
                                    "AquaStar",
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
                            eprintln!("AquaStar: desktop notification failed: {error}");
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
    #[cfg(not(target_os = "linux"))]
    {
        use tauri_plugin_notification::NotificationExt;
        let _ = app.notification().builder().title(title).body(body).show();
    }
}
