//! Optional, reversible bindings for Omarchy's Lua-based Hyprland config.
//! Hyprland exposes portal actions but does not install their preferred triggers.

use serde::Serialize;
use std::{
    env, fs,
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

const BEGIN: &str = "-- BEGIN AQUASTAR MANAGED HYPRLAND SHORTCUTS";
const END: &str = "-- END AQUASTAR MANAGED HYPRLAND SHORTCUTS";
const APP_ID: &str = "io.github.aquaspy.aquastar-lite";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    pub visible: bool,
    pub active_session: bool,
    pub supported: bool,
    pub installed: bool,
    pub path: Option<PathBuf>,
    pub backup_path: Option<PathBuf>,
    pub message: String,
}

fn desktop_identifies_hyprland(value: &str) -> bool {
    value
        .split(|character: char| character == ':' || character == ';' || character.is_whitespace())
        .any(|desktop| desktop.eq_ignore_ascii_case("hyprland"))
}

fn active_hyprland_session() -> bool {
    #[cfg(target_os = "linux")]
    {
        if env::var_os("HYPRLAND_INSTANCE_SIGNATURE").is_some_and(|value| !value.is_empty()) {
            return true;
        }
        return ["XDG_CURRENT_DESKTOP", "XDG_SESSION_DESKTOP"]
            .into_iter()
            .filter_map(|name| env::var(name).ok())
            .any(|value| desktop_identifies_hyprland(&value));
    }

    #[cfg(not(target_os = "linux"))]
    false
}

fn bindings_path() -> Option<PathBuf> {
    let config = env::var_os("XDG_CONFIG_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))?;
    Some(config.join("hypr/bindings.lua"))
}

pub fn status() -> SetupStatus {
    let active_session = active_hyprland_session();
    let Some(path) = bindings_path() else {
        return SetupStatus {
            visible: active_session,
            active_session,
            supported: false,
            installed: false,
            path: None,
            backup_path: None,
            message: "Could not locate the user's config directory.".into(),
        };
    };
    let Ok(metadata) = fs::symlink_metadata(&path) else {
        return SetupStatus {
            visible: active_session,
            active_session,
            supported: false,
            installed: false,
            path: Some(path),
            backup_path: None,
            message: "Omarchy's Lua bindings file was not found.".into(),
        };
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return SetupStatus {
            visible: active_session,
            active_session,
            supported: false,
            installed: false,
            path: Some(path),
            backup_path: None,
            message:
                "The bindings file is not a regular file, so AquaStar NEO will leave it untouched."
                    .into(),
        };
    }
    let Ok(contents) = fs::read_to_string(&path) else {
        return SetupStatus {
            visible: active_session,
            active_session,
            supported: false,
            installed: false,
            path: Some(path),
            backup_path: None,
            message: "Could not read the Omarchy Lua bindings file.".into(),
        };
    };
    let installed = has_managed_block(&contents);
    let supported = installed || contents.contains("hl.bind(") || contents.contains("hl.bind (");
    SetupStatus {
        visible: active_session || installed,
        active_session,
        supported,
        installed,
        path: Some(path),
        backup_path: None,
        message: if installed {
            if active_session {
                "AquaStar NEO's managed bindings are saved. Reload Hyprland, then test a shortcut to confirm the compositor loaded them.".into()
            } else {
                "AquaStar NEO's managed bindings are saved. They apply in your next Hyprland session."
                    .into()
            }
        } else if supported {
            "Omarchy's Lua keybindings are available for setup.".into()
        } else {
            "This file does not appear to use Omarchy's hl.bind() Lua API.".into()
        },
    }
}

pub fn install() -> Result<SetupStatus, String> {
    let path = bindings_path().ok_or("Could not locate the user's config directory.")?;
    let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(
            "The Hyprland bindings path is not a regular file; AquaStar NEO left it untouched.".into(),
        );
    }
    let current = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let (base, _) = strip_managed_block(&current)?;
    if !has_managed_block(&current)
        && !current.contains("hl.bind(")
        && !current.contains("hl.bind (")
    {
        return Err("AquaStar NEO only edits Omarchy-style Lua bindings that use hl.bind().".into());
    }

    let planned = plan_bindings(&base)?;
    let active_bindings = Command::new("omarchy")
        .args(["menu", "keybindings", "--print"])
        .output()
        .map_err(|error| {
            format!("Could not check Omarchy's current keybindings ({error}); AquaStar NEO left the config untouched.")
        })?;
    if !active_bindings.status.success() {
        return Err(
            "Could not check Omarchy's current keybindings; AquaStar NEO left the config untouched."
                .into(),
        );
    }
    let active_bindings = String::from_utf8_lossy(&active_bindings.stdout);
    let old_managed = managed_binding_labels(&current);
    let conflicts = binding_conflicts(&planned, &active_bindings, &old_managed);
    if !conflicts.is_empty() {
        return Err(format!(
            "AquaStar NEO found existing Hyprland shortcuts for {}. It did not change the config. Change those keys in Preferences or free them in Omarchy first.",
            conflicts.join(", ")
        ));
    }

    let block = managed_block(&planned);
    let updated = format!("{base}\n\n{block}\n");
    if updated == current {
        let mut result = status();
        result.message = "AquaStar NEO's Hyprland shortcuts are already up to date.".into();
        return Ok(result);
    }

    let backup = backup_file(&path, current.as_bytes(), &metadata)?;
    atomic_write(&path, updated.as_bytes(), &metadata)?;
    let mut result = status();
    result.installed = true;
    result.backup_path = Some(backup);
    result.message = "Hyprland shortcuts saved, with a backup of the previous file. Reload the Hyprland configuration, then test a shortcut.".into();
    Ok(result)
}

