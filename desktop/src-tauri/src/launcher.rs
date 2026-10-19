//! What the launcher shows. Every plugin (the bundled AQW plugin and the installed desktop
//! plugins) is turned into one JSON description: its games with the players available on
//! this platform, its tools, links and searches, and the layout it asked for. The launcher
//! only renders this data and calls back with ids; plugin code never runs in the launcher.

use std::path::Path;
use std::sync::OnceLock;

use serde_json::{json, Value};
use tauri::Manager;

use crate::extensions::model::{Block, EngineSpec, Game, Manifest};
use crate::extensions::{self, Extensions};
use crate::players::{Arch, Engine, MovieKind, Os};

pub const BUNDLED_ID: &str = "adventure-quest-worlds";
const BUNDLED_JSON: &str = include_str!("../../plugins/adventure-quest-worlds/plugin.json");
const ICON_LIMIT: u64 = 64 * 1024;

pub fn bundled() -> &'static Manifest {
    static BUNDLED: OnceLock<Manifest> = OnceLock::new();
    BUNDLED.get_or_init(|| {
        let manifest: Manifest = serde_json::from_str(BUNDLED_JSON).expect("bundled plugin manifest");
        manifest
            .validate_bundled(env!("CARGO_PKG_VERSION"))
            .expect("bundled plugin manifest is valid");
        manifest
    })
}

fn spec_matches(spec: &EngineSpec, os: Option<Os>, arch: Option<Arch>) -> bool {
    let os_ok = spec.platforms.is_empty()
        || os.is_some_and(|os| spec.platforms.iter().any(|name| name == os.as_str()));
    let arch_ok = spec.arch.is_empty()
        || arch.is_some_and(|arch| spec.arch.iter().any(|name| name == arch.as_str()));
    os_ok && arch_ok
}

/// Players a game may use here: what the plugin allows for this platform, narrowed to the
/// players AquaStar actually ships for it. Order is the plugin's order.
pub fn effective_engines(game: &Game, os: Option<Os>, arch: Option<Arch>) -> Vec<Engine> {
    let (Some(os), Some(arch)) = (os, arch) else {
        return Vec::new();
    };
    let wanted: Vec<Engine> = if game.engines.is_empty() {
        Engine::ALL.to_vec()
    } else {
        game.engines
            .iter()
            .filter(|spec| spec_matches(spec, Some(os), Some(arch)))
            .filter_map(|spec| Engine::from_id(&spec.engine))
            .collect()
    };
    let mut engines = Vec::new();
    for engine in wanted {
        if engine.supported_on(os, arch) && !engines.contains(&engine) {
            engines.push(engine);
        }
    }
    engines
}

/// The plugin's own default if it is available here, then AquaStar's preferred player,
/// then the first one on the list.
pub fn default_engine(game: &Game, os: Option<Os>, arch: Option<Arch>, available: &[Engine]) -> Option<Engine> {
    let flagged = game
        .engines
        .iter()
        .filter(|spec| spec.default && spec_matches(spec, os, arch))
        .filter_map(|spec| Engine::from_id(&spec.engine))
        .find(|engine| available.contains(engine));
    flagged
        .or_else(|| match (os, arch) {
            (Some(os), Some(arch)) => Engine::preferred_for(os, arch).filter(|e| available.contains(e)),
            _ => None,
        })
        .or_else(|| available.first().copied())
}

fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (u32::from(chunk[0]) << 16)
            | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8)
            | u32::from(*chunk.get(2).unwrap_or(&0));
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { TABLE[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[n as usize & 63] as char } else { '=' });
    }
    out
}

