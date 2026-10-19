//! Electron profile windows. Settings, reminders, to-do, and strategy read and
//! write the same JSON files Electron uses, with the same merge and migration.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Map, Value};

const PLUGIN_ID: &str = "adventure-quest-worlds";
const SETTINGS_MESSAGES: &str = include_str!("../assets/settings-messages.json");
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
    pub plugins_dir: PathBuf,
    pub swf_managed: PathBuf,
    pub swf_candidates: Vec<PathBuf>,
}

pub fn files_from(profile: &crate::placement::ProfilePaths) -> ProfileFiles {
    ProfileFiles {
        canonical_settings: profile.aqua_dir.join("aquastar.json"),
        reminders: profile.aqua_dir.join("aquastar_reminders.json"),
        legacy_reminders: profile.legacy_reminders.clone(),
        todo: profile.aqua_dir.join("aquastar_todo.json"),
        strategy: profile.aqua_dir.join("aquastar_strategy.json"),
        inventory: profile.aqua_dir.join("aquastar_inventory.json"),
        plugins_dir: profile.aqua_dir.join("plugins"),
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
        "settings" => ("AquaStar - Settings", 640.0, 680.0),
        "reminders" => ("AquaStar - Reminders", 1040.0, 620.0),
        "todo" => ("AquaStar - To-Do List", 960.0, 620.0),
        "strategy" => ("AquaStar - Strategy", 1040.0, 680.0),
        "inventory" => ("AquaStar - Inventory", 1040.0, 620.0),
        _ => return None,
    })
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

