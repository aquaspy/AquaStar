//! Electron profile windows: settings, reminders, to-do, and strategy.
//!
//! The files are the ones Electron already writes under the AquaStar app-data
//! directory. A later file in the settings chain wins, and a plugins object
//! replaces the earlier one. List files are read as Electron last saved them.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{Map, Value};

const REMINDERS_SEED: &str = include_str!(
    "../../../plugins/adventure-quest-worlds/features/reminders/reminders_default.json"
);
const STRATEGY_SEED: &str =
    include_str!("../../../plugins/adventure-quest-worlds/features/strategy/strategy_default.json");

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Row {
    pub label: String,
    pub value: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ToolDocument {
    pub name: String,
    pub title: String,
    pub path: String,
    pub rows: Vec<Row>,
}

pub struct ListPaths {
    pub settings_files: Vec<PathBuf>,
    pub reminders: PathBuf,
    pub legacy_reminders: PathBuf,
    pub todo: PathBuf,
    pub strategy: PathBuf,
}

pub fn documents(paths: &ListPaths) -> Vec<ToolDocument> {
    vec![
        settings_document(&paths.settings_files),
        reminders_document(&paths.reminders, &paths.legacy_reminders),
        todo_document(&paths.todo),
        strategy_document(&paths.strategy),
    ]
}

pub fn tool_spec(name: &str) -> Option<(&'static str, f64, f64)> {
    Some(match name {
        "settings" => ("AquaStar - Settings", 640.0, 680.0),
        "reminders" => ("AquaStar - Reminders", 1040.0, 620.0),
        "todo" => ("AquaStar - To-Do List", 960.0, 620.0),
        "strategy" => ("AquaStar - Strategy", 1040.0, 680.0),
        _ => return None,
    })
}

/// Create the list files Electron creates the first time those windows open.
/// An existing canonical file is left untouched. A legacy reminders file is
/// copied once into the AquaStar directory.
pub fn ensure_window(paths: &ListPaths, name: &str) -> Result<(), String> {
    match name {
        "reminders" => {
            if paths.reminders.exists() {
                return Ok(());
            }
            if paths.legacy_reminders.is_file() {
                if let Some(dir) = paths.reminders.parent() {
                    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
                }
                fs::copy(&paths.legacy_reminders, &paths.reminders).map_err(|e| e.to_string())?;
            } else {
                write_json(&paths.reminders, &reminders_seed())?;
            }
            Ok(())
        }
        "todo" => {
            if paths.todo.exists() {
                return Ok(());
            }
            write_json(
                &paths.todo,
                &serde_json::json!({
                    "characters": [],
                    "tasks": [],
                    "individualHiddenMode": false
                }),
            )
        }
        "strategy" => {
            if paths.strategy.exists() {
                return Ok(());
            }
            let seed: Value = serde_json::from_str(STRATEGY_SEED).map_err(|e| e.to_string())?;
            write_json(&paths.strategy, &seed)
        }
        _ => Ok(()),
    }
}

fn settings_document(files: &[PathBuf]) -> ToolDocument {
    let merged = merge_settings(files);
    let mut rows = Vec::new();
    walk(&mut rows, "", &merged);
    ToolDocument {
        name: "settings".into(),
        title: "AquaStar - Settings".into(),
        path: files
            .last()
            .map(|path| path.display().to_string())
            .unwrap_or_default(),
        rows,
    }
}

fn reminders_document(path: &Path, legacy: &Path) -> ToolDocument {
    let (value, shown) = if path.is_file() {
        (
            read_json(path).unwrap_or_else(|| serde_json::json!({})),
            path,
        )
    } else if legacy.is_file() {
        (
            read_json(legacy).unwrap_or_else(|| serde_json::json!({})),
            legacy,
        )
    } else {
        (reminders_seed(), path)
    };
    ToolDocument {
        name: "reminders".into(),
        title: "AquaStar - Reminders".into(),
        path: shown.display().to_string(),
        rows: list_rows(
            &value,
            "quests",
            &[
                "name",
                "type",
                "category",
                "joinCommand",
                "member",
                "seasonal",
                "seasonalEvent",
            ],
        ),
    }
}

fn todo_document(path: &Path) -> ToolDocument {
    let value = read_json(path).unwrap_or_else(
        || serde_json::json!({"characters": [], "tasks": [], "individualHiddenMode": false}),
    );
    ToolDocument {
        name: "todo".into(),
        title: "AquaStar - To-Do List".into(),
        path: path.display().to_string(),
        rows: list_rows(
            &value,
            "tasks",
            &[
                "name",
                "category",
                "joinCommand",
                "priority",
                "wikiLink",
                "seasonal",
                "seasonalEvent",
            ],
        ),
    }
}

fn strategy_document(path: &Path) -> ToolDocument {
    let value = if path.is_file() {
        read_json(path).unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::from_str(STRATEGY_SEED).unwrap_or_else(|_| serde_json::json!({}))
    };
    let mut rows = Vec::new();
    if let Some(text) = value.get("timerShortcut").and_then(scalar) {
        rows.push(Row {
            label: "Timer shortcut".into(),
            value: text,
        });
    }
    push_named(&mut rows, &value, "potions", "Potion", &["kind"]);
    push_named(&mut rows, &value, "classes", "Class", &["role"]);
    if let Some(bosses) = value.get("bosses").and_then(Value::as_array) {
        for boss in bosses {
            let Some(boss) = boss.as_object() else {
                continue;
            };
            let name = text_at(boss, "name");
            if name.is_empty() {
                continue;
            }
            let mut parts = Vec::new();
            for key in ["reset", "kind", "joinCommand", "generalInfo"] {
                if let Some(text) = boss.get(key).and_then(scalar) {
                    if !text.is_empty() {
                        parts.push(format!("{key}={text}"));
                    }
                }
            }
            if let Some(strategies) = boss.get("strategies").and_then(Value::as_array) {
                for strategy in strategies {
                    let Some(strategy) = strategy.as_object() else {
                        continue;
                    };
                    let strategy_name = text_at(strategy, "name");
                    if strategy_name.is_empty() {
                        continue;
                    }
                    parts.push(format!("strategy={strategy_name}"));
                    for key in ["bossNotes", "strategyNotes"] {
                        if let Some(text) = strategy.get(key).and_then(scalar) {
                            if !text.is_empty() {
                                parts.push(format!("{key}={text}"));
                            }
                        }
                    }
                }
            }
            rows.push(Row {
                label: format!("Boss {name}"),
                value: parts.join(" · "),
            });
        }
    }
    ToolDocument {
        name: "strategy".into(),
        title: "AquaStar - Strategy".into(),
        path: path.display().to_string(),
        rows,
    }
}

fn list_rows(value: &Value, items_key: &str, fields: &[&str]) -> Vec<Row> {
    let mut rows = Vec::new();
    for key in ["showCompleted", "showMemberDailies", "individualHiddenMode"] {
        if let Some(text) = value.get(key).and_then(scalar) {
            rows.push(Row {
                label: key.into(),
                value: text,
            });
        }
    }
    let names = character_names(value);
    for name in &names {
        rows.push(Row {
            label: "Character".into(),
            value: name.clone(),
        });
    }
    let Some(items) = value.get(items_key).and_then(Value::as_array) else {
        return rows;
    };
    for item in items {
        let Some(item) = item.as_object() else {
            continue;
        };
        let name = text_at(item, "name");
        if name.is_empty() {
            continue;
        }
        let mut parts = Vec::new();
        for key in fields {
            if *key == "name" {
                continue;
            }
            if let Some(text) = item.get(*key).and_then(scalar) {
                if !text.is_empty() && text != "false" {
                    parts.push(format!("{key}={text}"));
                }
            }
        }
        if let Some(done) = item.get("done").and_then(Value::as_object) {
            let who: Vec<String> = done
                .iter()
                .filter_map(|(id, flag)| {
                    if flag.as_bool() != Some(true) {
                        return None;
                    }
                    let named = names
                        .iter()
                        .find(|name| name_id(value, name) == Some(id.as_str()));
                    Some(named.cloned().unwrap_or_else(|| id.clone()))
                })
                .collect();
            if !who.is_empty() {
                parts.push(format!("done={}", who.join(", ")));
            }
        }
        rows.push(Row {
            label: name,
            value: parts.join(" · "),
        });
    }
    rows
}

fn push_named(rows: &mut Vec<Row>, value: &Value, key: &str, kind: &str, fields: &[&str]) {
    let Some(items) = value.get(key).and_then(Value::as_array) else {
        return;
    };
    for item in items {
        let Some(item) = item.as_object() else {
            continue;
        };
        let name = text_at(item, "name");
        if name.is_empty() {
            continue;
        }
        let mut parts = Vec::new();
        for field in fields {
            if let Some(text) = item.get(*field).and_then(scalar) {
                if !text.is_empty() {
                    parts.push(format!("{field}={text}"));
                }
            }
        }
        rows.push(Row {
            label: format!("{kind} {name}"),
            value: parts.join(" · "),
        });
    }
}

fn character_names(value: &Value) -> Vec<String> {
    value
        .get("characters")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|character| character.get("name").and_then(Value::as_str))
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect()
}

