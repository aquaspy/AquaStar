use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Map, Value};
use std::sync::{Mutex, OnceLock};

const PLUGIN_ID: &str = "adventure-quest-worlds";
const REMINDERS_MESSAGES: &str = include_str!("../assets/reminders-messages.json");
const TODO_MESSAGES: &str = include_str!("../assets/todo-messages.json");
const STRATEGY_MESSAGES: &str = include_str!("../assets/strategy-messages.json");
const REMINDERS_SEED: &str = include_str!(
    "../../../plugins/adventure-quest-worlds/features/reminders/reminders_default.json"
);
const STRATEGY_SEED: &str = include_str!(
    "../../../plugins/adventure-quest-worlds/features/strategy/strategy_default.json"
);

const PLATFORM_KEYS: &[&str] = &[
    "about", "fullscreen", "sshot", "reload", "reloadCache", "forward", "backward", "help",
    "settings", "record", "appLanguage", "customUrl", "recordingFormat", "renderMode",
    "ruffleUpdateChannel", "ruffleAutoUpdate", "ruffleAutoUpdateMigrated", "ruffleQuality",
    "showGameMenu", "enableDevTools", "useDirectWmode", "swfLog", "activePluginId",
    "pluginSystem", "enableLocalPlugins", "allowLocalPluginOverride", "trustedLocalPlugins",
];