pub fn remove() -> Result<SetupStatus, String> {
    let path = bindings_path().ok_or("Could not locate the user's config directory.")?;
    let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(
            "The Hyprland bindings path is not a regular file; AquaStar NEO left it untouched.".into(),
        );
    }
    let current = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let (updated, removed) = strip_managed_block(&current)?;
    if !removed {
        return Ok(status());
    }
    let backup = backup_file(&path, current.as_bytes(), &metadata)?;
    atomic_write(&path, updated.as_bytes(), &metadata)?;
    let mut result = status();
    result.backup_path = Some(backup);
    result.message = "AquaStar NEO's managed shortcuts were removed. A backup was saved.".into();
    Ok(result)
}

#[derive(Clone, Debug)]
struct PlannedBinding {
    portal_id: String,
    trigger: String,
    description: &'static str,
}

fn plan_bindings(unmanaged: &str) -> Result<Vec<PlannedBinding>, String> {
    let settings = crate::profile::merged_settings(&crate::profile::live_files());
    let mut portal_index = 0usize;
    let mut binds = Vec::new();
    for bind in crate::manifest::keybinds() {
        for accelerator in crate::manifest::accelerators(&bind, settings.get(&bind.id)) {
            let portal_id = format!("{}-{portal_index}", bind.id);
            portal_index += 1;
            let Some(accelerator) = crate::profile::parse_accelerator(&accelerator) else {
                continue;
            };
            // Respect bindings already present outside AquaStar's managed section.
            if references_portal_action(unmanaged, &portal_id) {
                continue;
            }
            let Some(trigger) = hyprland_trigger(&accelerator) else {
                continue;
            };
            binds.push(PlannedBinding {
                portal_id,
                trigger,
                description: action_description(&bind.id),
            });
        }
    }
    if binds.is_empty() {
        return Err("AquaStar NEO could not find any shortcuts to add to Hyprland.".into());
    }
    Ok(binds)
}

fn managed_block(binds: &[PlannedBinding]) -> String {
    let mut lines = vec![
        BEGIN.to_string(),
        "-- Generated by AquaStar Preferences. Remove this section there to undo it.".into(),
        "local function aquastar_portal_shortcut(action)".into(),
        "  return function()".into(),
        "    local window = hl.get_active_window()".into(),
        "    if not window or not window.title or not window.title:match(\"^AquaStar\") then"
            .into(),
        "      return { ok = false }".into(),
        "    end".into(),
        format!("    return hl.dispatch(hl.dsp.global({APP_ID:?} .. \":\" .. action))"),
        "  end".into(),
        "end".into(),
    ];
    lines.extend(binds.iter().map(|bind| {
        format!(
            "hl.bind({:?}, aquastar_portal_shortcut({:?}), {{ auto_consuming = true, description = {:?} }})",
            bind.trigger, bind.portal_id, bind.description
        )
    }));
    lines.push(END.into());
    lines.join("\n")
}

