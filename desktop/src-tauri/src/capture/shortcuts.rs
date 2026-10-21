//! Opt-in GNOME custom shortcuts for desktops without the GlobalShortcuts portal.
use std::{process::Command, sync::Mutex};
use tauri::Manager;
const SCHEMA: &str = "org.gnome.settings-daemon.plugins.media-keys";
const CUSTOM: &str = "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding";
const ROOT: &str = "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/";
const IDS: [&str; 2] = ["aquastar-capture-screenshot", "aquastar-capture-record"];
static UPDATE: Mutex<()> = Mutex::new(());
static CLOSING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
fn run(args: &[&str]) -> Result<String, String> {
    let output = Command::new("gsettings")
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}
pub fn supported() -> bool {
    super::backend::is_wayland()
        && std::env::var("XDG_CURRENT_DESKTOP")
            .unwrap_or_default()
            .split(':')
            .any(|s| s.eq_ignore_ascii_case("gnome"))
        && run(&["get", SCHEMA, "custom-keybindings"]).is_ok()
}
fn paths(value: &str) -> Result<Vec<String>, String> {
    let value = value.strip_prefix("@as ").unwrap_or(value).trim();
    let inner = value
        .strip_prefix('[')
        .and_then(|s| s.strip_suffix(']'))
        .ok_or("Cannot safely read existing desktop shortcuts.")?;
    if inner.trim().is_empty() {
        return Ok(vec![]);
    }
    inner
        .split(',')
        .map(|p| {
            let p = p.trim().trim_matches('\'');
            if !p.starts_with(ROOT)
                || !p.ends_with('/')
                || !p
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"/_-".contains(&b))
            {
                return Err(
                    "Unexpected desktop shortcut path; existing settings were preserved.".into(),
                );
            }
            Ok(p.to_owned())
        })
        .collect()
}
fn quoted(value: &str) -> String {
    format!("{value:?}")
}
fn command(exe: &std::path::Path, flag: &str) -> Result<String, String> {
    let exe = exe.to_str().ok_or("Unsupported executable path")?;
    if exe.chars().any(char::is_control) {
        return Err("Unsupported executable path".into());
    }
    Ok(format!("'{}' {flag}", exe.replace('\'', "'\\''")))
}
fn accelerator(id: &str) -> String {
    let merged = crate::profile::merged_settings(&crate::profile::live_files());
    crate::manifest::keybinds()
        .into_iter()
        .find(|b| b.id == id)
        .and_then(|b| {
            crate::manifest::accelerators(&b, merged.get(id))
                .first()
                .cloned()
        })
        .and_then(|a| crate::profile::parse_accelerator(&a))
        .map(|a| {
            format!(
                "{}{}{}{}{}",
                if a.control || a.command_or_control {
                    "<Control>"
                } else {
                    ""
                },
                if a.alt { "<Alt>" } else { "" },
                if a.shift { "<Shift>" } else { "" },
                if a.meta { "<Super>" } else { "" },
                if a.key.len() == 1 {
                    a.key.to_lowercase()
                } else {
                    a.key
                }
            )
        })
        .unwrap_or_default()
}
fn apply(app: &tauri::AppHandle, requested: Option<bool>, suspend: bool) -> Result<(), String> {
    let _guard = UPDATE.lock().unwrap_or_else(|e| e.into_inner());
    let enabled = requested.unwrap_or_else(|| super::settings(app).gnome_shortcuts);
    let active = !suspend
        && !CLOSING.load(std::sync::atomic::Ordering::SeqCst)
        && !app
            .state::<crate::players::Players>()
            .capture_pids()
            .is_empty();
    let mut list = paths(&run(&["get", SCHEMA, "custom-keybindings"])?)?;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    for (index, id) in IDS.iter().enumerate() {
        let path = format!("{ROOT}{id}/");
        let schema = format!("{CUSTOM}:{path}");
        let name = if index == 0 {
            "AquaStar Screenshot"
        } else {
            "AquaStar Recording"
        };
        if list.contains(&path) {
            let existing = run(&["get", &schema, "name"])?;
            if existing.trim_matches('\'').trim_matches('"') != name {
                return Err(
                    "A desktop shortcut with this name already exists; it was not changed.".into(),
                );
            }
        }
    }
    for (index, id) in IDS.iter().enumerate() {
        let path = format!("{ROOT}{id}/");
        let schema = format!("{CUSTOM}:{path}");
        let name = if index == 0 {
            "AquaStar Screenshot"
        } else {
            "AquaStar Recording"
        };
        if enabled {
            let flag = if index == 0 {
                "--capture-screenshot"
            } else {
                "--capture-record"
            };
            let binding = if active {
                accelerator(if index == 0 { "sshot" } else { "record" })
            } else {
                String::new()
            };
            run(&["set", &schema, "name", &quoted(name)])?;
            run(&["set", &schema, "command", &quoted(&command(&exe, flag)?)])?;
            run(&["set", &schema, "binding", &quoted(&binding)])?;
            if !list.contains(&path) {
                list.push(path);
            }
        } else {
            list.retain(|p| p != &path);
            // Only AquaStar's named entries are reset, never unrelated shortcuts.
            run(&["reset-recursively", &schema])?;
        }
    }
    let value = format!(
        "[{}]",
        list.iter()
            .map(|p| format!("'{p}'"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    run(&["set", SCHEMA, "custom-keybindings", &value])?;
    let _ = app;
    Ok(())
}
pub fn configure(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if !supported() {
        return Err("GNOME capture shortcut integration is not available on this desktop.".into());
    }
    apply(app, Some(enabled), false)
}
pub fn sync(app: &tauri::AppHandle) {
    if !super::settings(app).gnome_shortcuts || !supported() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        // Read current state inside the worker so a quick player exit cannot leave stale keys active.
        if let Err(error) = apply(&app, None, false) {
            super::feedback::show(&app, "AquaStar NEO · Shortcut setup", &error);
        }
    });
}
pub fn suspend(app: &tauri::AppHandle) {
    CLOSING.store(true, std::sync::atomic::Ordering::SeqCst);
    if super::settings(app).gnome_shortcuts && supported() {
        let _ = apply(app, None, true);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn desktop_list_parser_preserves_other_bindings_and_rejects_injection() {
        let path = format!("{ROOT}custom0/");
        assert_eq!(paths(&format!("['{path}']")).unwrap(), vec![path]);
        assert!(paths("@as []").unwrap().is_empty());
        assert!(paths("['/tmp/not-a-shortcut/']").is_err());
        assert!(paths(
            "['/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/a';bad/']"
        )
        .is_err());
        assert_eq!(
            command(
                std::path::Path::new("/tmp/Aqua Star/it's"),
                "--capture-record"
            )
            .unwrap(),
            "'/tmp/Aqua Star/it'\\''s' --capture-record"
        );
    }
}