pub struct ProfileFiles {
    pub settings_files: Vec<PathBuf>,
    pub canonical_settings: PathBuf,
    pub reminders: PathBuf,
    pub legacy_reminders: PathBuf,
    pub todo: PathBuf,
    pub strategy: PathBuf,
    pub inventory: PathBuf,
    pub swf_managed: PathBuf,
    pub swf_candidates: Vec<PathBuf>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilePreferences {
    pub defaults: ProfilePreferencesDefaults,
    pub app_language: String,
    pub custom_url: String,
    pub player_character: String,
    pub auto_sync: bool,
    pub live_loader_url: bool,
    pub keybinds: Vec<ShortcutPreference>,
    pub keybind_diagnostics: Vec<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilePreferencesDefaults {
    pub app_language: String,
    pub custom_url: String,
    pub player_character: String,
    pub auto_sync: bool,
    pub live_loader_url: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutPreference {
    pub id: String,
    pub binding: Value,
    pub default: Value,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum ProfilePreferenceChange {
    AppLanguage(String),
    CustomUrl(String),
    PlayerCharacter(String),
    AutoSync(bool),
    LiveLoaderUrl(bool),
    Keybind(ShortcutPreferenceChange),
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutPreferenceChange {
    pub id: String,
    pub binding: Value,
}

pub fn files_from(profile: &crate::placement::ProfilePaths) -> ProfileFiles {
    ProfileFiles {
        canonical_settings: profile.aqua_dir.join("aquastar.json"),
        reminders: profile.aqua_dir.join("aquastar_reminders.json"),
        legacy_reminders: profile.legacy_reminders.clone(),
        todo: profile.aqua_dir.join("aquastar_todo.json"),
        strategy: profile.aqua_dir.join("aquastar_strategy.json"),
        inventory: profile.aqua_dir.join("aquastar_inventory.json"),
        swf_managed: profile.aqua_dir.join("custom-game.swf"),
        swf_candidates: profile.swf_candidates.clone(),
        settings_files: profile.settings_files.clone(),
    }
}

pub fn live_files() -> ProfileFiles {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf));
    files_from(&crate::placement::electron_profile(exe_dir.as_deref()))
}

/// Path of a feature window's page inside the bundled UI (`features/<name>/<name>.html`).
pub fn feature_page(name: &str) -> String {
    format!("features/{name}/{name}.html")
}

pub fn tool_spec(name: &str) -> Option<(&'static str, f64, f64)> {
    Some(match name {
        "reminders" => ("AquaStar - Reminders", 1040.0, 620.0),
        "todo" => ("AquaStar - To-Do List", 960.0, 620.0),
        "strategy" => ("AquaStar - Strategy", 1040.0, 680.0),
        "inventory" => ("AquaStar - Inventory", 1040.0, 620.0),
        "studio" => ("AquaStar - Char Page Studio", 560.0, 900.0),
        _ => return None,
    })
}

pub fn profile_preferences(files: &ProfileFiles) -> Result<ProfilePreferences, String> {
    if files.canonical_settings.exists() {
        let text = fs::read_to_string(&files.canonical_settings)
            .map_err(|error| format!("Could not read AquaStar settings: {error}"))?;
        let canonical: Value = serde_json::from_str(&text)
            .map_err(|error| format!("Could not read AquaStar settings: {error}"))?;
        if !canonical.is_object() {
            return Err("AquaStar settings must contain a JSON object".into());
        }
    }
    let values = merge_settings(&files.settings_files);
    let mut keybinds = Vec::new();
    let stored_plugin = values.get("plugins").and_then(|value| value.get(PLUGIN_ID));
    for bind in crate::manifest::keybinds() {
        if bind.id == "reloadCache" {
            continue;
        }
        let default = keybind_default(&bind.id).unwrap_or(Value::Null);
        let binding = values.get(&bind.id)
            .or_else(|| stored_plugin.and_then(|plugin| plugin.get(&bind.id)))
            .cloned()
            .unwrap_or_else(|| default.clone());
        keybinds.push(ShortcutPreference { id: bind.id, binding, default });
    }
    let keybind_diagnostics = keybinds.iter().filter_map(|bind| {
        validate_shortcut_binding(&bind.binding).err().map(|error| format!("{}: {error}", bind.id))
    }).collect();
    Ok(ProfilePreferences {
        defaults: ProfilePreferencesDefaults {
            app_language: "system".into(),
            custom_url: String::new(),
            player_character: String::new(),
            auto_sync: false,
            live_loader_url: true,
        },
        app_language: values.get("appLanguage").and_then(Value::as_str).unwrap_or("system").to_string(),
        custom_url: values.get("customUrl").and_then(Value::as_str).unwrap_or("").to_string(),
        player_character: values.get("playerCharacter").and_then(Value::as_str).unwrap_or("").to_string(),
        auto_sync: values.get("autoSync").and_then(Value::as_bool).unwrap_or(false),
        live_loader_url: values.get("liveLoaderUrl").and_then(Value::as_bool).unwrap_or(true),
        keybinds,
        keybind_diagnostics,
    })
}

pub fn change_profile_preference(files: &ProfileFiles, change: ProfilePreferenceChange) -> Result<ProfilePreferences, String> {
    static WRITE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    let _guard = WRITE_LOCK.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|error| error.into_inner());
    let existing_value = match fs::read_to_string(&files.canonical_settings) {
        Ok(text) => serde_json::from_str::<Value>(&text)
            .map_err(|error| format!("Could not read AquaStar settings: {error}"))?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Value::Object(Map::new()),
        Err(error) => return Err(format!("Could not read AquaStar settings: {error}")),
    };
    let mut existing = existing_value.as_object().cloned()
        .ok_or_else(|| "AquaStar settings must contain a JSON object".to_string())?;
    if let Some(plugins) = merge_settings(&files.settings_files).get("plugins").filter(|value| value.is_object()) {
        existing.insert("plugins".into(), plugins.clone());
    }
    let (key, value) = match &change {
        ProfilePreferenceChange::AppLanguage(value) => {
            if !["system", "en-US", "pt-BR"].contains(&value.as_str()) {
                return Err("Choose System default, English, or Português (Brasil).".into());
            }
            ("appLanguage", Value::String(value.clone()))
        }
        ProfilePreferenceChange::CustomUrl(value) => {
            if !value.is_empty() && !crate::players::valid_custom_swf_url(value) {
                return Err("Enter an HTTPS URL ending in .swf, up to 199 characters.".into());
            }
            ("customUrl", Value::String(value.clone()))
        }
        ProfilePreferenceChange::PlayerCharacter(value) => {
            if !value.chars().all(|character| character.is_ascii_alphanumeric()) {
                return Err("Character name can contain letters and numbers only.".into());
            }
            ("playerCharacter", Value::String(value.clone()))
        }
        ProfilePreferenceChange::AutoSync(value) => ("autoSync", Value::Bool(*value)),
        ProfilePreferenceChange::LiveLoaderUrl(value) => ("liveLoaderUrl", Value::Bool(*value)),
        ProfilePreferenceChange::Keybind(change) => {
            crate::manifest::keybinds().into_iter()
                .find(|bind| bind.id == change.id && bind.id != "reloadCache")
                .ok_or_else(|| "This shortcut is not editable.".to_string())?;
            validate_shortcut_binding(&change.binding)?;
            ("", Value::Null)
        }
    };
    let mut patch = Map::new();
    match change {
        ProfilePreferenceChange::Keybind(change) => { patch.insert(change.id, change.binding); }
        _ => { patch.insert(key.into(), value); }
    }
    let next = split_save(&patch, PLUGIN_ID, existing);
    write_electron_atomic(&files.canonical_settings, &Value::Object(next))?;
    profile_preferences(files)
}

fn keybind_default(id: &str) -> Option<Value> {
    crate::manifest::keybind_defaults_value().get(id).cloned()
}

fn validate_shortcut_binding(value: &Value) -> Result<(), String> {
    let bindings: Vec<&str> = match value {
        Value::String(binding) => vec![binding],
        Value::Array(values) if !values.is_empty() => values.iter().map(Value::as_str)
            .collect::<Option<Vec<_>>>().ok_or_else(|| "Shortcut list must contain text values.".to_string())?,
        _ => return Err("Shortcut must be text or a list of shortcuts.".into()),
    };
    for binding in bindings {
        let accelerator = parse_accelerator(binding).ok_or_else(|| format!("Unsupported shortcut: {binding}"))?;
        if crate::shortcut_from(&accelerator).is_none() {
            return Err(format!("Unsupported shortcut key: {}", accelerator.key));
        }
    }
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Accelerator {
    pub alt: bool,
    pub shift: bool,
    pub control: bool,
    pub command_or_control: bool,
    pub meta: bool,
    pub key: String,
}

pub fn parse_accelerator(raw: &str) -> Option<Accelerator> {
    let parts: Vec<&str> = raw.split('+').map(str::trim).filter(|part| !part.is_empty()).collect();
    let key = parts.last()?.to_string();
    if key.eq_ignore_ascii_case("Ctrl") || key.eq_ignore_ascii_case("Alt") || key.eq_ignore_ascii_case("Shift") {
        return None;
    }
    let mut accel = Accelerator {
        alt: false,
        shift: false,
        control: false,
        command_or_control: false,
        meta: false,
        key,
    };
    for part in &parts[..parts.len() - 1] {
        match part.to_ascii_lowercase().as_str() {
            "alt" | "option" => accel.alt = true,
            "shift" => accel.shift = true,
            "control" | "ctrl" => accel.control = true,
            "cmdorctrl" | "commandorcontrol" | "command" | "cmd" => accel.command_or_control = true,
            "meta" | "super" => accel.meta = true,
            _ => return None,
        }
    }
    Some(accel)
}

pub fn reminders_messages() -> Value {
    parse_static(REMINDERS_MESSAGES)
}
pub fn todo_messages() -> Value {
    parse_static(TODO_MESSAGES)
}
pub fn strategy_messages() -> Value {
    parse_static(STRATEGY_MESSAGES)
}

pub fn swf_status(files: &ProfileFiles) -> Value {
    let active = files.swf_candidates.iter().find(|path| path.is_file());
    serde_json::json!({
        "exists": active.is_some(),
        "path": active.map(|path| path.display().to_string()).unwrap_or_else(|| files.swf_managed.display().to_string())
    })
}

pub fn install_swf(files: &ProfileFiles, source: &Path) -> Result<Value, String> {
    if let Some(dir) = files.swf_managed.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::copy(source, &files.swf_managed).map_err(|e| e.to_string())?;
    Ok(swf_status(files))
}

pub fn remove_swf(files: &ProfileFiles) -> Value {
    for path in &files.swf_candidates {
        let _ = fs::remove_file(path);
    }
    swf_status(files)
}

pub fn reminders_document(files: &ProfileFiles) -> Result<Value, String> {
    let data = if files.reminders.is_file() {
        load_reminders_value(&files.reminders)
    } else if files.legacy_reminders.is_file() {
        let value = load_reminders_value(&files.legacy_reminders);
        write_electron(&files.reminders, &value)?;
        value
    } else {
        let value = reminders_seed();
        write_electron(&files.reminders, &value)?;
        value
    };
    Ok(serde_json::json!({ "data": data, "savePath": files.reminders.display().to_string() }))
}

pub fn save_reminders(files: &ProfileFiles, state: &Value) -> Result<Value, String> {
    let saved = serde_json::json!({
        "characters": state.get("characters").cloned().filter(|v| v.is_array()).unwrap_or(serde_json::json!([])),
        "quests": state.get("quests").cloned().filter(|v| v.is_array()).unwrap_or(serde_json::json!([])),
        "showCompleted": state.get("showCompleted") != Some(&Value::Bool(false)),
        "showMemberDailies": state.get("showMemberDailies") != Some(&Value::Bool(false)),
        "individualHiddenMode": state.get("individualHiddenMode") == Some(&Value::Bool(true))
    });
    write_electron(&files.reminders, &saved)?;
    Ok(serde_json::json!({ "savedTo": files.reminders.display().to_string() }))
}

pub fn todo_document(files: &ProfileFiles) -> Result<Value, String> {
    let data = if files.todo.is_file() {
        load_todo_value(&files.todo)
    } else {
        let fresh = serde_json::json!({"characters": [], "tasks": [], "individualHiddenMode": false});
        write_electron(&files.todo, &fresh)?;
        fresh
    };
    Ok(serde_json::json!({ "data": data, "savePath": files.todo.display().to_string() }))
}

pub fn save_todo(files: &ProfileFiles, state: &Value) -> Result<Value, String> {
    let saved = serde_json::json!({
        "characters": state.get("characters").cloned().filter(|v| v.is_array()).unwrap_or(serde_json::json!([])),
        "tasks": state.get("tasks").cloned().filter(|v| v.is_array()).unwrap_or(serde_json::json!([])),
        "individualHiddenMode": state.get("individualHiddenMode") == Some(&Value::Bool(true))
    });
    write_electron(&files.todo, &saved)?;
    Ok(serde_json::json!({ "savedTo": files.todo.display().to_string() }))
}

pub fn strategy_document(files: &ProfileFiles) -> Result<Value, String> {
    let data = if files.strategy.is_file() {
        migrate_strategy(&read_json(&files.strategy).unwrap_or(Value::Null))
    } else {
        let fresh = migrate_strategy(&parse_static(STRATEGY_SEED));
        write_electron(&files.strategy, &fresh)?;
        fresh
    };
    Ok(serde_json::json!({ "data": data, "savePath": files.strategy.display().to_string() }))
}

pub fn save_strategy(files: &ProfileFiles, state: &Value) -> Result<Value, String> {
    let mut data = state.clone();
    let previous = if files.strategy.is_file() {
        migrate_strategy(&read_json(&files.strategy).unwrap_or(Value::Null))
    } else {
        migrate_strategy(&Value::Null)
    };
    if let (Some(classes), Some(previous_classes)) = (
        data.get_mut("classes").and_then(Value::as_array_mut),
        previous.get("classes").and_then(Value::as_array),
    ) {
        for class in classes.iter_mut() {
            let clear = class.get("clearFavorites") == Some(&Value::Bool(true));
            let favorite = class.get("favorites").cloned().unwrap_or(Value::Null);
            let empty = ["tonicId", "elixirId", "potionId"].iter().all(|key| {
                favorite.get(*key).and_then(Value::as_str).unwrap_or("").is_empty()
            });
            let id = class.get("id").and_then(Value::as_str).unwrap_or("");
            if !clear && empty {
                if let Some(old) = previous_classes.iter().find(|item| item.get("id").and_then(Value::as_str) == Some(id)) {
                    if let Some(old_fav) = old.get("favorites") {
                        class["favorites"] = old_fav.clone();
                    }
                }
            }
        }
    }
    let clean = migrate_strategy(&data);
    write_electron(&files.strategy, &clean)?;
    Ok(serde_json::json!({ "data": clean, "savePath": files.strategy.display().to_string() }))
}

fn load_reminders_value(path: &Path) -> Value {
    let parsed = read_json(path).unwrap_or(Value::Null);
    let quests = parsed.get("quests").and_then(Value::as_array).cloned().unwrap_or_default()
        .into_iter().map(migrate_quest).collect::<Vec<_>>();
    serde_json::json!({
        "characters": parsed.get("characters").cloned().filter(|v| v.is_array()).unwrap_or(serde_json::json!([])),
        "quests": quests,
        "showCompleted": parsed.get("showCompleted") != Some(&Value::Bool(false)),
        "showMemberDailies": parsed.get("showMemberDailies") != Some(&Value::Bool(false)),
        "individualHiddenMode": parsed.get("individualHiddenMode") == Some(&Value::Bool(true))
    })
}

fn migrate_quest(quest: Value) -> Value {
    let mut quest = quest.as_object().cloned().unwrap_or_default();
    let mut hidden_by = quest.get("hiddenBy").cloned().filter(|v| v.is_object()).unwrap_or(serde_json::json!({}));
    if quest.get("hidden") == Some(&Value::Bool(true)) {
        hidden_by.as_object_mut().unwrap().insert("__shared__".into(), Value::Bool(true));
    }
    let done = quest.get("done").cloned().filter(|v| v.is_object()).unwrap_or(serde_json::json!({}));
    quest.insert("done".into(), done);
    quest.insert("hiddenBy".into(), hidden_by);
    quest.remove("hidden");
    Value::Object(quest)
}

fn reminders_seed() -> Value {
    let raw = parse_static(REMINDERS_SEED);
    let quests = raw.get("quests").and_then(Value::as_array).cloned().unwrap_or_default().into_iter().enumerate().map(|(index, quest)| {
        let mut quest = quest.as_object().cloned().unwrap_or_default();
        quest.insert("id".into(), Value::String(format!("q_seed_{index}")));
        quest.entry("done").or_insert(serde_json::json!({}));
        quest.entry("hiddenBy").or_insert(serde_json::json!({}));
        Value::Object(quest)
    }).collect::<Vec<_>>();
    serde_json::json!({
        "characters": [],
        "quests": quests,
        "showCompleted": true,
        "showMemberDailies": true,
        "individualHiddenMode": false
    })
}

fn load_todo_value(path: &Path) -> Value {
    let parsed = read_json(path).unwrap_or(Value::Null);
    let tasks = parsed.get("tasks").and_then(Value::as_array).cloned().unwrap_or_default().into_iter().enumerate().map(|(index, task)| {
        let task = task.as_object().cloned().unwrap_or_default();
        let category = task.get("category").and_then(Value::as_str).unwrap_or("drop");
        let category = if ["drop", "dailyDrop", "shopMerge", "questReward", "hardFarm", "reputationFarm"].contains(&category) { category } else { "drop" };
        serde_json::json!({
            "id": task.get("id").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("t_seed_{index}")),
            "name": task.get("name").and_then(Value::as_str).unwrap_or(""),
            "wikiLink": task.get("wikiLink").and_then(Value::as_str).unwrap_or(""),
            "joinCommand": task.get("joinCommand").and_then(Value::as_str).unwrap_or(""),
            "category": category,
            "priority": task.get("priority") == Some(&Value::Bool(true)),
            "seasonal": task.get("seasonal") == Some(&Value::Bool(true)),
            "seasonalEvent": task.get("seasonalEvent").cloned().filter(|v| v.is_string()).unwrap_or(Value::Null),
            "hiddenBy": task.get("hiddenBy").cloned().filter(|v| v.is_object()).unwrap_or(serde_json::json!({}))
        })
    }).collect::<Vec<_>>();
    serde_json::json!({
        "characters": parsed.get("characters").cloned().filter(|v| v.is_array()).unwrap_or(serde_json::json!([])),
        "tasks": tasks,
        "individualHiddenMode": parsed.get("individualHiddenMode") == Some(&Value::Bool(true))
    })
}

fn migrate_strategy(raw: &Value) -> Value {
    let empty = Map::new();
    let raw = raw.as_object().unwrap_or(&empty);
    let defaults: Value = parse_static(STRATEGY_SEED);
    let default_potions = defaults.get("potions").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut timer_types = raw.get("timerTypes").and_then(Value::as_array).cloned().unwrap_or_else(|| {
        serde_json::json!([{"id":"taunt","name":"Taunt"},{"id":"decay","name":"Decay"},{"id":"zone","name":"Zone"}]).as_array().unwrap().clone()
    });
    timer_types.retain(|item| item.get("name").and_then(Value::as_str).map(|name| !name.trim().is_empty()).unwrap_or(false));
    for (index, item) in timer_types.iter_mut().enumerate() {
        if item.get("id").and_then(Value::as_str).is_none() {
            item["id"] = Value::String(format!("type_seed_{index}"));
        }
        if let Some(name) = item.get("name").and_then(Value::as_str) {
            item["name"] = Value::String(name.trim().to_string());
        }
    }
    for builtin in ["taunt", "decay", "zone"] {
        if !timer_types.iter().any(|item| item.get("id").and_then(Value::as_str) == Some(builtin)) {
            let name = match builtin { "taunt" => "Taunt", "decay" => "Decay", _ => "Zone" };
            timer_types.insert(0, serde_json::json!({"id": builtin, "name": name}));
        }
    }
    let mut potions = raw.get("potions").and_then(Value::as_array).cloned().unwrap_or_default();
    potions.retain(|item| item.get("name").and_then(Value::as_str).map(|name| !name.trim().is_empty()).unwrap_or(false));
    for (index, item) in potions.iter_mut().enumerate() {
        if item.get("id").and_then(Value::as_str).is_none() {
            item["id"] = Value::String(format!("potion_seed_{index}"));
        }
        let kind = item.get("kind").and_then(Value::as_str).unwrap_or("potion");
        item["kind"] = Value::String(if ["tonic", "elixir", "potion"].contains(&kind) { kind } else { "potion" }.into());
        if let Some(name) = item.get("name").and_then(Value::as_str) {
            item["name"] = Value::String(name.trim().to_string());
        }
    }
    for item in &default_potions {
        let name = item.get("name").and_then(Value::as_str).unwrap_or("");
        if !potions.iter().any(|potion| potion.get("name").and_then(Value::as_str).unwrap_or("").eq_ignore_ascii_case(name)) {
            potions.push(item.clone());
        }
    }
    let classes = raw.get("classes").and_then(Value::as_array).cloned().unwrap_or_default().into_iter().enumerate().filter_map(|(index, mut class)| {
        let class_map = class.as_object_mut()?;
        let name = class_map.get("name").and_then(Value::as_str).unwrap_or("").trim().to_string();
        if name.is_empty() { return None; }
        let role = class_map.get("role").and_then(Value::as_str).unwrap_or("support");
        let role = if ["support", "dps", "tank", "dot"].contains(&role) { role } else { "support" };
        let favorites = class_map.get("favorites").cloned().unwrap_or(Value::Null);
        Some(serde_json::json!({
            "id": class_map.get("id").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("class_seed_{index}")),
            "name": name,
            "role": role,
            "favorites": {
                "tonicId": favorites.get("tonicId").and_then(Value::as_str).unwrap_or("").trim(),
                "elixirId": favorites.get("elixirId").and_then(Value::as_str).unwrap_or("").trim(),
                "potionId": favorites.get("potionId").and_then(Value::as_str).unwrap_or("").trim()
            }
        }))
    }).collect::<Vec<_>>();
    let legacy = raw.get("strategies").and_then(Value::as_array).cloned().unwrap_or_default();
    let bosses = raw.get("bosses").and_then(Value::as_array).cloned().unwrap_or_default().into_iter().enumerate().filter_map(|(index, boss)| {
        let boss_map = boss.as_object()?;
        let name = boss_map.get("name").and_then(Value::as_str).unwrap_or("").trim().to_string();
        if name.is_empty() { return None; }
        let id = boss_map.get("id").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("boss_seed_{index}"));
        let kind = if boss_map.get("kind").and_then(Value::as_str) == Some("challenge") { "challenge" } else { "ultra" };
        let own = boss_map.get("strategies").and_then(Value::as_array).cloned().unwrap_or_else(|| {
            legacy.iter().filter(|item| item.get("bossId").and_then(Value::as_str) == Some(id.as_str())).cloned().collect()
        });
        let strategies = own.into_iter().enumerate().map(|(sindex, item)| migrate_strategy_item(&item, kind, &timer_types, sindex)).collect::<Vec<_>>();
        Some(serde_json::json!({
            "id": id,
            "name": name,
            "joinCommand": boss_map.get("joinCommand").and_then(Value::as_str).unwrap_or("").trim(),
            "generalInfo": boss_map.get("generalInfo").and_then(Value::as_str).unwrap_or(""),
            "reset": if boss_map.get("reset").and_then(Value::as_str) == Some("daily") { "daily" } else { "weekly" },
            "hasZone": boss_map.get("hasZone") == Some(&Value::Bool(true)),
            "kind": kind,
            "strategies": strategies
        }))
    }).collect::<Vec<_>>();
    let shortcut = raw.get("timerShortcut").and_then(Value::as_str).unwrap_or("").trim();
    serde_json::json!({
        "potions": potions,
        "classes": classes,
        "timerTypes": timer_types,
        "bosses": bosses,
        "timerShortcut": if shortcut.is_empty() { "Alt+Shift+U" } else { shortcut }
    })
}