fn normalize_trigger(trigger: &str) -> Option<String> {
    let keys: Vec<_> = trigger
        .split_whitespace()
        .filter(|token| *token != "+")
        .collect();
    let (key, modifiers) = keys.split_last()?;
    let mut modifiers: Vec<_> = modifiers
        .iter()
        .map(|modifier| modifier.to_ascii_uppercase())
        .collect();
    modifiers.sort();
    modifiers.push(key.to_ascii_uppercase());
    Some(modifiers.join("+"))
}

fn active_keybinds(output: &str) -> Vec<(String, String)> {
    output
        .lines()
        .filter_map(|line| {
            let (trigger, description) = line.split_once('→')?;
            Some((
                normalize_trigger(trigger.trim())?,
                description.trim().to_string(),
            ))
        })
        .collect()
}

fn managed_binding_labels(contents: &str) -> Vec<(String, String)> {
    let Some(begin) = contents.find(BEGIN) else {
        return Vec::new();
    };
    let Some(end) = contents[begin..].find(END).map(|offset| begin + offset) else {
        return Vec::new();
    };
    let block = &contents[begin..end];
    block
        .lines()
        .filter_map(|line| {
            let rest = line.strip_prefix("hl.bind(\"")?;
            let (trigger, rest) = rest.split_once('\"')?;
            let description = rest.split_once("description = \"")?.1.split_once('\"')?.0;
            Some((normalize_trigger(trigger)?, description.to_string()))
        })
        .collect()
}

fn binding_conflicts(
    planned: &[PlannedBinding],
    active_output: &str,
    old_managed: &[(String, String)],
) -> Vec<String> {
    let active = active_keybinds(active_output);
    let mut conflicts = Vec::new();
    for (index, candidate) in planned.iter().enumerate() {
        let Some(trigger) = normalize_trigger(&candidate.trigger) else {
            continue;
        };
        let duplicates_aqua_shortcut = planned[index + 1..]
            .iter()
            .any(|other| normalize_trigger(&other.trigger).as_deref() == Some(trigger.as_str()));
        let conflicts_with_existing = active.iter().any(|(active_trigger, description)| {
            active_trigger == &trigger
                && !old_managed.contains(&(trigger.clone(), description.clone()))
        });
        if (duplicates_aqua_shortcut || conflicts_with_existing)
            && !conflicts.contains(&candidate.trigger)
        {
            conflicts.push(candidate.trigger.clone());
        }
    }
    conflicts
}

fn references_portal_action(contents: &str, portal_id: &str) -> bool {
    let double_quoted = format!("\"{portal_id}\"");
    let single_quoted = format!("'{portal_id}'");
    contents.contains(&double_quoted) || contents.contains(&single_quoted)
}

fn action_description(id: &str) -> &'static str {
    match id {
        "sshot" => "AquaStar NEO screenshot",
        "record" => "AquaStar NEO start/stop recording",
        "help" => "AquaStar NEO help",
        "settings" => "AquaStar NEO preferences",
        "wiki" => "AquaStar NEO AQW Wiki",
        "account" => "AquaStar NEO AQW Account",
        "design" => "AquaStar NEO AQW Design Notes",
        "charpage" => "AquaStar NEO AQW Character Page",
        "newAqw" => "AquaStar NEO new AQW instance",
        "dragon" => "AquaStar NEO DragonFable instance",
        "reminders" => "AquaStar NEO reminders",
        "todo" => "AquaStar NEO to-do list",
        "inventory" => "AquaStar NEO inventory",
        "strategy" => "AquaStar NEO strategy",
        _ => "AquaStar NEO shortcut",
    }
}

