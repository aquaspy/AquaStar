use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Deserialize;

use crate::placement::ProfilePaths;

const LOADER4: &str = "https://game.aq.com/game/gamefiles/Loader4.swf?ver=b";
const LOADER_SPIDER: &str = "https://game.aq.com/game/gamefiles/Loader_Spider.swf";
const DF_LOADER: &str = "https://play.dragonfable.com/game/DFLoader.swf?ver=668201";
const LAUNCHER_PAGE: &str = "https://www.artix.com/gamelauncher";
const PLUGIN_ID: &str = "adventure-quest-worlds";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MovieKind {
    Primary,
    Testing,
    DragonFable,
}

pub(super) struct Movie {
    source: MovieSource,
}

enum MovieSource {
    File(PathBuf),
    Https(String),
}

impl Movie {
    pub(super) fn file(path: PathBuf) -> Self {
        Self {
            source: MovieSource::File(path),
        }
    }

    pub(super) fn https(url: impl Into<String>) -> Self {
        Self {
            source: MovieSource::Https(url.into()),
        }
    }

    pub(super) fn player_arg(&self) -> String {
        match &self.source {
            MovieSource::File(path) => path.display().to_string(),
            MovieSource::Https(url) => url.clone(),
        }
    }
}

struct MovieFacts {
    custom_swf: Option<PathBuf>,
    custom_url: Option<String>,
    live_loader: bool,
    shell_loader: Option<String>,
    electron_loader: Option<String>,
}

pub(super) fn resolve(paths: &ProfilePaths, kind: MovieKind) -> Movie {
    let facts = load_facts(paths);
    decide(kind, &facts, testing_ver().clamp(100, 999))
}

fn testing_ver() -> u16 {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.subsec_nanos())
        .unwrap_or(0);
    100 + (nanos % 900) as u16
}

fn decide(kind: MovieKind, facts: &MovieFacts, testing_ver: u16) -> Movie {
    match kind {
        MovieKind::Testing => Movie::https(format!("{LOADER_SPIDER}?ver={testing_ver}")),
        MovieKind::DragonFable => Movie::https(DF_LOADER),
        MovieKind::Primary => decide_primary(facts),
    }
}

fn decide_primary(facts: &MovieFacts) -> Movie {
    if let Some(path) = &facts.custom_swf {
        return Movie::file(path.clone());
    }
    if let Some(url) = &facts.custom_url {
        if https_swf(url) {
            return Movie::https(url.clone());
        }
    }
    if facts.live_loader {
        if let Some(url) = facts.shell_loader.as_deref().filter(|url| loader_ok(url)) {
            return Movie::https(url);
        }
        if let Some(url) = facts
            .electron_loader
            .as_deref()
            .filter(|url| loader_ok(url))
        {
            return Movie::https(url);
        }
    }
    Movie::https(LOADER4)
}

fn load_facts(paths: &ProfilePaths) -> MovieFacts {
    let mut top = serde_json::Map::new();
    let mut plugins = None;
    for path in &paths.settings_files {
        let Ok(text) = fs::read_to_string(path) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        let Some(obj) = value.as_object() else {
            continue;
        };
        if obj
            .get("plugins")
            .is_some_and(|block| block.is_object())
        {
            plugins = obj.get("plugins").cloned();
        }
        for (key, value) in obj {
            top.insert(key.clone(), value.clone());
        }
    }
    let custom_url = top
        .get("customUrl")
        .and_then(|value| value.as_str())
        .filter(|url| https_swf(url))
        .map(str::to_string);
    let live_loader = plugin_live(plugins.as_ref())
        .or_else(|| {
            top.get("liveLoaderUrl")
                .and_then(|value| value.as_bool())
        })
        .unwrap_or(true);
    MovieFacts {
        custom_swf: paths.swf_candidates.iter().find(|path| path.is_file()).cloned(),
        custom_url,
        live_loader,
        shell_loader: cached_loader(&paths.shell_cache),
        electron_loader: cached_loader(&paths.electron_loader_cache),
    }
}

fn plugin_live(plugins: Option<&serde_json::Value>) -> Option<bool> {
    plugins?
        .get(PLUGIN_ID)?
        .get("liveLoaderUrl")?
        .as_bool()
}

fn cached_loader(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let url = value.get("loaderUrl")?.as_str()?;
    loader_ok(url).then(|| url.to_string())
}

fn https_swf(url: &str) -> bool {
    if url.len() >= 200 || !url.starts_with("https://") {
        return false;
    }
    let path = url.split('?').next().unwrap_or(url);
    match path.rsplit('/').next() {
        Some(name) if name.len() > 4 && name.ends_with(".swf") => true,
        _ => false,
    }
}

fn loader_ok(candidate: &str) -> bool {
    if candidate.len() >= 200 {
        return false;
    }
    let Some(rest) = candidate.strip_prefix("https://game.aq.com/game/gamefiles/Loader") else {
        return false;
    };
    let (name, query) = match rest.split_once('?') {
        Some((name, query)) => (name, Some(query)),
        None => (rest, None),
    };
    let Some(stem) = name.strip_suffix(".swf") else {
        return false;
    };
    if !stem
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
    {
        return false;
    }
    query.is_none_or(|query| {
        query
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '=' | '&' | '.' | '-'))
    })
}