fn migrate_strategy_item(raw: &Value, kind: &str, types: &[Value], index: usize) -> Value {
    let raw = raw.as_object().cloned().unwrap_or_default();
    let slots_limit = if kind == "challenge" { 7 } else { 4 };
    let mut slots = raw.get("classIds").and_then(Value::as_array).cloned().unwrap_or_default();
    slots.truncate(slots_limit);
    while slots.len() < slots_limit {
        slots.push(Value::String(String::new()));
    }
    let timers = raw.get("timers").cloned().unwrap_or(Value::Null);
    let map_events = |key: &str| {
        timers.get(key).and_then(Value::as_array).cloned().unwrap_or_default().into_iter().enumerate().map(|(eindex, event)| {
            let event = event.as_object().cloned().unwrap_or_default();
            let type_id = event.get("typeId").and_then(Value::as_str).unwrap_or("");
            let type_id = if types.iter().any(|item| item.get("id").and_then(Value::as_str) == Some(type_id)) {
                type_id.to_string()
            } else {
                types.first().and_then(|item| item.get("id").and_then(Value::as_str)).unwrap_or("taunt").to_string()
            };
            let target = event.get("target").and_then(Value::as_str).unwrap_or("main");
            let target = if ["main", "left", "right"].contains(&target) { target } else { "main" };
            serde_json::json!({
                "id": event.get("id").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("timer_seed_{index}_{eindex}")),
                "delay": json_number(event.get("delay").and_then(Value::as_f64).unwrap_or(0.0).max(0.0)),
                "typeId": type_id,
                "target": target,
                "player": event.get("player").and_then(Value::as_u64).filter(|n| *n < 7).unwrap_or(0),
                "assignment": event.get("assignment").and_then(Value::as_str).unwrap_or("").trim(),
                "label": event.get("label").and_then(Value::as_str).unwrap_or("").trim()
            })
        }).collect::<Vec<_>>()
    };
    let roles = raw.get("timerRoles").and_then(Value::as_array).cloned().unwrap_or_default().into_iter().enumerate().map(|(rindex, role)| {
        let role = role.as_object().cloned().unwrap_or_default();
        let type_id = role.get("typeId").and_then(Value::as_str).unwrap_or("");
        let type_id = if types.iter().any(|item| item.get("id").and_then(Value::as_str) == Some(type_id)) { type_id.to_string() } else { types.first().and_then(|item| item.get("id").and_then(Value::as_str)).unwrap_or("taunt").to_string() };
        let target = role.get("target").and_then(Value::as_str).unwrap_or("main");
        let name = role.get("name").and_then(Value::as_str).unwrap_or("").trim();
        let name = if name.is_empty() { "T1" } else { name };
        serde_json::json!({
            "id": role.get("id").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("timerRole_seed_{index}_{rindex}")),
            "name": name,
            "offset": json_number(role.get("offset").and_then(Value::as_f64).unwrap_or(0.0).max(0.0)),
            "interval": json_number(role.get("interval").and_then(Value::as_f64).unwrap_or(1.0).max(1.0)),
            "typeId": type_id,
            "target": if ["main", "left", "right"].contains(&target) { target } else { "main" },
            "note": role.get("note").and_then(Value::as_str).unwrap_or("").trim()
        })
    }).collect::<Vec<_>>();
    let notes = raw.get("strategyNotes").and_then(Value::as_str).map(str::to_string).or_else(|| raw.get("notes").and_then(Value::as_str).map(str::to_string)).unwrap_or_default();
    let name = raw.get("name").and_then(Value::as_str).unwrap_or("").trim();
    let name = if name.is_empty() { "Strategy".to_string() } else { name.to_string() };
    serde_json::json!({
        "id": raw.get("id").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("strategy_seed_{index}")),
        "name": name,
        "classIds": slots,
        "bossNotes": raw.get("bossNotes").and_then(Value::as_str).unwrap_or(""),
        "strategyNotes": notes,
        "timerRoles": roles,
        "timers": {"intro": map_events("intro"), "loop": map_events("loop")}
    })
}

