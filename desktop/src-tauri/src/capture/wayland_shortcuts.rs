//! Wayland shortcuts must go through the desktop portal, not XGrabKey.
use ashpd::desktop::global_shortcuts::{GlobalShortcuts, NewShortcut};
use futures_util::{
    future::{select, Either},
    StreamExt,
};
use std::sync::Mutex;
use tauri::Manager;

type Binding = (String, String);
struct Registration {
    bindings: Vec<Binding>,
    stop: tauri::async_runtime::Sender<()>,
}
static ACTIVE: Mutex<Option<Registration>> = Mutex::new(None);

fn trigger(accel: &crate::profile::Accelerator) -> String {
    format!(
        "{}{}{}{}{}",
        if accel.control || accel.command_or_control {
            "CTRL+"
        } else {
            ""
        },
        if accel.alt { "ALT+" } else { "" },
        if accel.shift { "SHIFT+" } else { "" },
        if accel.meta { "LOGO+" } else { "" },
        accel.key.to_uppercase()
    )
}

pub fn sync(app: &tauri::AppHandle) {
    if !super::backend::is_wayland() {
        return;
    }
    let mut bindings = Vec::new();
    if !app.state::<crate::Players>().capture_pids().is_empty()
        && !super::gnome_shortcuts_enabled(app)
    {
        let merged = crate::profile::merged_settings(&crate::profile::live_files());
        for bind in crate::manifest::keybinds() {
            if !matches!(bind.id.as_str(), "sshot" | "record") {
                continue;
            }
            for accel in crate::manifest::accelerators(&bind, merged.get(&bind.id)) {
                if let Some(accel) = crate::profile::parse_accelerator(&accel) {
                    bindings.push((bind.id.clone(), trigger(&accel)));
                }
            }
        }
    }
    let mut active = ACTIVE.lock().unwrap_or_else(|e| e.into_inner());
    if active.as_ref().is_some_and(|r| r.bindings == bindings) {
        return;
    }
    if let Some(previous) = active.take() {
        let _ = previous.stop.try_send(());
    }
    if bindings.is_empty() {
        return;
    }
    let (stop, mut stopped) = tauri::async_runtime::channel(1);
    *active = Some(Registration {
        bindings: bindings.clone(),
        stop,
    });
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = async {
            super::backend::register_portal_identity().await?;
            let portal = GlobalShortcuts::new().await.map_err(|e| e.to_string())?;
            let session = portal.create_session().await.map_err(|e| e.to_string())?;
            let session_path = serde_json::to_value(&session).map_err(|e| e.to_string())?;
            let mut events = portal
                .receive_activated()
                .await
                .map_err(|e| e.to_string())?;
            let shortcuts: Vec<_> = bindings
                .iter()
                .enumerate()
                .map(|(index, (action, key))| {
                    NewShortcut::new(
                        format!("{action}-{index}"),
                        if action == "sshot" {
                            "Save game screenshot"
                        } else {
                            "Start/stop game recording"
                        },
                    )
                    .preferred_trigger(Some(key.as_str()))
                })
                .collect();
            // Cancellation covers permission dialogs too. Closing the session releases bindings.
            let registration = portal.bind_shortcuts(&session, &shortcuts, None);
            let ready = match select(Box::pin(registration), Box::pin(stopped.recv())).await {
                Either::Left((result, _)) => result
                    .map(|r| r.response())
                    .map_err(|e| e.to_string())?
                    .map_err(|e| e.to_string()),
                Either::Right(_) => {
                    let _ = session.close().await;
                    return Ok(());
                }
            };
            if let Err(error) = ready {
                let _ = session.close().await;
                return Err(error);
            }
            loop {
                match select(Box::pin(events.next()), Box::pin(stopped.recv())).await {
                    Either::Left((Some(event), _)) => {
                        if Some(event.session_handle().as_str()) != session_path.as_str() {
                            continue;
                        }
                        if let Some(index) = event
                            .shortcut_id()
                            .rsplit('-')
                            .next()
                            .and_then(|s| s.parse::<usize>().ok())
                        {
                            if let Some((action, _)) = bindings.get(index) {
                                if !app.state::<crate::Players>().capture_pids().is_empty() {
                                    crate::dispatch(&app, action, false);
                                }
                            }
                        }
                    }
                    _ => break,
                }
            }
            let _ = session.close().await;
            Ok::<(), String>(())
        }
        .await;
        if let Err(error) = result {
            eprintln!("aquastar-lite: Wayland capture shortcuts: {error}");
        }
    });
}

pub fn suspend() {
    if let Some(active) = ACTIVE.lock().unwrap_or_else(|e| e.into_inner()).take() {
        let _ = active.stop.try_send(());
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn portal_triggers_follow_saved_accelerators() {
        for (input, expected) in [
            ("F2", "F2"),
            ("Ctrl+J", "CTRL+J"),
            ("Alt+Shift+K", "ALT+SHIFT+K"),
        ] {
            assert_eq!(
                super::trigger(&crate::profile::parse_accelerator(input).unwrap()),
                expected
            );
        }
    }
}
