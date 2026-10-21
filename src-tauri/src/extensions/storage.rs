use serde_json::Value;
use std::{collections::BTreeMap, path::Path};
const LIMIT: usize = 1024 * 1024;

pub fn operation(dir: &Path, method: &str, key: &str, value: Value) -> Result<Value, String> {
    if key.is_empty() || key.len() > 128 {
        return Err("Invalid storage key".into());
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join("storage.json");
    let fallback = dir.join("storage.previous.json");
    let read_path = if !path.exists() && fallback.exists() {
        &fallback
    } else {
        &path
    };
    let mut document: BTreeMap<String, Value> = match std::fs::read(read_path) {
        Ok(bytes) if bytes.len() <= LIMIT => {
            serde_json::from_slice(&bytes).map_err(|e| e.to_string())?
        }
        Ok(_) => return Err("Plugin storage exceeds 1 MiB".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => BTreeMap::new(),
        Err(e) => return Err(e.to_string()),
    };
    match method {
        "storage.get" => return Ok(document.get(key).cloned().unwrap_or(Value::Null)),
        "storage.set" => {
            document.insert(key.into(), value);
        }
        "storage.remove" => {
            document.remove(key);
        }
        _ => return Err("Unknown storage operation".into()),
    }
    let bytes = serde_json::to_vec(&document).map_err(|e| e.to_string())?;
    if bytes.len() > LIMIT {
        return Err("Plugin storage exceeds 1 MiB".into());
    }
    let next = dir.join("storage.next.json");
    use std::io::Write;
    let mut file = std::fs::File::create(&next).map_err(|e| e.to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    drop(file);
    #[cfg(target_os = "windows")]
    {
        if path.exists() {
            if fallback.exists() {
                std::fs::remove_file(&fallback).map_err(|e| e.to_string())?;
            }
            std::fs::rename(&path, &fallback).map_err(|e| e.to_string())?;
        }
        if let Err(error) = std::fs::rename(&next, &path) {
            if fallback.exists() {
                let _ = std::fs::rename(&fallback, &path);
            }
            return Err(error.to_string());
        }
    }
    #[cfg(not(target_os = "windows"))]
    std::fs::rename(&next, &path).map_err(|e| e.to_string())?;
    Ok(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn temp() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "aquastar-storage-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    #[test]
    fn keeps_keys_and_plugins_isolated_and_survives_reload() {
        let dir = temp();
        let a = dir.join("one");
        let b = dir.join("two");
        let key = "../../secret";
        operation(&a, "storage.set", key, json!({"note":"first"})).unwrap();
        assert_eq!(
            operation(&a, "storage.get", key, Value::Null).unwrap(),
            json!({"note":"first"})
        );
        assert_eq!(
            operation(&b, "storage.get", key, Value::Null).unwrap(),
            Value::Null
        );
        operation(&a, "storage.remove", key, Value::Null).unwrap();
        assert_eq!(
            operation(&a, "storage.get", key, Value::Null).unwrap(),
            Value::Null
        );
        assert!(!dir.join("secret").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn quota_failure_preserves_previous_data_and_corruption_is_not_overwritten() {
        let dir = temp();
        operation(&dir, "storage.set", "key", json!("old")).unwrap();
        assert!(operation(&dir, "storage.set", "key", json!("x".repeat(LIMIT))).is_err());
        assert_eq!(
            operation(&dir, "storage.get", "key", Value::Null).unwrap(),
            json!("old")
        );
        std::fs::write(dir.join("storage.json"), b"invalid").unwrap();
        assert!(operation(&dir, "storage.set", "key", json!("new")).is_err());
        assert_eq!(std::fs::read(dir.join("storage.json")).unwrap(), b"invalid");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