/// An icon from the plugin's own package as a data URI, or `None` when it is missing,
/// outside the package or larger than 64 KB. The launcher never loads plugin files itself.
fn icon_uri(root: Option<&Path>, relative: Option<&String>) -> Value {
    let (Some(root), Some(relative)) = (root, relative) else {
        return Value::Null;
    };
    let Ok(root) = root.canonicalize() else {
        return Value::Null;
    };
    let Ok(path) = extensions::runtime::asset_path(&root, relative) else {
        return Value::Null;
    };
    match std::fs::metadata(&path) {
        Ok(meta) if meta.len() <= ICON_LIMIT => {}
        _ => return Value::Null,
    }
    let kind = extensions::runtime::content_type(&path);
    if kind != "image/png" && kind != "image/svg+xml" {
        return Value::Null;
    }
    match std::fs::read(&path) {
        Ok(bytes) => Value::String(format!("data:{kind};base64,{}", base64(&bytes))),
        Err(_) => Value::Null,
    }
}

fn action_for<'a>(manifest: &'a Manifest, kind: &str, target: &str) -> Option<&'a str> {
    manifest
        .actions
        .iter()
        .find(|action| action.kind == kind && action.target == target)
        .map(|action| action.id.as_str())
}

pub struct Source<'a> {
    pub manifest: &'a Manifest,
    pub root: Option<&'a Path>,
    pub bundled: bool,
    /// Shipped inside AquaStar and not removable, but run like an installed plugin.
    pub built_in: bool,
}

pub struct Context<'a> {
    pub os: Option<Os>,
    pub arch: Option<Arch>,
    /// Saved player for `<plugin>/<game>`.
    pub saved_engine: &'a dyn Fn(&str) -> Option<String>,
    /// `manifest::shell_pages` for the bundled plugin's `menu:useful` blocks.
    pub useful_pages: &'a Value,
}

fn game_view(source: &Source, game: &Game, ctx: &Context) -> Value {
    let manifest = source.manifest;
    let available = effective_engines(game, ctx.os, ctx.arch);
    let default = default_engine(game, ctx.os, ctx.arch, &available);
    let saved = (ctx.saved_engine)(&format!("{}/{}", manifest.id, game.id))
        .and_then(|id| Engine::from_id(&id))
        .filter(|engine| available.contains(engine));
    let action = if source.bundled { None } else { action_for(manifest, "game", &game.id) };
    let launchable = !available.is_empty() && (source.bundled || action.is_some());
    json!({
        "id": game.id,
        "name": game.name,
        "description": game.description,
        "icon": icon_uri(source.root, game.icon.as_ref()),
        "launchable": launchable,
        "actionId": action,
        "engines": available.iter().map(|e| e.id()).collect::<Vec<_>>(),
        "defaultEngine": default.map(|e| e.id()),
        "selectedEngine": saved.or(default).map(|e| e.id()),
    })
}

fn pick<'a, T>(items: &'a [T], wanted: &[String], id: impl Fn(&T) -> &str) -> Vec<&'a T> {
    if wanted.is_empty() {
        items.iter().collect()
    } else {
        wanted
            .iter()
            .filter_map(|name| items.iter().find(|item| id(item) == name))
            .collect()
    }
}

fn link_groups(source: &Source, wanted: &[String]) -> Vec<Value> {
    let manifest = source.manifest;
    let mut groups: Vec<(Option<String>, Vec<Value>)> = Vec::new();
    for link in pick(&manifest.links, wanted, |link| link.id.as_str()) {
        let view = json!({
            "id": link.id,
            "name": link.name,
            "url": link.url,
            "kind": "external",
            "actionId": action_for(manifest, "link", &link.id),
        });
        match groups.iter_mut().find(|(label, _)| *label == link.group) {
            Some((_, links)) => links.push(view),
            None => groups.push((link.group.clone(), vec![view])),
        }
    }
    groups
        .into_iter()
        .map(|(label, links)| json!({ "label": label, "links": links }))
        .collect()
}