fn name_id<'a>(value: &'a Value, name: &str) -> Option<&'a str> {
    value
        .get("characters")
        .and_then(Value::as_array)?
        .iter()
        .find(|character| character.get("name").and_then(Value::as_str) == Some(name))
        .and_then(|character| character.get("id").and_then(Value::as_str))
}

fn text_at(obj: &Map<String, Value>, key: &str) -> String {
    obj.get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string()
}

fn merge_settings(files: &[PathBuf]) -> Value {
    let mut top = Map::new();
    let mut plugins = None;
    for path in files {
        let Some(value) = read_json(path) else {
            continue;
        };
        let Some(obj) = value.as_object() else {
            continue;
        };
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
    Value::Object(top)
}

fn walk(rows: &mut Vec<Row>, prefix: &str, value: &Value) {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                let path = if prefix.is_empty() {
                    key.clone()
                } else {
                    format!("{prefix}.{key}")
                };
                walk(rows, &path, child);
            }
        }
        Value::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                walk(rows, &format!("{prefix}[{index}]"), child);
            }
        }
        other => {
            if let Some(text) = scalar(other) {
                if !text.is_empty() {
                    rows.push(Row {
                        label: prefix.to_string(),
                        value: text,
                    });
                }
            }
        }
    }
}

fn scalar(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Bool(flag) => Some(flag.to_string()),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

fn read_json(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(path, text + "\n").map_err(|e| e.to_string())
}

fn reminders_seed() -> Value {
    let raw: Value = serde_json::from_str(REMINDERS_SEED).unwrap_or_else(|_| serde_json::json!({}));
    let quests = raw
        .get("quests")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(index, quest)| {
            let mut quest = quest.as_object().cloned().unwrap_or_default();
            quest.insert("id".into(), Value::String(format!("q_seed_{index}")));
            quest.entry("done").or_insert_with(|| serde_json::json!({}));
            quest
                .entry("hiddenBy")
                .or_insert_with(|| serde_json::json!({}));
            Value::Object(quest)
        })
        .collect::<Vec<_>>();
    serde_json::json!({
        "characters": [],
        "quests": quests,
        "showCompleted": true,
        "showMemberDailies": true,
        "individualHiddenMode": false
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("aquastar-profile-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(path.join("AquaStar")).unwrap();
        path
    }

    fn shows(doc: &ToolDocument, needle: &str) -> bool {
        doc.rows
            .iter()
            .any(|row| row.label.contains(needle) || row.value.contains(needle))
            || doc.title.contains(needle)
            || doc.path.contains(needle)
    }

    #[test]
    fn electron_profile_fixture_shows_in_all_four_windows() {
        let root = scratch("fixture");
        let aqua = root.join("AquaStar");
        fs::write(
            aqua.join("aquastar.json"),
            r#"{
                "customUrl": "https://example.test/fixture.swf",
                "appLanguage": "pt-BR",
                "toggleFastTravel": "Alt+1",
                "plugins": {
                    "adventure-quest-worlds": {
                        "playerCharacter": "FixtureHero",
                        "liveLoaderUrl": false
                    }
                }
            }"#,
        )
        .unwrap();
        fs::write(
            root.join("aquastar.json"),
            r#"{"customUrl":"https://example.test/old.swf","appLanguage":"en-US"}"#,
        )
        .unwrap();
        fs::write(
            aqua.join("aquastar_reminders.json"),
            r#"{
                "characters": [{"id":"hero","name":"FixtureHero"}],
                "quests": [{
                    "id":"q1",
                    "name":"Fixture Quest",
                    "joinCommand":"/join fixture",
                    "type":"weekly",
                    "category":"ultra",
                    "member": true,
                    "done": {"hero": true}
                }],
                "showCompleted": true,
                "showMemberDailies": false,
                "individualHiddenMode": false
            }"#,
        )
        .unwrap();
        fs::write(
            aqua.join("aquastar_todo.json"),
            r#"{
                "characters": [{"id":"hero","name":"FixtureHero"}],
                "tasks": [{
                    "id":"t1",
                    "name":"Fixture Task",
                    "category":"shopMerge",
                    "joinCommand":"/join shop",
                    "priority": true,
                    "wikiLink":"https://example.test/task"
                }],
                "individualHiddenMode": false
            }"#,
        )
        .unwrap();
        fs::write(
            aqua.join("aquastar_strategy.json"),
            r#"{
                "timerShortcut": "Alt+Shift+F",
                "potions": [{"id":"p1","name":"Fixture Tonic","kind":"tonic"}],
                "classes": [{"id":"c1","name":"Fixture Class","role":"dps"}],
                "bosses": [{
                    "id":"b1",
                    "name":"Fixture Boss",
                    "joinCommand":"/join bossroom",
                    "reset":"weekly",
                    "kind":"ultra",
                    "strategies": [{
                        "id":"s1",
                        "name":"Fixture Strategy",
                        "bossNotes":"stay left",
                        "strategyNotes":"taunt first"
                    }]
                }],
                "timerTypes": []
            }"#,
        )
        .unwrap();
        let reminders = aqua.join("aquastar_reminders.json");
        let legacy = root.join("aquastar_reminders.json");
        let todo = aqua.join("aquastar_todo.json");
        let strategy = aqua.join("aquastar_strategy.json");
        let docs = documents(&ListPaths {
            settings_files: vec![root.join("aquastar.json"), aqua.join("aquastar.json")],
            reminders: reminders.clone(),
            legacy_reminders: legacy,
            todo: todo.clone(),
            strategy: strategy.clone(),
        });
        let find = |name: &str| docs.iter().find(|doc| doc.name == name).unwrap();
        let settings_doc = find("settings");
        let reminders_doc = find("reminders");
        let todo_doc = find("todo");
        let strategy_doc = find("strategy");

        for needle in [
            "https://example.test/fixture.swf",
            "pt-BR",
            "Alt+1",
            "FixtureHero",
            "false",
        ] {
            assert!(shows(settings_doc, needle), "settings missing {needle}");
        }
        assert!(!shows(settings_doc, "https://example.test/old.swf"));
        assert!(!shows(settings_doc, "en-US"));
        for needle in [
            "FixtureHero",
            "Fixture Quest",
            "/join fixture",
            "weekly",
            "ultra",
            "false",
        ] {
            assert!(shows(reminders_doc, needle), "reminders missing {needle}");
        }
        assert!(reminders_doc.path.ends_with("aquastar_reminders.json"));
        for needle in [
            "FixtureHero",
            "Fixture Task",
            "shopMerge",
            "/join shop",
            "true",
            "https://example.test/task",
        ] {
            assert!(shows(todo_doc, needle), "todo missing {needle}");
        }
        for needle in [
            "Alt+Shift+F",
            "Fixture Tonic",
            "Fixture Class",
            "Fixture Boss",
            "Fixture Strategy",
            "/join bossroom",
            "stay left",
            "taunt first",
        ] {
            assert!(shows(strategy_doc, needle), "strategy missing {needle}");
        }
        assert_eq!(settings_doc.title, "AquaStar - Settings");
        assert_eq!(reminders_doc.title, "AquaStar - Reminders");
        assert_eq!(todo_doc.title, "AquaStar - To-Do List");
        assert_eq!(strategy_doc.title, "AquaStar - Strategy");
    }

    #[test]
    fn legacy_reminders_show_until_the_canonical_file_exists() {
        let root = scratch("legacy");
        fs::write(
            root.join("aquastar_reminders.json"),
            r#"{"characters":[{"id":"a","name":"LegacyHero"}],"quests":[{"name":"Legacy Quest","joinCommand":"/join legacy","type":"daily"}],"showCompleted":true}"#,
        )
        .unwrap();
        let reminders = root.join("AquaStar").join("aquastar_reminders.json");
        let legacy = root.join("aquastar_reminders.json");
        let todo = root.join("AquaStar").join("aquastar_todo.json");
        let strategy = root.join("AquaStar").join("aquastar_strategy.json");
        let docs = documents(&ListPaths {
            settings_files: vec![],
            reminders: reminders.clone(),
            legacy_reminders: legacy,
            todo,
            strategy,
        });
        let reminders_doc = docs.iter().find(|doc| doc.name == "reminders").unwrap();
        assert!(shows(reminders_doc, "Legacy Quest"));
        assert!(shows(reminders_doc, "LegacyHero"));
        assert!(!reminders_doc.path.contains("AquaStar"));
        assert!(!reminders.is_file());
    }

    #[test]
    fn missing_list_files_are_seeded_without_touching_an_existing_profile() {
        let root = scratch("seed");
        let aqua = root.join("AquaStar");
        fs::write(
            aqua.join("aquastar_todo.json"),
            r#"{"characters":[],"tasks":[{"name":"Keep Me"}],"individualHiddenMode":false}"#,
        )
        .unwrap();
        let reminders = aqua.join("aquastar_reminders.json");
        let legacy = root.join("aquastar_reminders.json");
        let todo = aqua.join("aquastar_todo.json");
        let strategy = aqua.join("aquastar_strategy.json");
        let paths = ListPaths {
            settings_files: vec![],
            reminders: reminders.clone(),
            legacy_reminders: legacy,
            todo: todo.clone(),
            strategy: strategy.clone(),
        };
        ensure_window(&paths, "reminders").unwrap();
        ensure_window(&paths, "todo").unwrap();
        ensure_window(&paths, "strategy").unwrap();
        let reminders_text = fs::read_to_string(&reminders).unwrap();
        let strategy_text = fs::read_to_string(&strategy).unwrap();
        let todo_text = fs::read_to_string(&todo).unwrap();
        assert!(reminders_text.contains("Free Treasure Chest Keys"));
        assert!(strategy_text.contains("Body Tonic"));
        assert!(todo_text.contains("Keep Me"));
        let docs = documents(&paths);
        let reminders_doc = docs.iter().find(|doc| doc.name == "reminders").unwrap();
        let strategy_doc = docs.iter().find(|doc| doc.name == "strategy").unwrap();
        assert!(shows(reminders_doc, "Free Treasure Chest Keys"));
        assert!(shows(strategy_doc, "Body Tonic"));
        assert!(shows(strategy_doc, "Alt+Shift+U"));
    }

    #[test]
    fn window_pages_render_the_document_text() {
        let ui = Path::new(env!("CARGO_MANIFEST_DIR")).join("../ui");
        let js = fs::read_to_string(ui.join("tools.js")).unwrap();
        assert!(js.contains("row.label"));
        assert!(js.contains("label.textContent = row.label"));
        assert!(js.contains("value.textContent = row.value"));
        assert!(js.contains("invoke('tool_document'"));
        for name in ["settings", "reminders", "todo", "strategy"] {
            let html = fs::read_to_string(ui.join(format!("{name}.html"))).unwrap();
            assert!(html.contains(&format!("data-tool=\"{name}\"")), "{name}");
            assert!(html.contains("tools.js"), "{name}");
            assert!(html.contains("id=\"rows\""), "{name}");
            let (title, _, _) = tool_spec(name).unwrap();
            assert!(title.starts_with("AquaStar - "));
        }
        let launcher = fs::read_to_string(ui.join("index.html")).unwrap();
        for name in ["settings", "reminders", "todo", "strategy"] {
            assert!(launcher.contains(&format!("data-tool=\"{name}\"")));
        }
    }
}