fn hyprland_trigger(accelerator: &crate::profile::Accelerator) -> Option<String> {
    let mut modifiers = Vec::new();
    if accelerator.control || accelerator.command_or_control {
        modifiers.push("CTRL");
    }
    if accelerator.alt {
        modifiers.push("ALT");
    }
    if accelerator.shift {
        modifiers.push("SHIFT");
    }
    if accelerator.meta {
        modifiers.push("SUPER");
    }
    let key = match accelerator.key.to_ascii_lowercase().as_str() {
        "space" => "SPACE".to_string(),
        "enter" | "return" => "RETURN".to_string(),
        "esc" | "escape" => "ESC".to_string(),
        "tab" => "TAB".to_string(),
        "backspace" => "BACKSPACE".to_string(),
        "delete" => "DELETE".to_string(),
        "insert" => "INSERT".to_string(),
        "home" => "HOME".to_string(),
        "end" => "END".to_string(),
        "pageup" => "PAGE_UP".to_string(),
        "pagedown" => "PAGE_DOWN".to_string(),
        "up" | "arrowup" => "UP".to_string(),
        "down" | "arrowdown" => "DOWN".to_string(),
        "left" | "arrowleft" => "LEFT".to_string(),
        "right" | "arrowright" => "RIGHT".to_string(),
        "-" => "MINUS".to_string(),
        "=" => "EQUAL".to_string(),
        "," => "COMMA".to_string(),
        "." => "PERIOD".to_string(),
        "/" => "SLASH".to_string(),
        ";" => "SEMICOLON".to_string(),
        "'" => "APOSTROPHE".to_string(),
        "[" => "BRACKETLEFT".to_string(),
        "]" => "BRACKETRIGHT".to_string(),
        "\\" => "BACKSLASH".to_string(),
        "`" => "GRAVE".to_string(),
        _ if accelerator.key.chars().all(|ch| ch.is_ascii_alphanumeric()) => {
            accelerator.key.to_ascii_uppercase()
        }
        _ => return None,
    };
    modifiers.push(key.as_str());
    Some(modifiers.join(" + "))
}

fn has_managed_block(contents: &str) -> bool {
    contents.matches(BEGIN).count() == 1 && contents.matches(END).count() == 1
}

fn strip_managed_block(contents: &str) -> Result<(String, bool), String> {
    let begin_count = contents.matches(BEGIN).count();
    let end_count = contents.matches(END).count();
    if begin_count == 0 && end_count == 0 {
        return Ok((contents.to_string(), false));
    }
    if begin_count != 1 || end_count != 1 {
        return Err("AquaStar NEO's managed Hyprland section is incomplete or duplicated; the file was left untouched.".into());
    }
    let begin = contents.find(BEGIN).unwrap();
    let end = contents.find(END).unwrap();
    if end < begin {
        return Err(
            "AquaStar NEO's managed Hyprland section is malformed; the file was left untouched.".into(),
        );
    }
    let line_start = contents[..begin].rfind('\n').map_or(0, |i| i + 1);
    if contents[line_start..begin].trim().len() != 0
        || line_start < 2
        || &contents[line_start - 2..line_start] != "\n\n"
    {
        return Err("AquaStar NEO's managed Hyprland section has unexpected surrounding text; the file was left untouched.".into());
    }
    let end_line = contents[end..]
        .find('\n')
        .map_or(contents.len(), |offset| end + offset + 1);
    let mut updated = String::with_capacity(contents.len());
    updated.push_str(&contents[..line_start - 2]);
    updated.push_str(&contents[end_line..]);
    Ok((updated, true))
}

