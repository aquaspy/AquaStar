pub mod builtin;
pub mod model;
mod network;
pub mod package;
pub mod runtime;
mod storage;

use package::{InstallReview, InstalledPlugin, PackageStore};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex,
};
use tauri::Manager;

pub struct Extensions {
    root: PathBuf,
    active: BTreeMap<String, InstalledPlugin>,
    reviews: Mutex<BTreeMap<String, (PathBuf, InstallReview)>>,
    gate: Mutex<()>,
    pending: AtomicBool,
    errors: Mutex<Vec<String>>,
    safe: bool,
}
impl Extensions {
    pub fn load(root: PathBuf) -> Self {
        let store = PackageStore::new(&root);
        let mut errors = Vec::new();
        let registry = store.load().unwrap_or_else(|error| {
            errors.push(error);
            Default::default()
        });
        let safe = std::env::var("AQUASTAR_DISABLE_PLUGINS").as_deref() == Ok("1");
        let mut active: BTreeMap<String, InstalledPlugin> = if safe {
            BTreeMap::new()
        } else {
            registry
                .plugins
                .into_iter()
                .filter(|(id, p)| {
                    if builtin::is_builtin(id) {
                        // The built-in copy wins over an installed package with the same id.
                        return false;
                    }
                    if !p.enabled {
                        return false;
                    }
                    if let Err(error) = p.manifest.validate(env!("CARGO_PKG_VERSION")) {
                        errors.push(format!("{id}: {error}"));
                        return false;
                    }
                    if !store.plugin_dir(p).is_dir() {
                        errors.push(format!("{id}: installed package is missing"));
                        return false;
                    }
                    true
                })
                .collect()
        };
        // Built-in plugins are first-party and stay available in safe mode, like AQW.
        for embedded in builtin::EMBEDDED {
            match embedded
                .manifest(env!("CARGO_PKG_VERSION"))
                .and_then(|manifest| embedded.materialize(&root.join("extensions")).map(|_| manifest))
            {
                Ok(manifest) => {
                    active.insert(
                        embedded.id.to_string(),
                        InstalledPlugin {
                            manifest,
                            version_dir: String::new(),
                            enabled: true,
                            pending_restart: false,
                        },
                    );
                }
                Err(error) => errors.push(format!("{}: {error}", embedded.id)),
            }
        }
        Self {
            root,
            active,
            reviews: Mutex::new(BTreeMap::new()),
            gate: Mutex::new(()),
            pending: AtomicBool::new(false),
            errors: Mutex::new(errors),
            safe,
        }
    }
    pub fn finish_startup(&self) {
        if let Err(error) = PackageStore::new(&self.root).clear_restart_flags() {
            self.pending.store(true, Ordering::SeqCst);
            self.error(error);
        }
    }
    /// Where a plugin's files are: its installed package, or the folder a built-in one is
    /// written to at start-up.
    fn plugin_folder(&self, plugin: &InstalledPlugin) -> PathBuf {
        if builtin::is_builtin(&plugin.manifest.id) {
            builtin::folder(&self.root.join("extensions"), &plugin.manifest.id)
        } else {
            PackageStore::new(&self.root).plugin_dir(plugin)
        }
    }
    pub fn sources(&self) -> Vec<runtime::PluginSource> {
        self.active
            .iter()
            .map(|(id, p)| runtime::PluginSource {
                id: id.clone(),
                root: self.plugin_folder(p),
            })
            .collect()
    }
    /// Active third-party plugins with their installed folders.
    pub fn active_plugins(&self) -> Vec<(model::Manifest, PathBuf)> {
        self.active
            .values()
            .map(|plugin| (plugin.manifest.clone(), self.plugin_folder(plugin)))
            .collect()
    }
    pub fn is_safe_mode(&self) -> bool {
        self.safe
    }
    pub fn restart_pending(&self) -> bool {
        self.pending.load(Ordering::SeqCst)
    }
    pub fn error_messages(&self) -> Vec<String> {
        self.errors.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
    fn plugin(&self, id: &str) -> Result<&InstalledPlugin, String> {
        self.active
            .get(id)
            .ok_or_else(|| "Plugin is not active; restart may be required".into())
    }
    fn error(&self, error: String) {
        self.errors
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(error);
    }
}

#[tauri::command]
pub fn extensions_list(app: tauri::AppHandle) -> Result<Value, String> {
    let state = app.state::<Extensions>();
    let _gate = state.gate.lock().map_err(|_| "Plugin state unavailable")?;
    let registry = PackageStore::new(&state.root).load()?;
    let plugins: Vec<_> = registry
        .plugins
        .values()
        .filter(|plugin| !builtin::is_builtin(&plugin.manifest.id))
        .map(|plugin| {
            let mut value = serde_json::to_value(&plugin.manifest).unwrap_or(json!({}));
            let object = value.as_object_mut().unwrap();
            object.insert("enabled".into(), json!(plugin.enabled));
            object.insert(
                "active".into(),
                json!(state.active.contains_key(&plugin.manifest.id)),
            );
            object.insert("pending".into(), json!(plugin.pending_restart));
            value
        })
        .collect();
    Ok(
        json!({"plugins":plugins,"restartRequired":state.pending.load(Ordering::SeqCst),"safeMode":state.safe,"errors":*state.errors.lock().map_err(|_| "Plugin errors unavailable")?}),
    )
}

#[tauri::command]
pub async fn extensions_install(
    app: tauri::AppHandle,
    approved: bool,
    review_token: Option<String>,
) -> Result<Value, String> {
    if !approved {
        // An ownerless dialog can open behind the launcher on Windows, so the user never
        // sees it. Parent it to the launcher window.
        let mut dialog = rfd::AsyncFileDialog::new().add_filter("AquaStar NEO plugin ZIP", &["zip"]);
        let parent = app.get_webview_window("main");
        if let Some(parent) = &parent {
            dialog = dialog.set_parent(parent);
        }
        let path = dialog.pick_file().await;
        let Some(path) = path else {
            return Ok(Value::Null);
        };
        let path = path.path().to_path_buf();
        let version = app.package_info().version.to_string();
        let root = app.state::<Extensions>().root.clone();
        let review_path = path.clone();
        let review = tauri::async_runtime::spawn_blocking(move || {
            PackageStore::new(&root).review(&review_path, &version)
        })
        .await
        .map_err(|e| e.to_string())??;
        if builtin::is_builtin(&review.manifest.id) {
            return Err(format!(
                "{} is built into AquaStar NEO and cannot be replaced by a package",
                review.manifest.name
            ));
        }
        static TOKEN: AtomicU64 = AtomicU64::new(1);
        let token = TOKEN.fetch_add(1, Ordering::SeqCst).to_string();
        let result = json!({"reviewToken":token,"manifest":review.manifest,"permissions":review.manifest.permissions,"origins":review.manifest.origins});
        let state = app.state::<Extensions>();
        let mut reviews = state
            .reviews
            .lock()
            .map_err(|_| "Plugin review unavailable")?;
        reviews.clear();
        reviews.insert(token, (path, review));
        return Ok(result);
    }
    let state = app.state::<Extensions>();
    let token = review_token.ok_or("Review this package first")?;
    let (path, review) = state
        .reviews
        .lock()
        .map_err(|_| "Plugin review unavailable")?
        .remove(&token)
        .ok_or("Review expired; select the ZIP again")?;
    let install_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = install_app.state::<Extensions>();
        let _gate = state.gate.lock().map_err(|_| "Plugin state unavailable")?;
        PackageStore::new(&state.root).install(&path, &review)
    })
    .await
    .map_err(|e| e.to_string())??;
    state.pending.store(true, Ordering::SeqCst);
    Ok(json!({"restartRequired":true}))
}

