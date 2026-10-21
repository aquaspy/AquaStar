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
        match accel.key.to_ascii_lowercase().as_str() {
            "space" => "space".into(),
            "enter" | "return" => "Return".into(),
            "esc" | "escape" => "Escape".into(),
            "tab" => "Tab".into(),
            "backspace" => "BackSpace".into(),
            "delete" => "Delete".into(),
            "insert" => "Insert".into(),
            "home" => "Home".into(),
            "end" => "End".into(),
            "pageup" => "Page_Up".into(),
            "pagedown" => "Page_Down".into(),
            "up" | "arrowup" => "Up".into(),
            "down" | "arrowdown" => "Down".into(),
            "left" | "arrowleft" => "Left".into(),
            "right" | "arrowright" => "Right".into(),
            "-" => "minus".into(),
            "=" => "equal".into(),
            "," => "comma".into(),
            "." => "period".into(),
            "/" => "slash".into(),
            ";" => "semicolon".into(),
            "'" => "apostrophe".into(),
            "[" => "bracketleft".into(),
            "]" => "bracketright".into(),
            "\\" => "backslash".into(),
            "`" => "grave".into(),
            _ => accel.key.to_uppercase(),
        }
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
    let owner = stop.clone();
    *active = Some(Registration {
        bindings: bindings.clone(),
        stop,
    });
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = async {
            crate::portal_identity::register().await?;
            let portal = GlobalShortcuts::new().await.map_err(|e| e.to_string())?;
            let session = portal.create_session().await.map_err(|e| e.to_string())?;
            let result = async {
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
                        return Ok(());
                    }
                };
                ready?;
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
                Ok::<(), String>(())
            }
            .await;
            let _ = session.close().await;
            result
        }
        .await;
        release(&ACTIVE, &owner);
        if let Err(error) = result {
            eprintln!("aquastar-lite: Wayland capture shortcuts: {error}");
        }
    });
}

fn release(active: &Mutex<Option<Registration>>, owner: &tauri::async_runtime::Sender<()>) {
    let mut active = active.lock().unwrap_or_else(|e| e.into_inner());
    if active.as_ref().is_some_and(|r| r.stop.same_channel(owner)) {
        *active = None;
    }
}

pub fn suspend() {
    if let Some(active) = ACTIVE.lock().unwrap_or_else(|e| e.into_inner()).take() {
        let _ = active.stop.try_send(());
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn completed_registration_allows_retry_but_cannot_clear_replacement() {
        let (owner, _receiver) = tauri::async_runtime::channel(1);
        let active = std::sync::Mutex::new(Some(super::Registration {
            bindings: vec![("sshot".into(), "F2".into())],
            stop: owner.clone(),
        }));
        super::release(&active, &owner);
        assert!(
            active.lock().unwrap().is_none(),
            "failed setup must permit retry"
        );
        let (replacement, _receiver) = tauri::async_runtime::channel(1);
        *active.lock().unwrap() = Some(super::Registration {
            bindings: vec![("sshot".into(), "F2".into())],
            stop: replacement.clone(),
        });
        super::release(&active, &owner);
        assert!(active
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .stop
            .same_channel(&replacement));
        super::release(&active, &replacement);
        assert!(active.lock().unwrap().is_none());
    }
    #[test]
    fn portal_triggers_follow_saved_accelerators() {
        for (input, expected) in [
            ("F2", "F2"),
            ("Ctrl+J", "CTRL+J"),
            ("Alt+Shift+K", "ALT+SHIFT+K"),
            ("Ctrl+PageDown", "CTRL+Page_Down"),
            ("Alt+ArrowLeft", "ALT+Left"),
            ("Ctrl+Space", "CTRL+space"),
            ("Shift+Escape", "SHIFT+Escape"),
            ("Ctrl+Enter", "CTRL+Return"),
            ("Ctrl+Esc", "CTRL+Escape"),
            ("Ctrl+Backspace", "CTRL+BackSpace"),
            ("Ctrl+PageUp", "CTRL+Page_Up"),
            ("Ctrl+-", "CTRL+minus"),
            ("Ctrl+=", "CTRL+equal"),
            ("Ctrl+,", "CTRL+comma"),
            ("Ctrl+.", "CTRL+period"),
            ("Ctrl+/", "CTRL+slash"),
            ("Ctrl+;", "CTRL+semicolon"),
            ("Ctrl+'", "CTRL+apostrophe"),
            ("Ctrl+[", "CTRL+bracketleft"),
            ("Ctrl+]", "CTRL+bracketright"),
            ("Ctrl+\\", "CTRL+backslash"),
            ("Ctrl+`", "CTRL+grave"),
        ] {
            assert_eq!(
                super::trigger(&crate::profile::parse_accelerator(input).unwrap()),
                expected
            );
        }
    }
}