fn useful_groups(pages: &Value) -> Vec<Value> {
    pages
        .get("groups")
        .and_then(Value::as_array)
        .map(|groups| {
            groups
                .iter()
                .map(|group| {
                    let links: Vec<Value> = group
                        .get("pages")
                        .and_then(Value::as_array)
                        .map(|pages| {
                            pages
                                .iter()
                                .map(|page| {
                                    json!({
                                        "id": page.get("id"),
                                        "name": page.get("label"),
                                        "url": page.get("url"),
                                        "kind": "site",
                                        "actionId": Value::Null,
                                    })
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    json!({ "label": group.get("label").cloned().unwrap_or(Value::Null), "links": links })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn block_view(source: &Source, block: &Block, ctx: &Context) -> Option<Value> {
    let manifest = source.manifest;
    let (key, content) = match block.kind.as_str() {
        "games" => {
            let games: Vec<Value> = pick(&manifest.games, &block.items, |g| g.id.as_str())
                .into_iter()
                .map(|game| game_view(source, game, ctx))
                .collect();
            ("games", Value::Array(games))
        }
        "tools" => {
            let tools: Vec<Value> = pick(&manifest.tools, &block.items, |t| t.id.as_str())
                .into_iter()
                .map(|tool| {
                    json!({
                        "id": tool.id,
                        "name": tool.name,
                        "builtin": tool.builtin,
                        "actionId": action_for(manifest, "tool", &tool.id),
                    })
                })
                .collect();
            ("tools", Value::Array(tools))
        }
        "links" => {
            let groups = if source.bundled && block.source.as_deref() == Some("menu:useful") {
                useful_groups(ctx.useful_pages)
            } else {
                link_groups(source, &block.items)
            };
            ("groups", Value::Array(groups))
        }
        _ => {
            let searches: Vec<Value> = pick(&manifest.searches, &block.items, |s| s.id.as_str())
                .into_iter()
                .map(|s| json!({ "id": s.id, "name": s.name, "placeholder": s.placeholder }))
                .collect();
            ("searches", Value::Array(searches))
        }
    };
    if content.as_array().is_some_and(Vec::is_empty) {
        return None;
    }
    let mut view = json!({ "type": block.kind, "title": block.title });
    view[key] = content;
    Some(view)
}

fn default_blocks(manifest: &Manifest) -> Vec<Block> {
    [("games", None), ("tools", Some("Tools")), ("links", Some("Links")), ("search", Some("Search"))]
        .into_iter()
        .map(|(kind, title)| Block {
            kind: kind.into(),
            title: title.map(str::to_string),
            items: Vec::new(),
            source: None,
        })
        .filter(|block| match block.kind.as_str() {
            "games" => !manifest.games.is_empty(),
            "tools" => !manifest.tools.is_empty(),
            "links" => !manifest.links.is_empty(),
            _ => !manifest.searches.is_empty(),
        })
        .collect()
}

pub fn plugin_view(source: &Source, ctx: &Context) -> Value {
    let manifest = source.manifest;
    let blocks = match &manifest.launcher {
        Some(launcher) => launcher.blocks.clone(),
        None => default_blocks(manifest),
    };
    json!({
        "id": manifest.id,
        "name": manifest.name,
        "version": manifest.version,
        "description": manifest.description,
        "bundled": source.bundled,
        "builtIn": source.bundled || source.built_in,
        "icon": icon_uri(source.root, manifest.icon.as_ref()),
        "blocks": blocks.iter().filter_map(|block| block_view(source, block, ctx)).collect::<Vec<_>>(),
    })
}

fn config_dir(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok()
}

#[tauri::command]
pub async fn launcher_model(app: tauri::AppHandle) -> Result<Value, String> {
    let lang = crate::current_language();
    let useful = crate::manifest::shell_pages(lang.as_str());
    let dir = config_dir(&app);
    let saved = |key: &str| dir.as_deref().and_then(|dir| crate::ruffle::load_game_engine(dir, key));
    let (os, arch) = (Os::host(), Arch::host());
    let ctx = Context { os, arch, saved_engine: &saved, useful_pages: &useful };
    let state = app.state::<Extensions>();
    let mut plugins = vec![plugin_view(
        &Source { manifest: bundled(), root: None, bundled: true, built_in: false },
        &ctx,
    )];
    for (manifest, root) in state.active_plugins() {
        let built_in = extensions::builtin::is_builtin(&manifest.id);
        plugins.push(plugin_view(&Source { manifest: &manifest, root: Some(&root), bundled: false, built_in }, &ctx));
    }
    Ok(json!({
        "platform": { "os": os.map(|o| o.as_str()), "arch": arch.map(|a| a.as_str()) },
        "restartRequired": state.restart_pending(),
        "safeMode": state.is_safe_mode(),
        "errors": state.error_messages(),
        "plugins": plugins,
    }))
}

fn movie_for(resolver: &str) -> Option<MovieKind> {
    match resolver {
        "aqw-primary" => Some(MovieKind::Primary),
        "dragonfable" => Some(MovieKind::DragonFable),
        _ => None,
    }
}

fn manifest_for(app: &tauri::AppHandle, plugin_id: &str) -> Result<(Manifest, bool), String> {
    if plugin_id == BUNDLED_ID {
        return Ok((bundled().clone(), true));
    }
    app.state::<Extensions>()
        .active_plugins()
        .into_iter()
        .map(|(manifest, _)| manifest)
        .find(|manifest| manifest.id == plugin_id)
        .map(|manifest| (manifest, false))
        .ok_or_else(|| "Plugin is not active; restart may be required".to_string())
}

#[tauri::command]
pub async fn play_game(
    app: tauri::AppHandle,
    plugin_id: String,
    game_id: String,
    engine: Engine,
) -> Result<String, String> {
    let (manifest, is_bundled) = manifest_for(&app, &plugin_id)?;
    let game = manifest
        .games
        .iter()
        .find(|game| game.id == game_id)
        .ok_or("Unknown game")?;
    let available = effective_engines(game, Os::host(), Arch::host());
    if !available.contains(&engine) {
        return Err(format!("{} is not available for {} on this system", engine.id(), game.name));
    }
    if let Some(dir) = config_dir(&app) {
        let _ = crate::ruffle::save_game_engine(&dir, &format!("{plugin_id}/{game_id}"), engine.id());
    }
    if is_bundled {
        let movie = game
            .resolver
            .as_deref()
            .and_then(movie_for)
            .ok_or("This game has no movie resolver")?;
        return crate::play(app, engine, movie).await;
    }
    let action = action_for(&manifest, "game", &game_id).ok_or("No launcher action is declared for this game")?;
    match extensions::extensions_action(app, plugin_id, action.to_string(), Some(engine)).await? {
        Value::String(message) => Ok(message),
        _ => Ok(format!("Opening {}…", game.name)),
    }
}

#[tauri::command]
pub async fn launcher_search(
    app: tauri::AppHandle,
    plugin_id: String,
    search_id: String,
    query: String,
) -> Result<(), String> {
    let (manifest, is_bundled) = manifest_for(&app, &plugin_id)?;
    let search = manifest
        .searches
        .iter()
        .find(|search| search.id == search_id)
        .ok_or("Unknown search")?;
    let url = search.url_for(&query).ok_or("Enter something to search for")?;
    if is_bundled {
        return crate::open_site(app, search.id.clone(), url, Some(search.name.clone())).await;
    }
    if !manifest.permissions.iter().any(|permission| permission == "links") {
        return Err("Permission required: links".into());
    }
    tauri::async_runtime::spawn_blocking(move || extensions::open_external(&url))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const PLATFORMS: [(Os, Arch); 8] = [
        (Os::Windows, Arch::X86_64),
        (Os::Windows, Arch::X86),
        (Os::Windows, Arch::Aarch64),
        (Os::Linux, Arch::X86_64),
        (Os::Linux, Arch::X86),
        (Os::Linux, Arch::Aarch64),
        (Os::Macos, Arch::X86_64),
        (Os::Macos, Arch::Aarch64),
    ];

    fn third_party(json: &str) -> Manifest {
        let manifest: Manifest = serde_json::from_str(json).unwrap();
        manifest.validate("3.0.0").unwrap();
        manifest
    }

    fn context<'a>(os: Os, arch: Arch, useful: &'a Value, saved: &'a dyn Fn(&str) -> Option<String>) -> Context<'a> {
        Context { os: Some(os), arch: Some(arch), saved_engine: saved, useful_pages: useful }
    }

    #[test]
    fn bundled_plugin_declares_the_aqw_launcher() {
        let manifest = bundled();
        assert_eq!(manifest.id, BUNDLED_ID);
        let games: Vec<_> = manifest.games.iter().map(|g| g.id.as_str()).collect();
        assert_eq!(games, ["aqw", "dragonfable"]);
        let tools: Vec<_> = manifest.tools.iter().filter_map(|t| t.builtin.as_deref()).collect();
        assert_eq!(tools, ["inventory", "reminders", "todo", "strategy"]);
        for tool in tools {
            assert!(crate::profile::tool_spec(tool).is_some(), "{tool} has no window");
        }
        for game in &manifest.games {
            assert!(movie_for(game.resolver.as_deref().unwrap()).is_some());
        }
    }

    #[test]
    fn a_game_without_engines_gets_every_player_this_platform_ships() {
        let manifest = third_party(
            r#"{"format":"aquastar-desktop-plugin","apiVersion":2,"id":"demo","name":"Demo","version":"1.0.0",
            "permissions":["launch"],"games":[{"id":"g","name":"G","url":"https://example.com/g.swf"}]}"#,
        );
        let game = &manifest.games[0];
        for (os, arch) in PLATFORMS {
            let expected: Vec<Engine> = Engine::ALL.into_iter().filter(|e| e.supported_on(os, arch)).collect();
            assert_eq!(effective_engines(game, Some(os), Some(arch)), expected, "{os:?} {arch:?}");
        }
        assert!(effective_engines(game, None, None).is_empty());
    }

    #[test]
    fn plugin_engine_lists_are_narrowed_by_platform_and_by_what_ships() {
        let manifest = third_party(
            r#"{"format":"aquastar-desktop-plugin","apiVersion":2,"id":"demo","name":"Demo","version":"1.0.0",
            "permissions":["launch"],"games":[{"id":"g","name":"G","url":"https://example.com/g.swf",
            "engines":[{"engine":"flash","platforms":["windows"]},{"engine":"ruffle","default":true}]}]}"#,
        );
        let game = &manifest.games[0];
        let windows = effective_engines(game, Some(Os::Windows), Some(Arch::X86_64));
        assert_eq!(windows, [Engine::Flash, Engine::Ruffle]);
        assert_eq!(
            default_engine(game, Some(Os::Windows), Some(Arch::X86_64), &windows),
            Some(Engine::Ruffle)
        );
        let mac = effective_engines(game, Some(Os::Macos), Some(Arch::Aarch64));
        assert_eq!(mac, [Engine::Ruffle]);
        assert_eq!(default_engine(game, Some(Os::Macos), Some(Arch::Aarch64), &mac), Some(Engine::Ruffle));
    }

    #[test]
    fn the_default_falls_back_to_the_preferred_player_then_the_first() {
        let manifest = third_party(
            r#"{"format":"aquastar-desktop-plugin","apiVersion":2,"id":"demo","name":"Demo","version":"1.0.0",
            "permissions":["launch"],"games":[{"id":"g","name":"G","url":"https://example.com/g.swf"}]}"#,
        );
        let game = &manifest.games[0];
        let all = [Engine::Flash, Engine::Ruffle];
        assert_eq!(
            default_engine(game, Some(Os::Windows), Some(Arch::X86_64), &all),
            Engine::preferred_for(Os::Windows, Arch::X86_64)
        );
        assert_eq!(default_engine(game, None, None, &all), Some(Engine::Flash));
        assert_eq!(default_engine(game, None, None, &[]), None);
    }

    #[test]
    fn the_bundled_view_lists_games_tools_searches_and_the_useful_pages() {
        let useful = json!({"groups":[{"id":"top","label":null,"pages":[{"id":"wiki","label":"Wiki","url":"https://aqwwiki.wikidot.com/"}]}]});
        let saved = |key: &str| (key == "adventure-quest-worlds/aqw").then(|| "flash".to_string());
        let ctx = context(Os::Windows, Arch::X86_64, &useful, &saved);
        let view = plugin_view(&Source { manifest: bundled(), root: None, bundled: true, built_in: false }, &ctx);
        let blocks = view["blocks"].as_array().unwrap();
        let kinds: Vec<_> = blocks.iter().map(|b| b["type"].as_str().unwrap()).collect();
        assert_eq!(kinds, ["games", "tools", "search", "links", "search"]);
        let games = blocks[0]["games"].as_array().unwrap();
        assert_eq!(games.len(), 2);
        assert_eq!(games[0]["engines"], json!(["ruffle", "flash"]));
        assert_eq!(games[0]["selectedEngine"], "flash");
        assert_eq!(games[1]["selectedEngine"], "ruffle");
        assert_eq!(games[0]["launchable"], true);
        assert_eq!(blocks[1]["tools"].as_array().unwrap().len(), 4);
        assert_eq!(blocks[3]["groups"][0]["links"][0]["kind"], "site");
        assert_eq!(blocks[4]["searches"][0]["id"], "charpage");
    }

    #[test]
    fn a_saved_player_that_is_not_available_is_ignored() {
        let useful = json!({});
        let saved = |_: &str| Some("not-a-player".to_string());
        let ctx = context(Os::Macos, Arch::Aarch64, &useful, &saved);
        let view = plugin_view(&Source { manifest: bundled(), root: None, bundled: true, built_in: false }, &ctx);
        let game = &view["blocks"][0]["games"][0];
        assert_eq!(game["selectedEngine"], game["defaultEngine"]);
    }

    #[test]
    fn a_plugin_without_a_layout_gets_the_default_one_and_unlaunchable_games_say_so() {
        let manifest = third_party(
            r#"{"format":"aquastar-desktop-plugin","apiVersion":1,"id":"demo","name":"Demo","version":"1.0.0",
            "permissions":["launch","links"],
            "games":[{"id":"g","name":"G","url":"https://example.com/g.swf"},{"id":"h","name":"H","url":"https://example.com/h.swf"}],
            "links":[{"id":"l","name":"L","url":"https://example.com/"}],
            "actions":[{"id":"play-g","name":"Play G","kind":"game","target":"g"}]}"#,
        );
        let useful = json!({});
        let saved = |_: &str| None;
        let ctx = context(Os::Linux, Arch::X86_64, &useful, &saved);
        let view = plugin_view(&Source { manifest: &manifest, root: None, bundled: false, built_in: false }, &ctx);
        let blocks = view["blocks"].as_array().unwrap();
        assert_eq!(blocks.iter().map(|b| b["type"].as_str().unwrap()).collect::<Vec<_>>(), ["games", "links"]);
        let games = blocks[0]["games"].as_array().unwrap();
        assert_eq!(games[0]["launchable"], true);
        assert_eq!(games[0]["actionId"], "play-g");
        assert_eq!(games[1]["launchable"], false);
        assert_eq!(blocks[1]["groups"][0]["links"][0]["kind"], "external");
    }

    #[test]
    fn icons_come_from_inside_the_package_and_are_size_limited() {
        let root = std::env::temp_dir().join(format!("aquastar-icons-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("img")).unwrap();
        std::fs::write(root.join("img/small.png"), [0x89, b'P', b'N', b'G']).unwrap();
        std::fs::write(root.join("img/big.png"), vec![0u8; 70 * 1024]).unwrap();
        std::fs::write(root.join("img/script.js"), b"alert(1)").unwrap();
        let uri = icon_uri(Some(&root), Some(&"img/small.png".to_string()));
        assert_eq!(uri, "data:image/png;base64,iVBORw==");
        assert_eq!(icon_uri(Some(&root), Some(&"img/big.png".to_string())), Value::Null);
        assert_eq!(icon_uri(Some(&root), Some(&"img/script.js".to_string())), Value::Null);
        assert_eq!(icon_uri(Some(&root), Some(&"../outside.png".to_string())), Value::Null);
        assert_eq!(icon_uri(None, Some(&"img/small.png".to_string())), Value::Null);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn base64_matches_the_reference_vectors() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }
}