fn backup_file(path: &Path, contents: &[u8], metadata: &fs::Metadata) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or("Hyprland config has no parent directory")?;
    let name = path
        .file_name()
        .ok_or("Hyprland config has no file name")?
        .to_string_lossy();
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    for suffix in 0..100u32 {
        let backup = parent.join(format!("{name}.aquastar-backup-{millis}-{suffix}"));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&backup)
        {
            Ok(mut file) => {
                file.write_all(contents)
                    .map_err(|error| error.to_string())?;
                file.sync_all().map_err(|error| error.to_string())?;
                fs::set_permissions(&backup, metadata.permissions())
                    .map_err(|error| error.to_string())?;
                return Ok(backup);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("Could not create a unique backup of the Hyprland config.".into())
}

fn atomic_write(path: &Path, contents: &[u8], metadata: &fs::Metadata) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or("Hyprland config has no parent directory")?;
    let name = path
        .file_name()
        .ok_or("Hyprland config has no file name")?
        .to_string_lossy();
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let mut temporary = None;
    for suffix in 0..100u32 {
        let candidate = parent.join(format!(".{name}.aquastar-{millis}-{suffix}.tmp"));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => {
                temporary = Some((candidate, file));
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    let (temporary_path, mut file) =
        temporary.ok_or("Could not create a temporary Hyprland config file")?;
    let result = (|| {
        file.write_all(contents)
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        fs::set_permissions(&temporary_path, metadata.permissions())
            .map_err(|error| error.to_string())?;
        fs::rename(&temporary_path, path).map_err(|error| error.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_detection_matches_hyprland_session_names_without_os_false_positives() {
        assert!(desktop_identifies_hyprland("Hyprland"));
        assert!(desktop_identifies_hyprland("omarchy:Hyprland"));
        assert!(desktop_identifies_hyprland("GNOME;Hyprland"));
        assert!(!desktop_identifies_hyprland("GNOME"));
        assert!(!desktop_identifies_hyprland("NotHyprland"));
    }

    #[test]
    fn managed_section_can_be_removed_without_changing_original_text() {
        let original = "local hl = require('hyprland')\nhl.bind(\"SUPER + R\", restart)\n";
        let managed = format!("{original}\n\n{BEGIN}\n-- generated\n{END}\n");
        let (restored, removed) = strip_managed_block(&managed).unwrap();
        assert!(removed);
        assert_eq!(restored, original);
    }

    #[test]
    fn malformed_managed_section_is_never_rewritten() {
        let contents = format!("{BEGIN}\npartial\n");
        assert!(strip_managed_block(&contents).is_err());
    }

    #[test]
    fn existing_user_portal_actions_are_not_duplicated() {
        assert!(references_portal_action(
            "aquastar_capture(\"sshot-0\")",
            "sshot-0"
        ));
        assert!(references_portal_action(
            "hl.dsp.global('record-1')",
            "record-1"
        ));
        assert!(!references_portal_action(
            "hl.dsp.global('wiki-4')",
            "wiki-40"
        ));
    }

    #[test]
    fn accelerator_format_matches_hyprland_lua_binding_syntax() {
        for (input, expected) in [
            ("Alt+W", "ALT + W"),
            ("Ctrl+J", "CTRL + J"),
            ("Alt+Shift+PageDown", "ALT + SHIFT + PAGE_DOWN"),
            ("Super+1", "SUPER + 1"),
        ] {
            let accelerator = crate::profile::parse_accelerator(input).unwrap();
            assert_eq!(hyprland_trigger(&accelerator).as_deref(), Some(expected));
        }
    }

    #[test]
    fn managed_shortcuts_use_the_same_portal_ids_as_the_runtime() {
        let settings = crate::profile::merged_settings(&crate::profile::live_files());
        let mut ids = Vec::new();
        let mut index = 0usize;
        for bind in crate::manifest::keybinds() {
            for _ in crate::manifest::accelerators(&bind, settings.get(&bind.id)) {
                ids.push(format!("{}-{index}", bind.id));
                index += 1;
            }
        }
        assert_eq!(ids[0], "sshot-0");
        assert_eq!(ids[1], "record-1");
        assert_eq!(ids[4], "wiki-4");
        assert_eq!(ids[8], "newAqw-8");
        assert_eq!(ids[9], "dragon-9");
    }

    #[test]
    fn conflict_check_accepts_current_alt_keys_and_rejects_exact_collisions() {
        let planned = vec![
            PlannedBinding {
                portal_id: "wiki-4".into(),
                trigger: "ALT + W".into(),
                description: "AquaStar NEO AQW Wiki",
            },
            PlannedBinding {
                portal_id: "newAqw-8".into(),
                trigger: "ALT + N".into(),
                description: "AquaStar NEO new AQW instance",
            },
            PlannedBinding {
                portal_id: "dragon-9".into(),
                trigger: "ALT + 1".into(),
                description: "AquaStar NEO DragonFable instance",
            },
        ];
        let current = "SUPER ALT + 1 → Switch to group window 1\n";
        assert!(binding_conflicts(&planned, current, &[]).is_empty());
        let collision = "ALT + W → Existing user shortcut\n";
        assert_eq!(binding_conflicts(&planned, collision, &[]), vec!["ALT + W"]);
    }

    #[test]
    fn previously_managed_shortcuts_do_not_conflict_during_update() {
        let block = format!(
            "{BEGIN}\nhl.bind(\"ALT + W\", aquastar_portal_shortcut(\"wiki-4\"), {{ auto_consuming = true, description = \"AquaStar NEO AQW Wiki\" }})\n{END}"
        );
        let old = managed_binding_labels(&block);
        let planned = vec![PlannedBinding {
            portal_id: "wiki-4".into(),
            trigger: "ALT + W".into(),
            description: "AquaStar NEO AQW Wiki",
        }];
        assert_eq!(old, vec![("ALT+W".into(), "AquaStar NEO AQW Wiki".into())]);
        assert!(binding_conflicts(&planned, "ALT + W → AquaStar NEO AQW Wiki", &old).is_empty());
    }
}