pub(super) fn refresh(paths: &ProfilePaths) -> Result<(), String> {
    let facts = load_facts(paths);
    if !should_refresh(&facts) {
        return Ok(());
    }
    let url = fetch_loader()?;
    write_loader_cache(&paths.shell_cache, &url)
}

fn should_refresh(facts: &MovieFacts) -> bool {
    if !facts.live_loader || facts.custom_swf.is_some() {
        return false;
    }
    !facts.custom_url.as_deref().is_some_and(https_swf)
}

fn write_loader_cache(path: &Path, url: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    let body = serde_json::json!({ "loaderUrl": url });
    fs::write(&tmp, body.to_string()).map_err(|err| err.to_string())?;
    fs::rename(&tmp, path).map_err(|err| err.to_string())
}

fn fetch_loader() -> Result<String, String> {
    let page = read_https(LAUNCHER_PAGE)?;
    let script_url = extract_script_url(&page).ok_or("AppLaunch.js not referenced")?;
    let script = read_https(&script_url)?;
    let url = aqw_url(&script).ok_or("aqw loader missing")?;
    if loader_ok(&url) {
        Ok(url)
    } else {
        Err(format!("rejected aqw url: {}", &url[..url.len().min(120)]))
    }
}

fn read_https(url: &str) -> Result<String, String> {
    let response = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(8))
        .build()
        .get(url)
        .call()
        .map_err(|err| format!("download failed: {err}"))?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(512 * 1024)
        .read_to_end(&mut bytes)
        .map_err(|err| err.to_string())?;
    String::from_utf8(bytes).map_err(|err| err.to_string())
}

fn extract_script_url(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(rel) = lower[from..].find("<script") {
        let start = from + rel;
        let end = lower[start..].find('>').map(|index| start + index)?;
        let tag = &html[start..=end];
        if let Some(src) = script_src(tag) {
            if src.to_ascii_lowercase().contains("applaunch.js") {
                return resolve_artix_url(src);
            }
        }
        from = end + 1;
    }
    None
}

fn script_src(tag: &str) -> Option<&str> {
    let lower = tag.to_ascii_lowercase();
    let src_at = lower.find("src=")?;
    let rest = &tag[src_at + 4..];
    let quote = rest.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let body = &rest[1..];
    let end = body.find(quote)?;
    Some(&body[..end])
}

fn resolve_artix_url(src: &str) -> Option<String> {
    let absolute = if src.starts_with("https://") || src.starts_with("http://") {
        src.to_string()
    } else if let Some(path) = src.strip_prefix("//") {
        format!("https://{path}")
    } else if let Some(path) = src.strip_prefix('/') {
        format!("https://www.artix.com/{path}")
    } else {
        format!("https://www.artix.com/{src}")
    };
    let rest = absolute.strip_prefix("https://")?;
    let (host, _) = rest.split_once('/').unwrap_or((rest, ""));
    (host == "www.artix.com").then_some(absolute)
}

