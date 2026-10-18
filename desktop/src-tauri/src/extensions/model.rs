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
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Link {
    pub id: String,
    pub name: String,
    pub url: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Tool {
    pub id: String,
    pub name: String,
    pub entry: String,
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
impl Manifest {
    pub fn validate(&self, app_version: &str) -> Result<(), String> {
        if self.format != "aquastar-desktop-plugin" || self.api_version != 1 {
            return Err("Unsupported plugin format or API version".into());
        }
        if !valid_id(&self.id) || ["adventure-quest-worlds", "aquastar"].contains(&self.id.as_str())
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
            .chain(self.actions.iter().map(|v| (&v.id, &v.name)))
        {
            if !valid_id(id) || name.trim().is_empty() || name.len() > 120 || !ids.insert(id) {
                return Err("Contribution IDs must be unique and names nonempty".into());
            }
        }
        if ids.len() > 256 || self.menus.len() > 64 || self.shortcuts.len() > 32 {
            return Err("Too many contributions".into());
        }
        if !self.games.is_empty()
            && !self
                .permissions
                .iter()
                .any(|permission| permission == "launch")
        {
            return Err("Game contributions require the launch permission".into());
        }
        if !self.links.is_empty()
            && !self
                .permissions
                .iter()
                .any(|permission| permission == "links")
        {
            return Err("Link contributions require the links permission".into());
        }
        for game in &self.games {
            match (&game.url, &game.file) {
                (Some(url), None) => {
                    https_url(url)?;
                }
                (None, Some(file))
                    if safe_relative(file) && file.to_ascii_lowercase().ends_with(".swf") => {}
                _ => return Err("Games require exactly one HTTPS URL or relative SWF file".into()),
            }
        }
        for link in &self.links {
            https_url(&link.url)?;
        }
        for tool in &self.tools {
            if !safe_relative(&tool.entry) || !tool.entry.to_ascii_lowercase().ends_with(".html") {
                return Err("Tools require a relative HTML entry".into());
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
}