#[tauri::command]
pub async fn extensions_change(
    app: tauri::AppHandle,
    id: String,
    enabled: Option<bool>,
    remove: Option<bool>,
    delete_data: Option<bool>,
) -> Result<Value, String> {
    if builtin::is_builtin(&id) {
        return Err("Built-in plugins cannot be disabled or removed".into());
    }
    let state = app.state::<Extensions>();
    let _gate = state.gate.lock().map_err(|_| "Plugin state unavailable")?;
    let store = PackageStore::new(&state.root);
    if remove.unwrap_or(false) {
        store.uninstall(&id, delete_data.unwrap_or(false))?;
    } else {
        store.set_enabled(&id, enabled.ok_or("Missing enabled state")?)?;
    }
    state.pending.store(true, Ordering::SeqCst);
    Ok(json!({"restartRequired":true}))
}

#[tauri::command]
pub fn extensions_restart(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
pub async fn extensions_action(
    app: tauri::AppHandle,
    plugin_id: String,
    action_id: String,
    engine: Option<crate::Engine>,
) -> Result<Value, String> {
    run_action(&app, &plugin_id, &action_id, engine).await
}

pub async fn dispatch_extension(
    app: tauri::AppHandle,
    plugin_id: String,
    method: String,
    args: Value,
) -> Result<Value, String> {
    let state = app.state::<Extensions>();
    let plugin = state.plugin(&plugin_id)?;
    let permissions = &plugin.manifest.permissions;
    let require = |permission: &str| {
        if permissions.iter().any(|p| p == permission) {
            Ok(())
        } else {
            Err(format!("Permission required: {permission}"))
        }
    };
    match method.as_str() {
        "host.info" => Ok(
            json!({"version":app.package_info().version.to_string(),"apiVersion":1,"pluginId":plugin_id}),
        ),
        "actions.run" => {
            run_action(
                &app,
                &plugin_id,
                args.get("actionId")
                    .and_then(Value::as_str)
                    .ok_or("Missing actionId")?,
                None,
            )
            .await
        }
        "net.fetch" => {
            require("network")?;
            let url = args
                .get("url")
                .and_then(Value::as_str)
                .ok_or("Missing URL")?
                .to_string();
            let origins = plugin.manifest.origins.clone();
            tauri::async_runtime::spawn_blocking(move || network::fetch(&url, &origins))
                .await
                .map_err(|e| e.to_string())?
        }
        "storage.get" | "storage.set" | "storage.remove" => {
            require("storage")?;
            let key = args
                .get("key")
                .and_then(Value::as_str)
                .filter(|key| !key.is_empty() && key.len() <= 128)
                .ok_or("Invalid storage key")?;
            let _gate = state.gate.lock().map_err(|_| "Storage unavailable")?;
            let dir = PackageStore::new(&state.root).data_dir(&plugin_id);
            storage::operation(
                &dir,
                &method,
                key,
                args.get("value").cloned().unwrap_or(Value::Null),
            )
        }
        _ => Err("Unknown plugin operation".into()),
    }
}

async fn run_action(
    app: &tauri::AppHandle,
    id: &str,
    action_id: &str,
    engine: Option<crate::Engine>,
) -> Result<Value, String> {
    let state = app.state::<Extensions>();
    let plugin = state.plugin(id)?;
    let manifest = &plugin.manifest;
    let action = manifest
        .actions
        .iter()
        .find(|action| action.id == action_id)
        .ok_or("Unknown plugin action")?;
    match action.kind.as_str() {
        "tool" => {
            let tool = manifest
                .tools
                .iter()
                .find(|tool| tool.id == action.target)
                .ok_or("Unknown tool")?;
            runtime::open_tool(app, id, &tool.id, &state.plugin_folder(plugin), &tool.entry)?;
            Ok(Value::Null)
        }
        "link" => {
            if !manifest.permissions.iter().any(|p| p == "links") {
                return Err("Permission required: links".into());
            }
            let link = manifest
                .links
                .iter()
                .find(|link| link.id == action.target)
                .ok_or("Unknown link")?;
            let url = link.url.clone();
            tauri::async_runtime::spawn_blocking(move || open_external(&url))
                .await
                .map_err(|e| e.to_string())??;
            Ok(Value::Null)
        }
        "game" => {
            if !manifest.permissions.iter().any(|p| p == "launch") {
                return Err("Permission required: launch".into());
            }
            let game = manifest
                .games
                .iter()
                .find(|game| game.id == action.target)
                .ok_or("Unknown game")?;
            let source = if let Some(url) = &game.url {
                url.clone()
            } else {
                state
                    .plugin_folder(plugin)
                    .join(game.file.as_ref().ok_or("Missing SWF")?)
                    .display()
                    .to_string()
            };
            crate::play_extension(
                app.clone(),
                source,
                engine
                    .unwrap_or_else(|| crate::Engine::preferred().unwrap_or(crate::Engine::Ruffle)),
            )
            .await
            .map(Value::String)
        }
        _ => Err("Unknown action kind".into()),
    }
}

pub(crate) fn open_external(url: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    let result = std::process::Command::new("xdg-open").arg(url).status();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(url).status();
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("rundll32.exe")
        .arg("url.dll,FileProtocolHandler")
        .arg(url)
        .status();
    result.map_err(|e| e.to_string()).and_then(|status| {
        if status.success() {
            Ok(())
        } else {
            Err("Could not open the default browser".into())
        }
    })
}

pub fn install_contributions(app: &tauri::AppHandle) {
    use tauri::menu::{MenuItem, Submenu};
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let state = app.state::<Extensions>();
    let Ok(menu) = Submenu::new(app, "Plugins", true) else {
        return;
    };
    for (id, plugin) in &state.active {
        for item in &plugin.manifest.menus {
            let Some(action) = plugin.manifest.actions.iter().find(|a| a.id == item.action) else {
                continue;
            };
            let key = format!("extension:{id}:{}", action.id);
            let accelerator = plugin
                .manifest
                .shortcuts
                .iter()
                .find(|shortcut| shortcut.action == action.id)
                .map(|shortcut| shortcut.accelerator.trim())
                .filter(|accelerator| !accelerator.is_empty());
            if let Ok(item) = MenuItem::with_id(
                app,
                &key,
                format!("{} · {}", plugin.manifest.name, action.name),
                true,
                accelerator,
            ) {
                let _ = menu.append(&item);
            }
        }
        for shortcut in &plugin.manifest.shortcuts {
            let Some(parsed) = crate::profile::parse_accelerator(&shortcut.accelerator) else {
                state.error(format!("{id}: invalid shortcut {}", shortcut.accelerator));
                continue;
            };
            let Some(key) = crate::shortcut_from(&parsed) else {
                continue;
            };
            let binding = format!("extension:{id}:{}", shortcut.action);
            let book = app.state::<crate::ShortcutBook>();
            let mut map = book.0.lock().unwrap_or_else(|e| e.into_inner());
            if map.get(&key) == Some(&binding) {
                continue;
            }
            if map.contains_key(&key) {
                state.error(format!(
                    "{id}: shortcut {} is already reserved",
                    shortcut.accelerator
                ));
                continue;
            }
            match app.global_shortcut().register(key) {
                Ok(()) => {
                    map.insert(key, binding);
                }
                Err(error) => {
                    state.error(format!("{id}: shortcut {}: {error}", shortcut.accelerator))
                }
            }
        }
    }
    if !state.active.is_empty() {
        if let Some(root) = app.menu() {
            let _ = root.append(&menu);
        }
    }
}

pub fn dispatch_action(app: &tauri::AppHandle, id: &str) -> bool {
    let Some(rest) = id.strip_prefix("extension:") else {
        return false;
    };
    let Some((plugin, action)) = rest.split_once(':') else {
        return true;
    };
    let (app, plugin, action) = (app.clone(), plugin.to_string(), action.to_string());
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_action(&app, &plugin, &action, None).await {
            app.state::<Extensions>().error(error);
        }
    });
    true
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;
    use std::{fs, io::Write};

    #[test]
    fn a_built_in_plugin_is_active_and_wins_over_an_installed_copy() {
        let root = std::env::temp_dir().join(format!(
            "aquastar-builtin-wins-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let archive = root.join("copy.zip");
        let mut zip = zip::ZipWriter::new(fs::File::create(&archive).unwrap());
        zip.start_file("plugin.json", zip::write::SimpleFileOptions::default()).unwrap();
        zip.write_all(br#"{"format":"aquastar-desktop-plugin","apiVersion":1,"id":"example-companion","name":"Old copy","version":"0.0.1"}"#)
            .unwrap();
        zip.finish().unwrap();
        let store = PackageStore::new(&root);
        let review = store.review(&archive, env!("CARGO_PKG_VERSION")).unwrap();
        store.install(&archive, &review).unwrap();

        let loaded = Extensions::load(root.clone());
        let plugin = loaded.active.get("example-companion").expect("built-in plugin is active");
        assert_eq!(plugin.manifest.name, "Example Companion", "the installed copy is ignored");
        let folder = loaded.plugin_folder(plugin);
        assert_eq!(folder, builtin::folder(&root.join("extensions"), "example-companion"));
        assert!(folder.join("plugin.json").is_file());
        let sources = loaded.sources();
        assert!(sources.iter().any(|source| source.id == "example-companion" && source.root == folder));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn loading_a_second_instance_defers_cleanup_until_primary_startup() {
        let root = std::env::temp_dir().join(format!(
            "aquastar-plugin-lifecycle-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let archive = root.join("example.zip");
        let mut zip = zip::ZipWriter::new(fs::File::create(&archive).unwrap());
        zip.start_file("plugin.json", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(br#"{"format":"aquastar-desktop-plugin","apiVersion":1,"id":"example","name":"Example","version":"1.0.0","permissions":["storage"]}"#)
            .unwrap();
        zip.finish().unwrap();
        let store = PackageStore::new(&root);
        let review = store.review(&archive, env!("CARGO_PKG_VERSION")).unwrap();
        let installed = store.install(&archive, &review).unwrap();
        let code = store.plugin_dir(&installed);
        let data = store.data_dir("example");
        fs::create_dir_all(&data).unwrap();
        fs::write(
            data.join("storage.json"),
            b"{\"note\":\"keep until restart\"}",
        )
        .unwrap();
        store.uninstall("example", true).unwrap();
        let registry_before = fs::read(root.join("extensions/registry.json")).unwrap();

        let next_instance = Extensions::load(root.clone());
        assert!(next_instance.active.keys().all(|id| builtin::is_builtin(id)));
        assert!(code.join("plugin.json").exists());
        assert!(data.join("storage.json").exists());
        assert_eq!(
            fs::read(root.join("extensions/registry.json")).unwrap(),
            registry_before
        );

        next_instance.finish_startup();
        assert!(!code.exists());
        assert!(!data.exists());
        assert!(store.load().unwrap().pending_data_removals.is_empty());
        fs::remove_dir_all(root).unwrap();
    }
}