fn aqw_url(js: &str) -> Option<String> {
    let start = js.find("var gameWindows")?;
    let after = js[start..].find('{')?;
    let body = &js[start + after + 1..];
    let mut found = None;
    for line in body.split(['\n', '\r']) {
        let trimmed = line.trim();
        if trimmed.starts_with('}') {
            break;
        }
        if trimmed.starts_with("//") {
            continue;
        }
        let Some(key_end) = trimmed.find(':') else {
            continue;
        };
        let key = trimmed[..key_end].trim();
        if !key.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_') || key.is_empty() {
            continue;
        }
        let Some(url_at) = trimmed.find("url") else {
            continue;
        };
        let after_url = &trimmed[url_at + 3..];
        let Some(quote_at) = after_url.find('"') else {
            continue;
        };
        let quoted = &after_url[quote_at + 1..];
        let Some(end) = quoted.find('"') else {
            continue;
        };
        if key == "aqw" {
            found = Some(quoted[..end].to_string());
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts(
        custom_swf: Option<PathBuf>,
        custom_url: Option<&str>,
        live_loader: bool,
        shell_loader: Option<&str>,
        electron_loader: Option<&str>,
    ) -> MovieFacts {
        MovieFacts {
            custom_swf,
            custom_url: custom_url.map(str::to_string),
            live_loader,
            shell_loader: shell_loader.map(str::to_string),
            electron_loader: electron_loader.map(str::to_string),
        }
    }

    #[test]
    fn decide_prefers_custom_swf_then_custom_url_then_cached_loader() {
        let swf = PathBuf::from("/games/custom-game.swf");
        let custom = "https://cdn.example/games/custom.swf";
        let shell = "https://game.aq.com/game/gamefiles/Loader5.swf?ver=c";
        let electron = "https://game.aq.com/game/gamefiles/Loader6.swf?ver=d";
        let full = facts(Some(swf.clone()), Some(custom), true, Some(shell), Some(electron));
        assert_eq!(
            decide(MovieKind::Primary, &full, 100).player_arg(),
            swf.display().to_string()
        );
        assert_eq!(
            decide(MovieKind::Testing, &full, 321).player_arg(),
            format!("{LOADER_SPIDER}?ver=321")
        );
        assert_eq!(
            decide(MovieKind::DragonFable, &full, 100).player_arg(),
            DF_LOADER
        );

        let url_only = facts(None, Some(custom), true, Some(shell), Some(electron));
        assert_eq!(
            decide(MovieKind::Primary, &url_only, 100).player_arg(),
            custom
        );
        let bad_url = facts(
            None,
            Some("http://cdn.example/games/custom.swf"),
            true,
            Some(shell),
            Some(electron),
        );
        assert_eq!(
            decide(MovieKind::Primary, &bad_url, 100).player_arg(),
            shell
        );
        let shell_only = facts(None, None, true, Some(shell), Some(electron));
        assert_eq!(
            decide(MovieKind::Primary, &shell_only, 100).player_arg(),
            shell
        );
        let electron_only = facts(None, None, true, Some("not a loader"), Some(electron));
        assert_eq!(
            decide(MovieKind::Primary, &electron_only, 100).player_arg(),
            electron
        );
        let skipped = facts(None, None, false, Some(shell), Some(electron));
        assert_eq!(
            decide(MovieKind::Primary, &skipped, 100).player_arg(),
            LOADER4
        );
        let empty = facts(None, None, true, None, None);
        assert_eq!(decide(MovieKind::Primary, &empty, 100).player_arg(), LOADER4);
    }

    #[test]
    fn later_settings_win_and_the_first_swf_file_is_the_movie() {
        let root = std::env::temp_dir().join(format!("aquastar-movie-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let legacy = root.join("legacy.json");
        let canonical = root.join("canonical.json");
        let swf = root.join("custom-game.swf");
        let alias = root.join("aqlite_old.swf");
        fs::write(
            &legacy,
            r#"{"customUrl":"https://old.example/old.swf","liveLoaderUrl":true,"plugins":{"adventure-quest-worlds":{"liveLoaderUrl":true}}}"#,
        )
        .unwrap();
        fs::write(
            &canonical,
            r#"{"customUrl":"https://new.example/new.swf","plugins":{"adventure-quest-worlds":{"liveLoaderUrl":false}}}"#,
        )
        .unwrap();
        fs::write(&alias, b"old").unwrap();
        fs::write(&swf, b"new").unwrap();
        let shell = root.join("loader-cache.json");
        fs::write(
            &shell,
            r#"{"loaderUrl":"https://game.aq.com/game/gamefiles/Loader5.swf?ver=c"}"#,
        )
        .unwrap();
        let paths = ProfilePaths {
            settings_files: vec![legacy, canonical],
            swf_candidates: vec![swf.clone(), alias],
            shell_cache: shell,
            electron_loader_cache: root.join("missing.json"),
            aqua_dir: root.join("AquaStar"),
            legacy_reminders: root.join("aquastar_reminders.json"),
        };
        let loaded = load_facts(&paths);
        assert_eq!(
            loaded.custom_url.as_deref(),
            Some("https://new.example/new.swf")
        );
        assert!(!loaded.live_loader);
        assert_eq!(loaded.custom_swf.as_deref(), Some(swf.as_path()));
        assert_eq!(
            resolve(&paths, MovieKind::Primary).player_arg(),
            swf.display().to_string()
        );
        let testing = resolve(&paths, MovieKind::Testing).player_arg();
        assert!(testing.starts_with(LOADER_SPIDER), "{testing}");
        assert!(testing.contains("?ver="), "{testing}");
        assert!(loaded.shell_loader.is_some());
        assert!(!should_refresh(&loaded));
        let before = fs::read(&paths.shell_cache).unwrap();
        refresh(&paths).unwrap();
        super::super::warm_loader(&paths);
        assert_eq!(fs::read(&paths.shell_cache).unwrap(), before);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn launcher_page_text_yields_the_aqw_loader_without_a_fetch() {
        let html = r#"<html><script src="/scripts/AppLaunch.js?v=1"></script></html>"#;
        assert_eq!(
            extract_script_url(html).as_deref(),
            Some("https://www.artix.com/scripts/AppLaunch.js?v=1")
        );
        assert!(extract_script_url(r#"<script src="https://evil.example/AppLaunch.js"></script>"#).is_none());
        let js = r#"
            var gameWindows = {
            // aqw: { url: "https://game.aq.com/game/gamefiles/Loader3.swf?ver=a" },
            aqw: { url: "https://game.aq.com/game/gamefiles/Loader4.swf?ver=b" },
            df: { url: "https://play.dragonfable.com/game/DFLoader.swf" }
            };
        "#;
        assert_eq!(
            aqw_url(js).as_deref(),
            Some("https://game.aq.com/game/gamefiles/Loader4.swf?ver=b")
        );
        assert!(loader_ok(LOADER4));
        assert!(!loader_ok("https://evil.example/Loader4.swf"));
        assert!(https_swf("https://cdn.example/game.swf?x=1"));
        assert!(!https_swf("https://cdn.example/game.txt"));
    }
}
