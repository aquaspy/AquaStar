use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub format: String,
    pub api_version: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub min_app_version: Option<String>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub origins: Vec<String>,
    #[serde(default)]
    pub games: Vec<Game>,
    #[serde(default)]
    pub links: Vec<Link>,
    #[serde(default)]
    pub tools: Vec<Tool>,
    #[serde(default)]
    pub actions: Vec<Action>,
    #[serde(default)]
    pub menus: Vec<Menu>,
    #[serde(default)]
    pub shortcuts: Vec<Shortcut>,
    /// API 2: package-relative PNG/SVG shown beside the plugin name.
    #[serde(default)]
    pub icon: Option<String>,
    /// API 2: search forms the launcher can show.
    #[serde(default)]
    pub searches: Vec<Search>,
    /// API 2: declarative launcher page. Without it the host builds a default one.
    #[serde(default)]
    pub launcher: Option<Launcher>,
    /// API 2: how the command line and the start-up setting refer to this plugin.
    #[serde(default)]
    pub launcher_parameters: Option<LauncherParameters>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LauncherParameters {
    /// Short command id: `--<id>` on the command line. Lowercase letters, digits and hyphens.
    pub id: String,
    /// Game that `--<id>` opens when no `--game` is given. Defaults to the first game.
    #[serde(default)]
    pub default_game: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Game {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub file: Option<String>,
    /// API 2.
    #[serde(default)]
    pub description: Option<String>,
    /// API 2.
    #[serde(default)]
    pub icon: Option<String>,
    /// API 2: which players may open this game. Empty means every player the host ships.
    #[serde(default)]
    pub engines: Vec<EngineSpec>,
    /// API 2, bundled plugin only: host-side movie resolver (for example `aqw-primary`).
    #[serde(default)]
    pub resolver: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EngineSpec {
    pub engine: String,
    #[serde(default)]
    pub platforms: Vec<String>,
    #[serde(default)]
    pub arch: Vec<String>,
    #[serde(default)]
    pub default: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Link {
    pub id: String,
    pub name: String,
    pub url: String,
    /// API 2: heading the launcher lists this link under.
    #[serde(default)]
    pub group: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Tool {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub entry: String,
    /// API 2, bundled plugin only: a window implemented by the host (`inventory`, `settings`…).
    #[serde(default)]
    pub builtin: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Search {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub placeholder: String,
    /// HTTPS URL containing one `{q}`.
    pub url_template: String,
    /// `alphanumeric` strips everything but ASCII letters and digits before substitution.
    #[serde(default)]
    pub sanitize: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Launcher {
    pub blocks: Vec<Block>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Block {
    /// `games`, `tools`, `links` or `search`.
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub title: Option<String>,
    /// Ids of the contributions to show; empty means all of that kind.
    #[serde(default)]
    pub items: Vec<String>,
    /// Bundled plugin only: a host-provided list (`menu:useful`).
    #[serde(default)]
    pub source: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Action {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub target: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Menu {
    pub action: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Shortcut {
    pub action: String,
    pub accelerator: String,
}

pub fn icon_path(path: &str) -> Result<(), String> {
    let lower = path.to_ascii_lowercase();
    if safe_relative(path) && (lower.ends_with(".png") || lower.ends_with(".svg")) {
        Ok(())
    } else {
        Err("Icons must be relative PNG or SVG files".into())
    }
}

fn validate_engines(engines: &[EngineSpec]) -> Result<(), String> {
    if engines.len() > 8 || engines.iter().filter(|spec| spec.default).count() > 1 {
        return Err("Game engines: at most 8 entries and one default".into());
    }
    for spec in engines {
        if !["ruffle", "flash"].contains(&spec.engine.as_str())
            || spec
                .platforms
                .iter()
                .any(|p| !["windows", "linux", "macos"].contains(&p.as_str()))
            || spec
                .arch
                .iter()
                .any(|a| !["x86", "x86_64", "aarch64"].contains(&a.as_str()))
        {
            return Err("Game engines name unknown players, platforms or architectures".into());
        }
    }
    Ok(())
}

impl Search {
    fn validate(&self) -> Result<(), String> {
        if self.placeholder.len() > 120
            || !matches!(self.sanitize.as_deref(), None | Some("alphanumeric"))
            || self.url_template.matches("{q}").count() != 1
        {
            return Err("Invalid search definition".into());
        }
        https_url(&self.url_template.replace("{q}", "x")).map(|_| ())
    }

    /// Build the URL for a query. Returns `None` when sanitizing leaves nothing to search for.
    pub fn url_for(&self, query: &str) -> Option<String> {
        let term: String = if self.sanitize.as_deref() == Some("alphanumeric") {
            query.chars().filter(char::is_ascii_alphanumeric).collect()
        } else {
            query.trim().to_string()
        };
        if term.is_empty() {
            return None;
        }
        let mut encoded = String::new();
        for b in term.bytes() {
            if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
                encoded.push(b as char);
            } else {
                encoded.push_str(&format!("%{b:02X}"));
            }
        }
        Some(self.url_template.replace("{q}", &encoded))
    }
}

pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.as_bytes()[0].is_ascii_lowercase()
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}
pub fn safe_relative(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 512
        && !path
            .chars()
            .any(|c| c.is_control() || "\\:<>\"|?*".contains(c))
        && !path.starts_with('/')
        && path
            .split('/')
            .all(|p| !p.is_empty() && p != "." && p != "..")
}
fn https_url(value: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(value).map_err(|_| "Invalid HTTPS URL".to_string())?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only credential-free HTTPS URLs are supported".into());
    }
    Ok(url)
}
fn version_parts(value: &str) -> Result<([u64; 3], Option<&str>), String> {
    if value.len() > 80
        || value.is_empty()
        || value
            .bytes()
            .any(|b| !(b.is_ascii_alphanumeric() || b".-+".contains(&b)))
    {
        return Err("Invalid semantic version".into());
    }
    let mut metadata = value.split('+');
    let base = metadata.next().unwrap();
    if let Some(build) = metadata.next() {
        if metadata.next().is_some()
            || build.split('.').any(|part| {
                part.is_empty() || !part.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            })
        {
            return Err("Invalid semantic version metadata".into());
        }
    }
    let (core, pre) = base
        .split_once('-')
        .map_or((base, None), |(a, b)| (a, Some(b)));
    if core
        .split('.')
        .any(|part| part.len() > 1 && part.starts_with('0'))
    {
        return Err("Invalid semantic version core".into());
    }
    let values = core
        .split('.')
        .map(str::parse::<u64>)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Invalid semantic version")?;
    if values.len() != 3
        || pre.is_some_and(|p| {
            p.is_empty()
                || p.split('.').any(|part| {
                    part.is_empty()
                        || !part.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
                        || (part.len() > 1
                            && part.starts_with('0')
                            && part.bytes().all(|b| b.is_ascii_digit()))
                })
        })
    {
        return Err("Invalid semantic version".into());
    }
    Ok(([values[0], values[1], values[2]], pre))
}
pub fn version_at_least(current: &str, minimum: &str) -> Result<bool, String> {
    use std::cmp::Ordering;
    let (a, ap) = version_parts(current)?;
    let (b, bp) = version_parts(minimum)?;
    if a != b {
        return Ok(a > b);
    }
    match (ap, bp) {
        (None, _) => Ok(true),
        (Some(_), None) => Ok(false),
        (Some(a), Some(b)) => {
            let mut aa = a.split('.');
            let mut bb = b.split('.');
            loop {
                match (aa.next(), bb.next()) {
                    (None, None) => return Ok(true),
                    (None, Some(_)) => return Ok(false),
                    (Some(_), None) => return Ok(true),
                    (Some(x), Some(y)) => {
                        let cmp = match (x.parse::<u64>(), y.parse::<u64>()) {
                            (Ok(x), Ok(y)) => x.cmp(&y),
                            (Ok(_), Err(_)) => Ordering::Less,
                            (Err(_), Ok(_)) => Ordering::Greater,
                            _ => x.cmp(y),
                        };
                        if cmp != Ordering::Equal {
                            return Ok(cmp == Ordering::Greater);
                        }
                    }
                }
            }
        }
    }
}
pub const BUNDLED_RESOLVERS: [&str; 2] = ["aqw-primary", "dragonfable"];
pub const BUNDLED_TOOLS: [&str; 5] = ["inventory", "reminders", "todo", "strategy", "settings"];
const BLOCK_KINDS: [&str; 4] = ["games", "tools", "links", "search"];

impl Manifest {
    /// Validate a third-party package.
    pub fn validate(&self, app_version: &str) -> Result<(), String> {
        self.validate_as(app_version, false)
    }

    /// Validate the plugin compiled into AquaStar. It may use host-only features.
    pub fn validate_bundled(&self, app_version: &str) -> Result<(), String> {
        self.validate_as(app_version, true)
    }

    fn uses_api_2(&self) -> bool {
        self.icon.is_some()
            || !self.searches.is_empty()
            || self.launcher.is_some()
            || self.launcher_parameters.is_some()
            || self.games.iter().any(|g| {
                g.description.is_some() || g.icon.is_some() || !g.engines.is_empty() || g.resolver.is_some()
            })
            || self.links.iter().any(|l| l.group.is_some())
            || self.tools.iter().any(|t| t.builtin.is_some())
    }

    fn validate_as(&self, app_version: &str, bundled: bool) -> Result<(), String> {
        if self.format != "aquastar-desktop-plugin" || !(1..=2).contains(&self.api_version) {
            return Err("Unsupported plugin format or API version".into());
        }
        if self.api_version < 2 && self.uses_api_2() {
            return Err("These fields require apiVersion 2".into());
        }
        if !valid_id(&self.id)
            || (!bundled && ["adventure-quest-worlds", "aquastar"].contains(&self.id.as_str()))
        {
            return Err("Invalid plugin ID".into());
        }
        if self.name.trim().is_empty() || self.name.len() > 120 || self.description.len() > 4096 {
            return Err("Invalid plugin name or description".into());
        }
        version_parts(&self.version)?;
        if let Some(min) = &self.min_app_version {
            if !version_at_least(app_version, min)? {
                return Err(format!("Requires AquaStar {min} or newer"));
            }
        }
        let mut permissions = BTreeSet::new();
        for p in &self.permissions {
            if !["storage", "network", "launch", "links"].contains(&p.as_str())
                || !permissions.insert(p)
            {
                return Err("Unknown or duplicate permission".into());
            }
        }
        let mut origins = BTreeSet::new();
        for origin in &self.origins {
            let url = https_url(origin)?;
            if url.path() != "/"
                || url.query().is_some()
                || url.fragment().is_some()
                || url.origin().ascii_serialization() != *origin
                || !origins.insert(origin)
            {
                return Err(
                    "Origins must be unique exact HTTPS origins without trailing slash".into(),
                );
            }
        }
        if !self.origins.is_empty() && !permissions.contains(&"network".to_string()) {
            return Err("Network origins require the network permission".into());
        }
        let mut ids = BTreeSet::new();
        for (id, name) in self
            .games
            .iter()
            .map(|v| (&v.id, &v.name))
            .chain(self.links.iter().map(|v| (&v.id, &v.name)))
            .chain(self.tools.iter().map(|v| (&v.id, &v.name)))
            .chain(self.searches.iter().map(|v| (&v.id, &v.name)))
            .chain(self.actions.iter().map(|v| (&v.id, &v.name)))
        {
            if !valid_id(id) || name.trim().is_empty() || name.len() > 120 || !ids.insert(id) {
                return Err("Contribution IDs must be unique and names nonempty".into());
            }
        }
        if ids.len() > 256 || self.menus.len() > 64 || self.shortcuts.len() > 32 {
            return Err("Too many contributions".into());
        }
        if !bundled
            && !self.games.is_empty()
            && !self
                .permissions
                .iter()
                .any(|permission| permission == "launch")
        {
            return Err("Game contributions require the launch permission".into());
        }
        if !bundled
            && !self.links.is_empty()
            && !self
                .permissions
                .iter()
                .any(|permission| permission == "links")
        {
            return Err("Link contributions require the links permission".into());
        }
        for game in &self.games {
            if let Some(resolver) = &game.resolver {
                if !bundled || !BUNDLED_RESOLVERS.contains(&resolver.as_str()) {
                    return Err("Game resolvers are reserved for the bundled plugin".into());
                }
                if game.url.is_some() || game.file.is_some() {
                    return Err("A resolver game cannot also declare a URL or SWF file".into());
                }
            } else {
                match (&game.url, &game.file) {
                    (Some(url), None) => {
                        https_url(url)?;
                    }
                    (None, Some(file))
                        if safe_relative(file) && file.to_ascii_lowercase().ends_with(".swf") => {}
                    _ => {
                        return Err("Games require exactly one HTTPS URL or relative SWF file".into())
                    }
                }
            }
            if game.description.as_ref().is_some_and(|text| text.len() > 1024) {
                return Err("Game descriptions are limited to 1024 bytes".into());
            }
            if let Some(icon) = &game.icon {
                icon_path(icon)?;
            }
            validate_engines(&game.engines)?;
        }
        if let Some(icon) = &self.icon {
            icon_path(icon)?;
        }
        for link in &self.links {
            https_url(&link.url)?;
            if link.group.as_ref().is_some_and(|group| group.trim().is_empty() || group.len() > 64) {
                return Err("Link groups must be 1 to 64 bytes".into());
            }
        }
        for tool in &self.tools {
            match &tool.builtin {
                Some(builtin) => {
                    if !bundled || !BUNDLED_TOOLS.contains(&builtin.as_str()) || !tool.entry.is_empty() {
                        return Err("Built-in tools are reserved for the bundled plugin".into());
                    }
                }
                None => {
                    if !safe_relative(&tool.entry)
                        || !tool.entry.to_ascii_lowercase().ends_with(".html")
                    {
                        return Err("Tools require a relative HTML entry".into());
                    }
                }
            }
        }
        for search in &self.searches {
            search.validate()?;
        }
        if let Some(launcher) = &self.launcher {
            self.validate_launcher(launcher, bundled)?;
        }
        if let Some(parameters) = &self.launcher_parameters {
            if !crate::cli::valid_command_id(&parameters.id) {
                return Err(
                    "Launcher command ids use lowercase letters, digits and hyphens, and cannot be a reserved word"
                        .into(),
                );
            }
            if let Some(game) = &parameters.default_game {
                if !self.games.iter().any(|g| &g.id == game) {
                    return Err("The default game is not one of the plugin's games".into());
                }
            }
        }
        for action in &self.actions {
            let exists = match action.kind.as_str() {
                "game" => self.games.iter().any(|x| x.id == action.target),
                "link" => self.links.iter().any(|x| x.id == action.target),
                "tool" => self.tools.iter().any(|x| x.id == action.target),
                _ => false,
            };
            if !exists {
                return Err("Action references an unknown contribution".into());
            }
        }
        for action in self
            .menus
            .iter()
            .map(|x| &x.action)
            .chain(self.shortcuts.iter().map(|x| &x.action))
        {
            if !self.actions.iter().any(|x| &x.id == action) {
                return Err("Menu or shortcut references an unknown action".into());
            }
        }
        for shortcut in &self.shortcuts {
            if shortcut.accelerator.trim().is_empty() || shortcut.accelerator.len() > 100 {
                return Err("Invalid shortcut accelerator".into());
            }
        }
        Ok(())
    }

    fn validate_launcher(&self, launcher: &Launcher, bundled: bool) -> Result<(), String> {
        if launcher.blocks.is_empty() || launcher.blocks.len() > 16 {
            return Err("A launcher layout needs 1 to 16 blocks".into());
        }
        for block in &launcher.blocks {
            if !BLOCK_KINDS.contains(&block.kind.as_str())
                || block.title.as_ref().is_some_and(|title| title.len() > 120)
                || block.items.len() > 64
            {
                return Err("Invalid launcher block".into());
            }
            if let Some(source) = &block.source {
                if !bundled || block.kind != "links" || source != "menu:useful" {
                    return Err("Block sources are reserved for the bundled plugin".into());
                }
            }
            for item in &block.items {
                let known = match block.kind.as_str() {
                    "games" => self.games.iter().any(|v| &v.id == item),
                    "tools" => self.tools.iter().any(|v| &v.id == item),
                    "links" => self.links.iter().any(|v| &v.id == item),
                    _ => self.searches.iter().any(|v| &v.id == item),
                };
                if !known {
                    return Err("Launcher block references an unknown contribution".into());
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(extra: &str, api: u32) -> Manifest {
        serde_json::from_str(&format!(
            r#"{{"format":"aquastar-desktop-plugin","apiVersion":{api},"id":"demo","name":"Demo","version":"1.0.0"{extra}}}"#
        ))
        .unwrap()
    }

    #[test]
    fn api_1_plugins_stay_valid_and_cannot_use_api_2_fields() {
        let v1 = parse(r#","permissions":["launch"],"games":[{"id":"g","name":"G","url":"https://example.com/g.swf"}]"#, 1);
        assert!(v1.validate("3.0.0").is_ok());
        for extra in [
            r#","icon":"icon.png""#,
            r#","games":[{"id":"g","name":"G","url":"https://example.com/g.swf","description":"x"}],"permissions":["launch"]"#,
            r#","links":[{"id":"l","name":"L","url":"https://example.com/","group":"G"}],"permissions":["links"]"#,
        ] {
            let error = parse(extra, 1).validate("3.0.0").unwrap_err();
            assert!(error.contains("apiVersion 2"), "{extra}: {error}");
            assert!(parse(extra, 2).validate("3.0.0").is_ok(), "{extra}");
        }
        assert!(parse("", 3).validate("3.0.0").is_err());
    }

    #[test]
    fn host_only_features_are_refused_outside_the_bundled_plugin() {
        let resolver = parse(r#","games":[{"id":"g","name":"G","resolver":"aqw-primary"}]"#, 2);
        assert!(resolver.validate("3.0.0").is_err());
        assert!(resolver.validate_bundled("3.0.0").is_ok());
        let builtin = parse(r#","tools":[{"id":"t","name":"T","builtin":"inventory"}]"#, 2);
        assert!(builtin.validate("3.0.0").is_err());
        assert!(builtin.validate_bundled("3.0.0").is_ok());
        let unknown = parse(r#","tools":[{"id":"t","name":"T","builtin":"shell"}]"#, 2);
        assert!(unknown.validate_bundled("3.0.0").is_err());
        let source = parse(
            r#","links":[{"id":"l","name":"L","url":"https://example.com/"}],"permissions":["links"],"launcher":{"blocks":[{"type":"links","source":"menu:useful"}]}"#,
            2,
        );
        assert!(source.validate("3.0.0").is_err());
        let mut bundled = parse(r#","launcher":{"blocks":[{"type":"links","source":"menu:useful"}]}"#, 2);
        assert!(bundled.validate_bundled("3.0.0").is_ok());
        bundled.id = "adventure-quest-worlds".into();
        assert!(bundled.validate("3.0.0").is_err(), "the reserved id stays reserved for packages");
        assert!(bundled.validate_bundled("3.0.0").is_ok());
    }

    #[test]
    fn engines_and_layouts_are_checked() {
        let base = r#","permissions":["launch"],"games":[{"id":"g","name":"G","url":"https://example.com/g.swf","engines":"#;
        for (engines, ok) in [
            (r#"[{"engine":"ruffle","platforms":["windows","linux"],"arch":["x86_64"]}]"#, true),
            (r#"[{"engine":"unity"}]"#, false),
            (r#"[{"engine":"flash","platforms":["beos"]}]"#, false),
            (r#"[{"engine":"flash","arch":["mips"]}]"#, false),
            (r#"[{"engine":"flash","default":true},{"engine":"ruffle","default":true}]"#, false),
        ] {
            let manifest = parse(&format!("{base}{engines}}}]"), 2);
            assert_eq!(manifest.validate("3.0.0").is_ok(), ok, "{engines}");
        }
        let layout = |blocks: &str| {
            parse(
                &format!(r#","tools":[{{"id":"t","name":"T","entry":"index.html"}}],"launcher":{{"blocks":{blocks}}}"#),
                2,
            )
            .validate("3.0.0")
        };
        assert!(layout(r#"[{"type":"tools","items":["t"]}]"#).is_ok());
        assert!(layout(r#"[{"type":"tools","items":["missing"]}]"#).is_err());
        assert!(layout(r#"[{"type":"banner"}]"#).is_err());
        assert!(layout("[]").is_err());
    }

    #[test]
    fn searches_substitute_one_encoded_query() {
        let wiki = Search {
            id: "wiki".into(),
            name: "Wiki".into(),
            placeholder: String::new(),
            url_template: "https://aqwwiki.wikidot.com/search:site/q/{q}".into(),
            sanitize: None,
        };
        assert_eq!(
            wiki.url_for(" Void Highlord  & co ").unwrap(),
            "https://aqwwiki.wikidot.com/search:site/q/Void%20Highlord%20%20%26%20co"
        );
        assert!(wiki.url_for("   ").is_none());
        let character = Search {
            url_template: "https://account.aq.com/CharPage?id={q}".into(),
            sanitize: Some("alphanumeric".into()),
            ..wiki.clone()
        };
        assert_eq!(character.url_for("D star!#").unwrap(), "https://account.aq.com/CharPage?id=Dstar");
        assert!(character.url_for("!!!").is_none());
        let bad = |template: &str| {
            parse(&format!(r#","searches":[{{"id":"s","name":"S","urlTemplate":"{template}"}}]"#), 2)
                .validate("3.0.0")
                .is_err()
        };
        assert!(bad("http://example.com/?q={q}"));
        assert!(bad("https://example.com/?q="));
        assert!(bad("https://example.com/{q}/{q}"));
        assert!(!bad("https://example.com/?q={q}"));
    }
}

#[cfg(test)]
mod launcher_parameter_tests {
    use super::*;

    fn with(parameters: &str, api: u32) -> Result<(), String> {
        let manifest: Manifest = serde_json::from_str(&format!(
            r#"{{"format":"aquastar-desktop-plugin","apiVersion":{api},"id":"demo","name":"Demo","version":"1.0.0",
            "permissions":["launch"],"games":[{{"id":"g","name":"G","url":"https://example.com/g.swf"}}],
            "launcherParameters":{parameters}}}"#
        ))
        .unwrap();
        manifest.validate("3.0.0")
    }

    #[test]
    fn launcher_parameters_need_api_2_a_free_command_id_and_a_real_default_game() {
        assert!(with(r#"{"id":"demo-game","defaultGame":"g"}"#, 2).is_ok());
        assert!(with(r#"{"id":"demo-game"}"#, 2).is_ok());
        assert!(with(r#"{"id":"demo-game"}"#, 1).unwrap_err().contains("apiVersion 2"));
        for bad in ["game", "launcher", "ruffle", "flash32", "Demo", "has space", ""] {
            assert!(with(&format!(r#"{{"id":"{bad}"}}"#), 2).is_err(), "{bad}");
        }
        assert!(with(r#"{"id":"demo-game","defaultGame":"missing"}"#, 2).is_err());
        assert!(with(r#"{"id":"demo-game","surprise":1}"#, 2).is_err());
    }
}