pub(crate) fn merged_settings(files: &ProfileFiles) -> Map<String, Value> {
    merge_settings(&files.settings_files)
}

pub(crate) fn setting_str(files: &ProfileFiles, key: &str) -> String {
    merged_settings(files)
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn merge_settings(paths: &[PathBuf]) -> Map<String, Value> {
    let mut top = Map::new();
    let mut plugins = None;
    for path in paths {
        let Some(value) = read_json(path) else { continue };
        let Some(obj) = value.as_object() else { continue };
        if obj.get("plugins").is_some_and(Value::is_object) {
            plugins = obj.get("plugins").cloned();
        }
        for (key, value) in obj {
            top.insert(key.clone(), value.clone());
        }
    }
    if let Some(plugins) = plugins {
        top.insert("plugins".into(), plugins);
    }
    let plugin_slice = top.get("plugins").and_then(|plugins| plugins.get(PLUGIN_ID)).and_then(Value::as_object).cloned();
    if let Some(slice) = plugin_slice {
        for (key, value) in slice {
            if !is_platform_key(&key) {
                top.insert(key, value);
            }
        }
    }
    top
}

fn split_save(changed: &Map<String, Value>, active_id: &str, mut existing: Map<String, Value>) -> Map<String, Value> {
    let mut plugins = existing.get("plugins").cloned().filter(|value| value.is_object()).unwrap_or(serde_json::json!({}));
    let mut slice = plugins.get(active_id).cloned().filter(|value| value.is_object()).unwrap_or(serde_json::json!({}));
    for (key, value) in changed {
        if key == "plugins" { continue; }
        if is_platform_key(key) {
            existing.insert(key.clone(), value.clone());
        } else if let Some(slice) = slice.as_object_mut() {
            slice.insert(key.clone(), value.clone());
            existing.insert(key.clone(), value.clone());
        }
    }
    if !active_id.is_empty() {
        if let Some(plugins) = plugins.as_object_mut() {
            plugins.insert(active_id.to_string(), slice);
        }
        existing.insert("plugins".into(), plugins);
    }
    existing
}

fn is_platform_key(key: &str) -> bool {
    PLATFORM_KEYS.contains(&key)
}

fn parse_static(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or(Value::Null)
}

fn read_json(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn json_number(value: f64) -> Value {
    if value.is_finite() && value.fract() == 0.0 && (i64::MIN as f64..=i64::MAX as f64).contains(&value) {
        Value::from(value as i64)
    } else {
        serde_json::Number::from_f64(value).map(Value::Number).unwrap_or(Value::from(0))
    }
}

fn write_electron(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let formatter = serde_json::ser::PrettyFormatter::with_indent(b"    ");
    let mut buf = Vec::new();
    let mut serializer = serde_json::Serializer::with_formatter(&mut buf, formatter);
    use serde::Serialize;
    value.serialize(&mut serializer).map_err(|e| e.to_string())?;
    fs::write(path, buf).map_err(|e| e.to_string())
}

fn write_electron_atomic(path: &Path, value: &Value) -> Result<(), String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let formatter = serde_json::ser::PrettyFormatter::with_indent(b"    ");
    let mut buf = Vec::new();
    let mut serializer = serde_json::Serializer::with_formatter(&mut buf, formatter);
    use serde::Serialize;
    value.serialize(&mut serializer).map_err(|e| e.to_string())?;
    let temp = path.with_extension(format!("tmp-{}-{}", std::process::id(), NEXT_TEMP.fetch_add(1, Ordering::Relaxed)));
    let old_mode = fs::metadata(path).ok().map(|metadata| metadata.permissions());
    let result = (|| {
        use std::io::Write;
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|e| e.to_string())?;
        file.write_all(&buf).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        if let Some(permissions) = old_mode {
            fs::set_permissions(&temp, permissions).map_err(|e| e.to_string())?;
        }
        replace_file_atomic(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}

#[cfg(not(windows))]
fn replace_file_atomic(source: &Path, destination: &Path) -> Result<(), String> {
    fs::rename(source, destination).map_err(|e| e.to_string())
}

#[cfg(windows)]
fn replace_file_atomic(source: &Path, destination: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;
    #[link(name = "Kernel32")]
    extern "system" {
        fn ReplaceFileW(replaced: *const u16, replacement: *const u16, backup: *const u16, flags: u32, exclude: *mut std::ffi::c_void, reserved: *mut std::ffi::c_void) -> i32;
        fn MoveFileExW(existing: *const u16, new: *const u16, flags: u32) -> i32;
    }
    let wide = |path: &Path| path.as_os_str().encode_wide().chain(Some(0)).collect::<Vec<_>>();
    let source_wide = wide(source);
    let destination_wide = wide(destination);
    let result = unsafe {
        if destination.exists() {
            ReplaceFileW(destination_wide.as_ptr(), source_wide.as_ptr(), ptr::null(), 0, ptr::null_mut(), ptr::null_mut())
        } else {
            MoveFileExW(source_wide.as_ptr(), destination_wide.as_ptr(), 0x00000008)
        }
    };
    if result == 0 { Err(std::io::Error::last_os_error().to_string()) } else { Ok(()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> ProfileFiles {
        let root = std::env::temp_dir().join(format!("aquastar-roundtrip-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let aqua = root.join("AquaStar");
        fs::create_dir_all(&aqua).unwrap();
        ProfileFiles {
            settings_files: vec![root.join("aquastar.json"), aqua.join("aquastar.json")],
            canonical_settings: aqua.join("aquastar.json"),
            reminders: aqua.join("aquastar_reminders.json"),
            legacy_reminders: root.join("aquastar_reminders.json"),
            todo: aqua.join("aquastar_todo.json"),
            strategy: aqua.join("aquastar_strategy.json"),
            inventory: aqua.join("aquastar_inventory.json"),
            swf_managed: aqua.join("custom-game.swf"),
            swf_candidates: vec![aqua.join("custom-game.swf"), aqua.join("aqlite_old.swf")],
        }
    }

    #[test]
    fn preferences_read_does_not_run_legacy_updater_migration() {
        let files = scratch("preferences-read-no-migration");
        let source = r#"{"ruffleAutoUpdate":false,"customUrl":"https://cdn.example/game.swf","plugins":{"adventure-quest-worlds":{"playerCharacter":"Old"}}}"#;
        fs::write(&files.canonical_settings, source).unwrap();
        let snapshot = profile_preferences(&files).unwrap();
        assert_eq!(snapshot.custom_url, "https://cdn.example/game.swf");
        assert_eq!(snapshot.player_character, "Old");
        assert_eq!(snapshot.keybinds.iter().find(|bind| bind.id == "help").unwrap().default, keybind_default("help").unwrap());
        assert_eq!(fs::read_to_string(&files.canonical_settings).unwrap(), source);
    }

    #[test]
    fn preference_edits_keep_data_and_ignore_stale_active_plugin() {
        let files = scratch("preferences-fixed-owner");
        let source = r#"{"fixtureKept":{"nested":true},"activePluginId":"old-electron-plugin","customUrl":"","plugins":{"old-electron-plugin":{"untouched":17},"adventure-quest-worlds":{"playerCharacter":"Before","unknownAqw":true}}}"#;
        fs::write(&files.canonical_settings, source).unwrap();
        change_profile_preference(&files, ProfilePreferenceChange::PlayerCharacter("Hero42".into())).unwrap();
        let saved: Value = serde_json::from_str(&fs::read_to_string(&files.canonical_settings).unwrap()).unwrap();
        assert_eq!(saved["playerCharacter"], "Hero42");
        assert_eq!(saved["plugins"][PLUGIN_ID]["playerCharacter"], "Hero42");
        assert_eq!(saved["plugins"]["old-electron-plugin"]["untouched"], 17);
        assert_eq!(saved["plugins"][PLUGIN_ID]["unknownAqw"], true);
        assert_eq!(saved["fixtureKept"]["nested"], true);
        assert_eq!(saved["activePluginId"], "old-electron-plugin");
    }

    #[test]
    fn preference_edit_preserves_effective_legacy_plugins_and_root_values() {
        let files = scratch("preferences-legacy-effective-values");
        fs::write(
            &files.settings_files[0],
            r#"{"legacyRoot":{"kept":true},"plugins":{"otherPlugin":{"untouched":17},"adventure-quest-worlds":{"playerCharacter":"LegacyHero","autoSync":true,"unknownAqw":{"kept":true}}}}"#,
        ).unwrap();
        fs::write(&files.canonical_settings, r#"{"appLanguage":"en-US","ruffleQuality":"High"}"#).unwrap();
        let before = merged_settings(&files);

        change_profile_preference(&files, ProfilePreferenceChange::AppLanguage("pt-BR".into())).unwrap();

        let after = merged_settings(&files);
        let mut expected = before;
        expected.insert("appLanguage".into(), Value::String("pt-BR".into()));
        assert_eq!(after, expected);
        assert_eq!(after["plugins"]["otherPlugin"]["untouched"], 17);
        assert_eq!(after["playerCharacter"], "LegacyHero");
        assert_eq!(after["autoSync"], true);
        assert_eq!(after["unknownAqw"]["kept"], true);
        assert_eq!(after["legacyRoot"]["kept"], true);
    }

    #[test]
    fn shortcut_reset_preserves_manifest_multibinding_array() {
        let files = scratch("preferences-shortcut-reset");
        fs::write(&files.canonical_settings, r#"{"plugins":{"adventure-quest-worlds":{"reload":["Alt+X"],"reloadCache":"F8"}}}"#).unwrap();
        let defaults = keybind_default("reload").unwrap();
        change_profile_preference(&files, ProfilePreferenceChange::Keybind(ShortcutPreferenceChange {
            id: "reload".into(), binding: defaults.clone()
        })).unwrap();
        let saved: Value = serde_json::from_str(&fs::read_to_string(&files.canonical_settings).unwrap()).unwrap();
        assert_eq!(saved["reload"], defaults);
        assert_eq!(saved["plugins"][PLUGIN_ID]["reload"], serde_json::json!(["Alt+X"]));
        assert_eq!(saved["plugins"][PLUGIN_ID]["reloadCache"], "F8");
        assert_eq!(profile_preferences(&files).unwrap().keybinds.iter().find(|bind| bind.id == "reload").unwrap().binding, defaults);
    }

    #[test]
    fn preferences_reject_unsupported_values_and_report_imported_shortcuts() {
        let files = scratch("preferences-invalid");
        let source = r#"{"appLanguage":"en-US","plugins":{"adventure-quest-worlds":{"wiki":"Alt+?"}}}"#;
        fs::write(&files.canonical_settings, source).unwrap();
        let snapshot = profile_preferences(&files).unwrap();
        assert!(snapshot.keybind_diagnostics.iter().any(|item| item.starts_with("wiki:")));
        assert!(change_profile_preference(&files, ProfilePreferenceChange::AppLanguage("xx".into())).is_err());
        assert!(change_profile_preference(&files, ProfilePreferenceChange::Keybind(ShortcutPreferenceChange {
            id: "wiki".into(), binding: Value::String("Alt+?".into())
        })).is_err());
        assert_eq!(fs::read_to_string(&files.canonical_settings).unwrap(), source);
    }

    #[test]
    fn malformed_canonical_settings_are_reported_without_rewrite() {
        let files = scratch("preferences-malformed");
        let source = "{ this is not JSON";
        fs::write(&files.canonical_settings, source).unwrap();
        assert!(profile_preferences(&files).is_err());
        assert!(change_profile_preference(&files, ProfilePreferenceChange::AutoSync(true)).is_err());
        assert_eq!(fs::read_to_string(&files.canonical_settings).unwrap(), source);
    }

    #[test]
    fn reminders_and_todo_round_trip_the_editor_state() {
        let files = scratch("lists");
        fs::write(&files.reminders, r#"{"characters":[{"id":"hero","name":"Ada"}],"quests":[{"id":"q1","name":"Fixture Quest","joinCommand":"/join fixture","type":"weekly","hidden":true,"done":{"hero":4102444800000},"note":"keep me"}],"showCompleted":false}"#).unwrap();
        let loaded = reminders_document(&files).unwrap();
        assert_eq!(loaded["data"]["quests"][0]["hiddenBy"]["__shared__"], true);
        assert!(loaded["data"]["quests"][0].get("hidden").is_none());
        assert_eq!(loaded["data"]["quests"][0]["done"]["hero"], 4102444800000u64);
        assert!(fs::read_to_string(&files.reminders).unwrap().contains("\"hidden\": true") || fs::read_to_string(&files.reminders).unwrap().contains("\"hidden\":true"));
        let mut edited = loaded["data"].clone();
        edited["quests"][0]["name"] = Value::String("Edited Quest".into());
        edited["showCompleted"] = Value::Bool(true);
        save_reminders(&files, &edited).unwrap();
        let again = reminders_document(&files).unwrap();
        assert_eq!(again["data"]["quests"][0]["name"], "Edited Quest");
        assert_eq!(again["data"]["quests"][0]["note"], "keep me");
        assert_eq!(again["data"]["quests"][0]["done"]["hero"], 4102444800000u64);
        assert_eq!(again["data"]["showCompleted"], true);
        save_todo(&files, &serde_json::json!({
            "characters": [{"id":"hero","name":"Ada"}],
            "tasks": [{"id":"t1","name":"Fixture Task","category":"shopMerge","joinCommand":"/join shop","priority":true,"wikiLink":"https://aqwwiki.wikidot.com/fixture","extra":"kept"}],
            "individualHiddenMode": false
        })).unwrap();
        let stored: Value = serde_json::from_str(&fs::read_to_string(&files.todo).unwrap()).unwrap();
        assert_eq!(stored["tasks"][0]["extra"], "kept");
        let todo = todo_document(&files).unwrap();
        assert_eq!(todo["data"]["tasks"][0]["name"], "Fixture Task");
        assert_eq!(todo["data"]["tasks"][0]["category"], "shopMerge");
        assert_eq!(todo["data"]["tasks"][0]["priority"], true);
    }

    #[test]
    fn strategy_round_trip_keeps_roles_and_adds_default_potions() {
        let files = scratch("strategy");
        fs::write(&files.strategy, r#"{
            "timerShortcut":"Alt+Shift+F",
            "potions":[{"id":"p1","name":"Fixture Tonic","kind":"tonic"}],
            "classes":[{"id":"c1","name":"Fixture Class","role":"dps","favorites":{"tonicId":"p1","elixirId":"","potionId":""}}],
            "bosses":[{
                "id":"b1","name":"Fixture Boss","joinCommand":"/join bossroom","kind":"ultra","reset":"weekly",
                "strategies":[{
                    "id":"s1","name":"Fixture Strategy","bossNotes":"stay left","strategyNotes":"taunt first",
                    "classIds":["c1"],
                    "timerRoles":[{"id":"r1","name":"T1","offset":6,"interval":20,"typeId":"taunt","target":"main","note":"first"}]
                }]
            }]
        }"#).unwrap();
        let loaded = strategy_document(&files).unwrap();
        assert_eq!(loaded["data"]["timerShortcut"], "Alt+Shift+F");
        assert_eq!(loaded["data"]["bosses"][0]["strategies"][0]["timerRoles"][0]["offset"], 6);
        assert!(loaded["data"]["potions"].as_array().unwrap().iter().any(|potion| potion["name"] == "Body Tonic"));
        assert!(!fs::read_to_string(&files.strategy).unwrap().contains("Body Tonic"));
        let mut edited = loaded["data"].clone();
        edited["bosses"][0]["strategies"][0]["strategyNotes"] = Value::String("edited note".into());
        edited["classes"][0]["favorites"] = serde_json::json!({"tonicId":"","elixirId":"","potionId":""});
        let saved = save_strategy(&files, &edited).unwrap();
        assert_eq!(saved["data"]["bosses"][0]["strategies"][0]["strategyNotes"], "edited note");
        assert_eq!(saved["data"]["classes"][0]["favorites"]["tonicId"], "p1");
        assert_eq!(saved["data"]["bosses"][0]["strategies"][0]["classIds"].as_array().unwrap().len(), 4);
        let text = fs::read_to_string(&files.strategy).unwrap();
        assert!(text.contains("Body Tonic"));
        assert!(text.contains("Alt+Shift+F"));
        assert!(text.contains("edited note"));
    }

    #[test]
    fn timer_shortcut_parses_the_electron_accelerator() {
        let accel = parse_accelerator("Alt+Shift+U").unwrap();
        assert!(accel.alt && accel.shift && accel.key == "U");
        assert!(!accel.control && !accel.command_or_control);
        assert!(parse_accelerator("").is_none());
        assert!(parse_accelerator("Alt+").is_none());
    }


}