pub fn settings_messages() -> Value {
    parse_static(SETTINGS_MESSAGES)
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

pub fn keybindings_payload(files: &ProfileFiles) -> Value {
    migrate_settings_files(&files.settings_files);
    let mut merged = merge_settings(&files.settings_files);
    if merged.get("ruffleAutoUpdateMigrated") != Some(&Value::Bool(true)) {
        merged.insert("ruffleAutoUpdate".into(), Value::Bool(true));
        merged.insert("ruffleAutoUpdateMigrated".into(), Value::Bool(true));
        if files.canonical_settings.is_file() {
            if let Some(mut canonical) = read_json(&files.canonical_settings).and_then(|v| v.as_object().cloned()) {
                canonical.insert("ruffleAutoUpdate".into(), Value::Bool(true));
                canonical.insert("ruffleAutoUpdateMigrated".into(), Value::Bool(true));
                let _ = write_electron(&files.canonical_settings, &Value::Object(canonical));
            }
        }
    }
    let mut current = defaults_map();
    for (key, value) in &merged {
        if key != "plugins" {
            current.insert(key.clone(), value.clone());
        }
    }
    serde_json::json!({
        "current": current,
        "defaults": keybind_defaults(),
        "options": option_defaults(),
        "renderModeChoices": [
            {"id": "flash", "label": "Flash Player"},
            {"id": "ruffle", "label": "Ruffle (Experimental)"}
        ],
        "ruffleUpdateChannelChoices": [
            {"id": "latest", "label": "Latest (Stable)"},
            {"id": "nightly", "label": "Nightly (Experimental)"}
        ],
        "ruffleQualityChoices": [
            {"id": "high", "label": "High (default)"},
            {"id": "medium", "label": "Medium"},
            {"id": "low", "label": "Low (fastest)"}
        ],
        "appLanguageChoices": [
            {"id": "system", "label": "System default"},
            {"id": "en-US", "label": "English"},
            {"id": "pt-BR", "label": "Português (Brasil)"}
        ],
        "visibleKeybindIds": keybind_default_ids(),
        "savePath": files.canonical_settings.display().to_string()
    })
}

pub fn save_keybindings(files: &ProfileFiles, changed: &Value) -> Result<Value, String> {
    let existing = read_json(&files.canonical_settings)
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    let active = changed
        .get("activePluginId")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
        .or_else(|| existing.get("activePluginId").and_then(Value::as_str).filter(|id| !id.is_empty()).map(str::to_string))
        .unwrap_or_else(|| PLUGIN_ID.to_string());
    let changed_map = changed.as_object().cloned().unwrap_or_default();
    let next = split_save(&changed_map, &active, existing);
    write_electron(&files.canonical_settings, &Value::Object(next))?;
    Ok(serde_json::json!({ "savedTo": files.canonical_settings.display().to_string() }))
}

pub fn plugin_settings(files: &ProfileFiles) -> Value {
    let settings = read_json(&files.canonical_settings).unwrap_or(Value::Null);
    serde_json::json!({
        "activePluginId": settings.get("activePluginId").and_then(Value::as_str).unwrap_or(""),
        "pluginSystem": settings.get("pluginSystem").and_then(Value::as_bool).unwrap_or(true),
        "enableLocalPlugins": settings.get("enableLocalPlugins") == Some(&Value::Bool(true)),
        "allowLocalPluginOverride": settings.get("allowLocalPluginOverride") == Some(&Value::Bool(true)),
        "trustedLocalPlugins": settings.get("trustedLocalPlugins").cloned().filter(|v| v.is_object()).unwrap_or(serde_json::json!({}))
    })
}

pub fn settings_layout() -> Value {
    serde_json::json!({
        "plugin": {"id": PLUGIN_ID, "name": "Adventure Quest Worlds"},
        "pluginSections": [
            {
                "id": "aqw-account",
                "title": "Account & Inventory",
                "titleKey": "account",
                "order": 10,
                "fields": [
                    {"key": "playerCharacter", "type": "text", "sanitize": "alphanumeric"},
                    {"key": "featurePlayerName", "type": "boolean"},
                    {"key": "autoSync", "type": "boolean"}
                ]
            },
            {
                "id": "aqw-game",
                "title": "Game",
                "titleKey": "game",
                "order": 20,
                "fields": [{"key": "liveLoaderUrl", "type": "boolean"}]
            }
        ]
    })
}

pub fn plugin_list(files: &ProfileFiles, opts: &Value) -> Value {
    let settings = plugin_settings(files);
    let enable_local = opts.get("enableLocalPlugins").and_then(Value::as_bool).unwrap_or(settings["enableLocalPlugins"].as_bool().unwrap_or(false));
    let allow_override = opts.get("allowLocalPluginOverride").and_then(Value::as_bool).unwrap_or(settings["allowLocalPluginOverride"].as_bool().unwrap_or(false));
    let trusted = opts.get("trustedLocalPlugins").cloned().filter(|v| v.is_object()).unwrap_or(settings["trustedLocalPlugins"].clone());
    let mut plugins = vec![serde_json::json!({
        "id": PLUGIN_ID,
        "name": "Adventure Quest Worlds",
        "version": "1.0.0",
        "source": "bundled",
        "trusted": true
    })];
    let mut errors = Vec::new();
    if enable_local {
        if let Ok(entries) = fs::read_dir(&files.plugins_dir) {
            let mut locals: Vec<_> = entries.flatten().collect();
            locals.sort_by_key(|entry| entry.file_name());
            for entry in locals {
                let manifest_path = entry.path().join("plugin.json");
                let Some(manifest) = read_json(&manifest_path) else { continue };
                let Some(id) = manifest.get("id").and_then(Value::as_str) else { continue };
                if id == PLUGIN_ID && !allow_override {
                    errors.push(format!("{id} collides with the bundled plugin"));
                    continue;
                }
                if id == PLUGIN_ID && allow_override {
                    plugins.retain(|plugin| plugin["id"].as_str() != Some(id));
                }
                plugins.push(serde_json::json!({
                    "id": id,
                    "name": manifest.get("name").and_then(Value::as_str).unwrap_or(id),
                    "version": manifest.get("version").and_then(Value::as_str).unwrap_or(""),
                    "source": "local",
                    "trusted": trusted.get(id) == Some(&Value::Bool(true))
                }));
            }
        }
    }
    serde_json::json!({
        "plugins": plugins,
        "errors": errors,
        "localPluginsDir": files.plugins_dir.display().to_string()
    })
}

pub fn ruffle_status(files: &ProfileFiles) -> Value {
    let merged = merge_settings(&files.settings_files);
    let channel = if merged.get("ruffleUpdateChannel").and_then(Value::as_str) == Some("nightly") { "nightly" } else { "latest" };
    serde_json::json!({
        "isActive": merged.get("renderMode").and_then(Value::as_str) == Some("ruffle"),
        "configuredChannel": channel,
        "loaded": {"source": "bundled", "channel": channel, "version": "desktop pin"},
        "fallback": {"version": "desktop pin"}
    })
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

fn migrate_settings_files(paths: &[PathBuf]) {
    for path in paths {
        let Some(mut value) = read_json(path) else { continue };
        let Some(obj) = value.as_object_mut() else { continue };
        if obj.get("renderMode").and_then(Value::as_str) == Some("ruffle-native") {
            obj.insert("renderMode".into(), Value::String("ruffle".into()));
            let _ = write_electron(path, &value);
        }
    }
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

fn defaults_map() -> Map<String, Value> {
    let mut map = Map::new();
    if let Value::Object(options) = option_defaults() {
        map.extend(options);
    }
    if let Value::Object(binds) = keybind_defaults() {
        map.extend(binds);
    }
    map
}

fn option_defaults() -> Value {
    serde_json::json!({
        "appLanguage": "system",
        "customUrl": "",
        "renderMode": "flash",
        "ruffleUpdateChannel": "latest",
        "ruffleAutoUpdate": true,
        "ruffleQuality": "high",
        "showGameMenu": true,
        "enableDevTools": false,
        "playerCharacter": "",
        "featurePlayerName": false,
        "autoSync": false,
        "liveLoaderUrl": true
    })
}

fn keybind_defaults() -> Value {
    crate::manifest::keybind_defaults_value()
}

fn keybind_default_ids() -> Vec<String> {
    crate::manifest::keybind_ids()
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
            plugins_dir: aqua.join("plugins"),
            swf_managed: aqua.join("custom-game.swf"),
            swf_candidates: vec![aqua.join("custom-game.swf"), aqua.join("aqlite_old.swf")],
        }
    }

    #[test]
    fn settings_round_trip_keeps_electron_shape() {
        let files = scratch("settings");
        fs::write(&files.canonical_settings, "{\n    \"fixtureKept\": 1,\n    \"ruffleAutoUpdateMigrated\": true,\n    \"ruffleAutoUpdate\": false,\n    \"plugins\": {\n        \"adventure-quest-worlds\": {\n            \"liveLoaderUrl\": true,\n            \"playerCharacter\": \"Old\"\n        }\n    }\n}").unwrap();
        fs::write(&files.settings_files[0], r#"{"customUrl":"https://old.example/old.swf","appLanguage":"en-US"}"#).unwrap();
        let view = keybindings_payload(&files);
        assert_eq!(view["current"]["customUrl"], "https://old.example/old.swf");
        assert_eq!(view["current"]["playerCharacter"], "Old");
        assert_eq!(view["current"]["ruffleAutoUpdate"], false);
        assert_eq!(view["current"]["reload"][0], "CmdOrCtrl+F5");
        save_keybindings(&files, &serde_json::json!({
            "appLanguage": "pt-BR",
            "liveLoaderUrl": false,
            "wiki": "Alt+9",
            "reload": ["F5"]
        })).unwrap();
        let saved: Value = serde_json::from_str(&fs::read_to_string(&files.canonical_settings).unwrap()).unwrap();
        let text = fs::read_to_string(&files.canonical_settings).unwrap();
        assert!(text.contains("\n    \""), "{text}");
        assert_eq!(saved["fixtureKept"], 1);
        assert_eq!(saved["appLanguage"], "pt-BR");
        assert_eq!(saved["liveLoaderUrl"], false);
        assert_eq!(saved["wiki"], "Alt+9");
        assert_eq!(saved["reload"][0], "F5");
        assert!(saved.get("plugins").unwrap().get("appLanguage").is_none());
        assert_eq!(saved["plugins"][PLUGIN_ID]["liveLoaderUrl"], false);
        assert_eq!(saved["plugins"][PLUGIN_ID]["wiki"], "Alt+9");
        assert_eq!(saved["plugins"][PLUGIN_ID]["playerCharacter"], "Old");
        assert!(saved["plugins"][PLUGIN_ID].get("reload").is_none());
        let again = keybindings_payload(&files);
        assert_eq!(again["current"]["appLanguage"], "pt-BR");
        assert_eq!(again["current"]["liveLoaderUrl"], false);
        assert_eq!(again["current"]["wiki"], "Alt+9");
    }

    #[test]
    fn retired_render_mode_becomes_ruffle_on_disk() {
        let files = scratch("render");
        fs::write(&files.canonical_settings, r#"{"renderMode":"ruffle-native","ruffleAutoUpdateMigrated":true}"#).unwrap();
        let view = keybindings_payload(&files);
        assert_eq!(view["current"]["renderMode"], "ruffle");
        let saved: Value = serde_json::from_str(&fs::read_to_string(&files.canonical_settings).unwrap()).unwrap();
        assert_eq!(saved["renderMode"], "ruffle");
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

    #[test]
    fn every_feature_window_has_its_page() {
        let ui = Path::new(env!("CARGO_MANIFEST_DIR")).join("../ui");
        for name in ["settings", "reminders", "todo", "strategy", "inventory", "about", "help"] {
            let page = ui.join(feature_page(name));
            assert!(page.is_file(), "missing {}", page.display());
        }
    }

    #[test]
    fn windows_use_the_electron_editors() {
        let ui = Path::new(env!("CARGO_MANIFEST_DIR")).join("../ui");
        let settings = fs::read_to_string(ui.join("features/settings/settings.html")).unwrap();
        let reminders = fs::read_to_string(ui.join("features/reminders/reminders.html")).unwrap();
        let todo = fs::read_to_string(ui.join("features/todo/todo.html")).unwrap();
        let strategy = fs::read_to_string(ui.join("features/strategy/strategy.html")).unwrap();
        let extra = fs::read_to_string(ui.join("features/strategy/strategy-extra.js")).unwrap();
        assert!(settings.contains("settings-bridge.js"));
        assert!(settings.contains("id=\"saveBtn\""));
        assert!(settings.contains("data-tab=\"keybinds\""));
        assert!(reminders.contains("reminders-bridge.js"));
        assert!(reminders.contains("id=\"addQuestBtn\"") || reminders.contains("addQuest"));
        assert!(todo.contains("todo-bridge.js"));
        assert!(strategy.contains("strategy-bridge.js"));
        assert!(strategy.contains("id=\"shortcutInput\""));
        assert!(extra.contains("timerRolesPanel"));
        assert!(extra.contains("startRoleRunner"));
        let bridge = fs::read_to_string(ui.join("features/strategy/strategy-bridge.js")).unwrap();
        assert!(bridge.contains("set_strategy_timer_shortcut"));
        assert!(bridge.contains("__aquastarTimerToggle"));
    }
}
