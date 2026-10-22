//! The bundled game manifest, the locale strings it points at, and the keybind table.
//! Menus, shortcuts, launcher buttons, and About all read this module.

#[cfg(test)]
use std::collections::BTreeSet;
use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Deserialize;
use serde_json::{Map, Value};

const MANIFEST_JSON: &str = include_str!("../games/adventure-quest-worlds.json");
const GAME_EN: &str = include_str!("../../plugins/adventure-quest-worlds/locales/en-US.js");
const GAME_PT: &str = include_str!("../../plugins/adventure-quest-worlds/locales/pt-BR.js");
const PLATFORM_EN: &str = include_str!("../assets/po/en-US.js");
const PLATFORM_PT: &str = include_str!("../assets/po/pt-BR.js");

#[derive(Clone, Debug, Deserialize)]
struct ManifestFile {
    about: AboutFile,
    menus: Vec<MenuNode>,
    keybinds: Vec<KeybindFile>,
}

#[derive(Clone, Debug, Deserialize)]
struct AboutFile {
    #[serde(rename = "releasesUrl")]
    releases_url: String,
}

#[derive(Clone, Debug, Deserialize)]
struct MenuNode {
    id: Option<String>,
    #[serde(rename = "labelKey")]
    label_key: Option<String>,
    label: Option<String>,
    #[serde(rename = "labelPrefix")]
    label_prefix: Option<String>,
    fallback: Option<String>,
    action: Option<String>,
    url: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
    items: Option<Vec<MenuNode>>,
}

#[derive(Clone, Debug, Deserialize)]
struct KeybindFile {
    id: String,
    default: AccelValue,
    action: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
enum AccelValue {
    One(String),
    Many(Vec<String>),
}

impl AccelValue {
    fn list(&self) -> Vec<String> {
        match self {
            Self::One(value) => vec![value.clone()],
            Self::Many(values) => values.clone(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct Keybind {
    pub id: String,
    pub defaults: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct Command {
    pub action: String,
    pub target: String,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct Dialog {
    pub title: String,
    pub message: String,
    pub detail: String,
    pub primary: String,
    pub close: String,
}

#[derive(Clone, Debug)]
pub struct UsefulPage {
    pub id: String,
    pub label_key: String,
    pub url: String,
    pub group: String,
}

#[derive(Clone, Debug)]
struct Catalog {
    menu: HashMap<String, String>,
    labels: HashMap<String, String>,
    dialog: HashMap<String, String>,
    credits: String,
}

fn manifest() -> &'static ManifestFile {
    static PARSED: OnceLock<ManifestFile> = OnceLock::new();
    PARSED.get_or_init(|| serde_json::from_str(MANIFEST_JSON).expect("game manifest"))
}

fn catalogs() -> &'static HashMap<&'static str, Catalog> {
    static CATALOGS: OnceLock<HashMap<&'static str, Catalog>> = OnceLock::new();
    CATALOGS.get_or_init(|| {
        let mut map = HashMap::new();
        let mut en = merge_catalog(PLATFORM_EN, GAME_EN);
        en.menu
            .insert("menuPreferences".into(), "Preferences".into());
        let mut pt = merge_catalog(PLATFORM_PT, GAME_PT);
        pt.menu
            .insert("menuPreferences".into(), "Preferências".into());
        map.insert("en-US", en);
        map.insert("pt-BR", pt);
        map
    })
}

fn merge_catalog(platform: &str, game: &str) -> Catalog {
    let mut menu = string_object(platform, "menuMessages");
    menu.extend(string_object(game, "menuMessages"));
    let mut labels = nested_strings(platform, "settingsMessages", "labels");
    labels.extend(nested_strings(game, "settingsMessages", "labels"));
    Catalog {
        menu,
        labels,
        dialog: string_object(platform, "dialogMessages"),
        credits: string_object(game, "aboutMessages")
            .get("credits")
            .cloned()
            .unwrap_or_default(),
    }
}

pub fn resolve_language(value: &str) -> &'static str {
    match value.trim() {
        "pt-BR" => "pt-BR",
        "en-US" => "en-US",
        _ => {
            let probe = std::env::var("LC_ALL")
                .or_else(|_| std::env::var("LANG"))
                .unwrap_or_default()
                .to_ascii_lowercase();
            if probe.starts_with("pt") {
                "pt-BR"
            } else {
                "en-US"
            }
        }
    }
}

fn catalog(lang: &str) -> &'static Catalog {
    let lang = if lang == "pt-BR" { "pt-BR" } else { "en-US" };
    catalogs().get(lang).expect("locale catalog")
}

pub fn menu_label(lang: &str, key: &str, fallback: &str) -> String {
    let catalogs = catalogs();
    catalogs
        .get(lang)
        .and_then(|cat| cat.menu.get(key))
        .or_else(|| catalogs.get("en-US").and_then(|cat| cat.menu.get(key)))
        .cloned()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn node_label(lang: &str, node: &MenuNode) -> String {
    let prefix = node.label_prefix.clone().unwrap_or_default();
    let text = if let Some(label) = node.label.clone().filter(|value| !value.is_empty()) {
        label
    } else if let Some(key) = &node.label_key {
        menu_label(lang, key, node.fallback.as_deref().unwrap_or(key))
    } else {
        node.fallback.clone().unwrap_or_default()
    };
    format!("{prefix}{text}")
}

pub fn keybinds() -> Vec<Keybind> {
    manifest()
        .keybinds
        .iter()
        .map(|bind| Keybind {
            id: bind.id.clone(),
            defaults: bind.default.list(),
        })
        .collect()
}

pub fn keybind_defaults_value() -> Value {
    let mut map = Map::new();
    for bind in &manifest().keybinds {
        let value = match &bind.default {
            AccelValue::One(text) => Value::String(text.clone()),
            AccelValue::Many(list) => {
                Value::Array(list.iter().cloned().map(Value::String).collect())
            }
        };
        map.insert(bind.id.clone(), value);
    }
    Value::Object(map)
}

pub fn accelerators(bind: &Keybind, saved: Option<&Value>) -> Vec<String> {
    let owned = match saved {
        Some(Value::String(text)) => vec![text.clone()],
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| item.as_str().map(str::to_string))
            .collect(),
        _ => bind.defaults.clone(),
    };
    owned
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

pub fn command_for(id: &str) -> Option<Command> {
    if let Some(node) = find_node(&manifest().menus, id) {
        let action = node.action.clone().unwrap_or_else(|| {
            if node.url.is_some() {
                "page".into()
            } else {
                String::new()
            }
        });
        if action.is_empty() {
            return None;
        }
        return Some(Command {
            action,
            target: node.id.clone().unwrap_or_else(|| id.to_string()),
        });
    }
    manifest()
        .keybinds
        .iter()
        .find(|bind| bind.id == id)
        .map(|bind| Command {
            action: bind.action.clone(),
            target: bind.id.clone(),
        })
}

fn find_node<'a>(nodes: &'a [MenuNode], id: &str) -> Option<&'a MenuNode> {
    for node in nodes {
        if node.id.as_deref() == Some(id)
            && node.kind.as_deref() != Some("separator")
            && node.items.is_none()
        {
            return Some(node);
        }
        if let Some(children) = &node.items {
            if let Some(found) = find_node(children, id) {
                return Some(found);
            }
        }
    }
    None
}

pub fn page_url(id: &str) -> Option<String> {
    find_node(&manifest().menus, id).and_then(|node| node.url.clone())
}

pub fn page_label(lang: &str, id: &str) -> String {
    find_node(&manifest().menus, id)
        .map(|node| node_label(lang, node))
        .unwrap_or_else(|| id.to_string())
}

pub fn charpage_url(name: &str) -> String {
    let base = page_url("charpage").unwrap_or_else(|| "https://account.aq.com/CharPage".into());
    let id: String = name
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect();
    if id.is_empty() {
        base
    } else {
        format!("{base}?id={id}")
    }
}

/// Texts of the Char Page Studio window, in the chosen language.
pub fn studio_messages(lang: &str) -> Value {
    let source = if lang == "pt-BR" { GAME_PT } else { GAME_EN };
    let mut map = Map::new();
    for (key, value) in string_object(GAME_EN, "charPageStudioMessages") {
        map.insert(key, Value::String(value));
    }
    for (key, value) in string_object(source, "charPageStudioMessages") {
        map.insert(key, Value::String(value));
    }
    // The Electron text says "native Flash Player"; the player is Ruffle in its own window here.
    map.remove("description");
    Value::Object(map)
}

pub fn releases_url() -> &'static str {
    manifest().about.releases_url.as_str()
}

#[derive(Clone, Copy)]
struct HostRule {
    http: bool,
}

fn host_rules() -> &'static HashMap<String, HostRule> {
    static RULES: OnceLock<HashMap<String, HostRule>> = OnceLock::new();
    RULES.get_or_init(|| {
        let mut map = HashMap::new();
        for page in useful_pages() {
            let Ok(parsed) = page.url.parse::<tauri::Url>() else {
                continue;
            };
            let Some(host) = parsed.host_str() else {
                continue;
            };
            let entry = map
                .entry(host.to_string())
                .or_insert(HostRule { http: false });
            if parsed.scheme() == "http" {
                entry.http = true;
            }
        }
        map.entry("www.artix.com".into())
            .or_insert(HostRule { http: false });
        map
    })
}

pub fn accept_site(url: &str) -> Result<tauri::Url, String> {
    let parsed: tauri::Url = url.parse().map_err(|_| "bad url".to_string())?;
    let host = parsed.host_str().unwrap_or("");
    if crate::ads::host_blocked(host) {
        return Err(format!("{host} is not an allowed site"));
    }
    let Some(rule) = host_rules().get(host) else {
        return Err(format!("{host} is not an allowed site"));
    };
    let allowed = match parsed.scheme() {
        "https" => true,
        "http" => rule.http,
        _ => false,
    };
    if !allowed {
        return Err(format!("{host} is not an allowed site"));
    }
    Ok(parsed)
}

pub fn useful_pages() -> Vec<UsefulPage> {
    let mut pages = Vec::new();
    let Some(root) = manifest()
        .menus
        .iter()
        .find(|node| node.id.as_deref() == Some("useful"))
    else {
        return pages;
    };
    if let Some(items) = &root.items {
        collect_pages(items, "top", &mut pages);
    }
    pages
}

fn collect_pages(nodes: &[MenuNode], group: &str, out: &mut Vec<UsefulPage>) {
    for node in nodes {
        if node.kind.as_deref() == Some("separator") {
            continue;
        }
        if let Some(children) = &node.items {
            let group = node.id.clone().unwrap_or_else(|| group.to_string());
            collect_pages(children, &group, out);
            continue;
        }
        if let (Some(id), Some(url), Some(label_key)) =
            (node.id.clone(), node.url.clone(), node.label_key.clone())
        {
            out.push(UsefulPage {
                id,
                label_key,
                url,
                group: group.to_string(),
            });
        }
    }
}

pub fn shell_pages(lang: &str) -> Value {
    let heading = manifest()
        .menus
        .iter()
        .find(|node| node.id.as_deref() == Some("useful"))
        .map(|node| node_label(lang, node))
        .unwrap_or_default();
    let mut groups: Vec<Value> = Vec::new();
    let mut order: Vec<String> = Vec::new();
    let mut pages_by_group: HashMap<String, Vec<Value>> = HashMap::new();
    for page in useful_pages() {
        if !pages_by_group.contains_key(&page.group) {
            order.push(page.group.clone());
        }
        pages_by_group
            .entry(page.group.clone())
            .or_default()
            .push(serde_json::json!({
                "id": page.id,
                "label": menu_label(lang, &page.label_key, &page.label_key),
                "url": page.url,
            }));
    }
    for group in order {
        let label = match group.as_str() {
            "top" => Value::Null,
            "otherPages" => {
                Value::String(menu_label(lang, "menuOtherPages2", "Other usefull Pages"))
            }
            "socialMedia" => Value::String(menu_label(lang, "menuSocialMedia", "Social Media")),
            other => Value::String(other.to_string()),
        };
        groups.push(serde_json::json!({
            "id": group,
            "label": label,
            "pages": pages_by_group.remove(&group).unwrap_or_default(),
        }));
    }
    serde_json::json!({ "heading": heading, "groups": groups })
}

pub fn install_menu(app: &tauri::AppHandle, lang: &str) -> Result<(), String> {
    use tauri::menu::Menu;
    let menu = Menu::new(app).map_err(|err| err.to_string())?;
    for node in &manifest().menus {
        append_top(app, &menu, node, lang)?;
    }
    app.set_menu(menu).map_err(|err| err.to_string())?;
    Ok(())
}

fn append_top(
    app: &tauri::AppHandle,
    menu: &tauri::menu::Menu<tauri::Wry>,
    node: &MenuNode,
    lang: &str,
) -> Result<(), String> {
    use tauri::menu::{MenuItem, Submenu};
    if let Some(children) = &node.items {
        let submenu = Submenu::with_id(
            app,
            node.id.clone().unwrap_or_default(),
            node_label(lang, node),
            true,
        )
        .map_err(|err| err.to_string())?;
        fill_submenu(app, &submenu, children, lang)?;
        menu.append(&submenu).map_err(|err| err.to_string())?;
        return Ok(());
    }
    let item = MenuItem::with_id(
        app,
        node.id.clone().unwrap_or_default(),
        node_label(lang, node),
        true,
        None::<&str>,
    )
    .map_err(|err| err.to_string())?;
    menu.append(&item).map_err(|err| err.to_string())?;
    Ok(())
}

fn fill_submenu(
    app: &tauri::AppHandle,
    submenu: &tauri::menu::Submenu<tauri::Wry>,
    nodes: &[MenuNode],
    lang: &str,
) -> Result<(), String> {
    use tauri::menu::{MenuItem, PredefinedMenuItem, Submenu};
    for node in nodes {
        if node.kind.as_deref() == Some("separator") {
            let separator = PredefinedMenuItem::separator(app).map_err(|err| err.to_string())?;
            submenu.append(&separator).map_err(|err| err.to_string())?;
            continue;
        }
        if let Some(children) = &node.items {
            let child = Submenu::with_id(
                app,
                node.id.clone().unwrap_or_default(),
                node_label(lang, node),
                true,
            )
            .map_err(|err| err.to_string())?;
            fill_submenu(app, &child, children, lang)?;
            submenu.append(&child).map_err(|err| err.to_string())?;
            continue;
        }
        let item = MenuItem::with_id(
            app,
            node.id.clone().unwrap_or_default(),
            node_label(lang, node),
            true,
            None::<&str>,
        )
        .map_err(|err| err.to_string())?;
        submenu.append(&item).map_err(|err| err.to_string())?;
    }
    Ok(())
}

pub fn about_dialog(lang: &str) -> Dialog {
    let cat = catalog(lang);
    let credits = if cat.credits.is_empty() {
        String::new()
    } else {
        format!("\n{}", cat.credits)
    };
    let detail = cat
        .dialog
        .get("aboutDetail")
        .cloned()
        .unwrap_or_default()
        .replace("{pluginCredits}", &credits);
    Dialog {
        title: format!(
            "{}{}",
            cat.dialog
                .get("aboutTitle")
                .map(String::as_str)
                .unwrap_or(""),
            env!("CARGO_PKG_VERSION")
        ),
        message: cat.dialog.get("aboutMessage").cloned().unwrap_or_default(),
        detail: format!(
            "{detail}{}\n\n\n{}:\nOS   - {}\nARCH - {}\n",
            releases_url(),
            cat.dialog
                .get("aboutDebug")
                .map(String::as_str)
                .unwrap_or(""),
            electron_platform(),
            electron_arch()
        ),
        primary: cat
            .dialog
            .get("aboutGithubPrompt")
            .cloned()
            .unwrap_or_default(),
        close: cat
            .dialog
            .get("aboutClosePrompt")
            .cloned()
            .unwrap_or_else(|| "Close".into()),
    }
}

pub fn help_dialog(lang: &str, current: Option<&HashMap<String, Vec<String>>>) -> Dialog {
    let cat = catalog(lang);
    let mut lines = Vec::new();
    for bind in keybinds() {
        let accels = current
            .and_then(|map| map.get(&bind.id))
            .cloned()
            .unwrap_or_else(|| bind.defaults.clone());
        let shown = accels
            .iter()
            .map(|accel| display_accel(accel))
            .collect::<Vec<_>>()
            .join(", ");
        lines.push(format!("{shown} - {}", bind_label(lang, &bind.id)));
    }
    Dialog {
        title: cat
            .dialog
            .get("helpTitle")
            .cloned()
            .unwrap_or_else(|| "Help:".into()),
        message: cat.dialog.get("helpMessage").cloned().unwrap_or_default(),
        detail: lines.join("\n"),
        primary: String::new(),
        close: cat
            .dialog
            .get("helpClosePrompt")
            .cloned()
            .unwrap_or_else(|| "Close".into()),
    }
}

fn bind_label(lang: &str, id: &str) -> String {
    let cat = catalog(lang);
    if let Some(label) = cat.labels.get(id).filter(|value| !value.is_empty()) {
        return label.clone();
    }
    if let Some(node) = find_node(&manifest().menus, id) {
        return node_label(lang, node);
    }
    if let Some(node) = find_node_by_keybind(&manifest().menus, id) {
        return node_label(lang, node);
    }
    id.to_string()
}

fn find_node_by_keybind<'a>(nodes: &'a [MenuNode], id: &str) -> Option<&'a MenuNode> {
    for node in nodes {
        if node_keybind(node) == Some(id) && node.items.is_none() {
            return Some(node);
        }
        if let Some(children) = &node.items {
            if let Some(found) = find_node_by_keybind(children, id) {
                return Some(found);
            }
        }
    }
    None
}

fn node_keybind(node: &MenuNode) -> Option<&str> {
    manifest()
        .keybinds
        .iter()
        .find(|bind| Some(bind.id.as_str()) == node.id.as_deref())
        .map(|bind| bind.id.as_str())
}

fn display_accel(accel: &str) -> String {
    let replacement = if cfg!(target_os = "macos") {
        "Cmd"
    } else {
        "Ctrl"
    };
    accel.replace("CmdOrCtrl", replacement)
}

fn electron_platform() -> &'static str {
    match std::env::consts::OS {
        "windows" => "win32",
        "macos" => "darwin",
        other => other,
    }
}

fn electron_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    }
}

fn string_object(source: &str, export_name: &str) -> HashMap<String, String> {
    export_body(source, export_name)
        .map(parse_strings)
        .unwrap_or_default()
}

fn nested_strings(source: &str, export_name: &str, key: &str) -> HashMap<String, String> {
    export_body(source, export_name)
        .and_then(|body| prop_object(body, key))
        .map(parse_strings)
        .unwrap_or_default()
}

fn export_body<'a>(source: &'a str, export_name: &str) -> Option<&'a str> {
    let marker = format!("exports.{export_name}");
    let start = source.find(&marker)?;
    let rest = &source[start + marker.len()..];
    let offset = rest.find('{')?;
    let open = start + marker.len() + offset;
    let close = matching_brace(source, open)?;
    Some(&source[open + 1..close])
}

fn prop_object<'a>(body: &'a str, key: &str) -> Option<&'a str> {
    let bytes = body.as_bytes();
    let mut i = 0;
    let mut depth: i32 = 0;
    while i < bytes.len() {
        i = skip_ws_and_comments(body, i);
        if i >= bytes.len() {
            break;
        }
        if depth == 0 {
            let (parsed_key, next) = read_key(body, i)?;
            i = skip_ws_and_comments(body, next);
            if bytes.get(i) != Some(&b':') {
                return None;
            }
            i = skip_ws_and_comments(body, i + 1);
            if parsed_key == key && bytes.get(i) == Some(&b'{') {
                let close = matching_brace(body, i)?;
                return Some(&body[i + 1..close]);
            }
        }
        if bytes[i] == b'"' || bytes[i] == b'\'' {
            i = end_string(body, i)?;
            continue;
        }
        match bytes[i] {
            b'{' | b'[' | b'(' => depth += 1,
            b'}' | b']' | b')' => depth = depth.saturating_sub(1),
            _ => {}
        }
        i += 1;
    }
    None
}

fn parse_strings(body: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let bytes = body.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        i = skip_ws_and_comments(body, i);
        if i >= bytes.len() {
            break;
        }
        let Some((key, next)) = read_key(body, i) else {
            break;
        };
        i = skip_ws_and_comments(body, next);
        if bytes.get(i) == Some(&b'(') {
            let Some(end) = skip_method(body, i) else {
                break;
            };
            i = skip_ws_and_comments(body, end);
            if bytes.get(i) == Some(&b',') {
                i += 1;
            }
            continue;
        }
        if bytes.get(i) != Some(&b':') {
            break;
        }
        i = skip_ws_and_comments(body, i + 1);
        if bytes.get(i) == Some(&b'"') || bytes.get(i) == Some(&b'\'') {
            let Some(end) = end_string(body, i) else {
                break;
            };
            let raw = &body[i + 1..end - 1];
            map.insert(key, unescape(raw));
            i = end;
        } else {
            let Some(end) = skip_value(body, i) else {
                break;
            };
            i = end;
        }
        i = skip_ws_and_comments(body, i);
        if bytes.get(i) == Some(&b',') {
            i += 1;
        }
    }
    map
}

fn read_key(body: &str, start: usize) -> Option<(String, usize)> {
    let bytes = body.as_bytes();
    if bytes.get(start) == Some(&b'"') || bytes.get(start) == Some(&b'\'') {
        let end = end_string(body, start)?;
        return Some((unescape(&body[start + 1..end - 1]), end));
    }
    let mut end = start;
    while end < bytes.len() && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'_') {
        end += 1;
    }
    if end == start {
        return None;
    }
    Some((body[start..end].to_string(), end))
}

fn end_string(body: &str, start: usize) -> Option<usize> {
    let bytes = body.as_bytes();
    let quote = bytes.get(start).copied()?;
    let mut i = start + 1;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            i += 2;
            continue;
        }
        if bytes[i] == quote {
            return Some(i + 1);
        }
        i += 1;
    }
    None
}

fn skip_method(body: &str, start: usize) -> Option<usize> {
    let bytes = body.as_bytes();
    let mut i = start;
    let mut depth = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'(' => depth += 1,
            b')' => {
                depth -= 1;
                i += 1;
                if depth == 0 {
                    break;
                }
                continue;
            }
            _ => {}
        }
        i += 1;
    }
    i = skip_ws_and_comments(body, i);
    if bytes.get(i) == Some(&b'{') {
        let close = matching_brace(body, i)?;
        return Some(close + 1);
    }
    Some(i)
}

fn skip_value(body: &str, start: usize) -> Option<usize> {
    let bytes = body.as_bytes();
    let mut i = start;
    let mut depth = 0;
    let mut quote: Option<u8> = None;
    while i < bytes.len() {
        if let Some(q) = quote {
            if bytes[i] == b'\\' {
                i += 2;
                continue;
            }
            if bytes[i] == q {
                quote = None;
            }
            i += 1;
            continue;
        }
        if bytes[i] == b'/' && bytes.get(i + 1) == Some(&b'/') {
            i = skip_line(body, i);
            continue;
        }
        match bytes[i] {
            b'"' | b'\'' => {
                quote = Some(bytes[i]);
                i += 1;
            }
            b'{' | b'[' | b'(' => {
                depth += 1;
                i += 1;
            }
            b'}' | b']' | b')' => {
                if depth == 0 {
                    return Some(i);
                }
                depth -= 1;
                i += 1;
            }
            b',' if depth == 0 => return Some(i),
            _ => i += 1,
        }
    }
    Some(i)
}

fn matching_brace(source: &str, open: usize) -> Option<usize> {
    let bytes = source.as_bytes();
    if bytes.get(open) != Some(&b'{') {
        return None;
    }
    let mut depth = 0;
    let mut i = open;
    let mut quote: Option<u8> = None;
    while i < bytes.len() {
        if let Some(q) = quote {
            if bytes[i] == b'\\' {
                i += 2;
                continue;
            }
            if bytes[i] == q {
                quote = None;
            }
            i += 1;
            continue;
        }
        if bytes[i] == b'/' && bytes.get(i + 1) == Some(&b'/') {
            i = skip_line(source, i);
            continue;
        }
        match bytes[i] {
            b'"' | b'\'' => {
                quote = Some(bytes[i]);
                i += 1;
            }
            b'{' => {
                depth += 1;
                i += 1;
            }
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
                i += 1;
            }
            _ => i += 1,
        }
    }
    None
}

fn skip_ws_and_comments(body: &str, mut i: usize) -> usize {
    let bytes = body.as_bytes();
    loop {
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if bytes.get(i) == Some(&b'/') && bytes.get(i + 1) == Some(&b'/') {
            i = skip_line(body, i);
            continue;
        }
        return i;
    }
}

fn skip_line(body: &str, mut i: usize) -> usize {
    let bytes = body.as_bytes();
    while i < bytes.len() && bytes[i] != b'\n' {
        i += 1;
    }
    i
}

fn unescape(raw: &str) -> String {
    let mut out = String::new();
    let mut chars = raw.chars();
    while let Some(ch) = chars.next() {
        if ch != '\\' {
            out.push(ch);
            continue;
        }
        match chars.next() {
            Some('n') => out.push('\n'),
            Some('r') => out.push('\r'),
            Some('t') => out.push('\t'),
            Some('\\') => out.push('\\'),
            Some('"') => out.push('"'),
            Some('\'') => out.push('\''),
            Some(other) => out.push(other),
            None => out.push('\\'),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_useful_page_url_is_visited() {
        let pages = useful_pages();
        let mut seen = BTreeSet::new();
        for page in &pages {
            let parsed = accept_site(&page.url).unwrap_or_else(|err| panic!("{}: {err}", page.url));
            let host = parsed.host_str().unwrap();
            assert!(!crate::ads::host_blocked(host), "{host}");
            let en = menu_label("en-US", &page.label_key, "");
            let pt = menu_label("pt-BR", &page.label_key, "");
            assert!(!en.is_empty(), "{}", page.id);
            assert!(!pt.is_empty(), "{}", page.id);
            seen.insert(page.url.clone());
        }
        let expected: BTreeSet<String> = [
            "https://aqwwiki.wikidot.com/new-releases",
            "https://www.aq.com/gamedesignnotes/",
            "https://www.aq.com/gamedesignnotes/AQW-Balance-PatchNotes-9515",
            "https://account.aq.com/",
            "https://account.aq.com/CharPage",
            "https://www.aq.com/lore/dailygifts",
            "https://www.aq.com/lore/calendar",
            "https://www.aq.com/lore/guides/enhancementtraits",
            "https://www.heromart.com/",
            "https://portal.battleon.com/",
            "https://twitter.com/Alina_AE",
            "https://www.reddit.com/r/AQW/",
        ]
        .into_iter()
        .map(str::to_string)
        .collect();
        assert_eq!(seen, expected);
        assert_eq!(menu_label("en-US", "menuWiki", ""), "AQW Wiki");
        assert_eq!(menu_label("en-US", "menuOtherPages", ""), "Usefull Pages");
        assert_eq!(menu_label("en-US", "menuPreferences", ""), "Preferences");
        assert_eq!(menu_label("pt-BR", "menuPreferences", ""), "Preferências");
        assert_eq!(menu_label("pt-BR", "menuDailyGifts", ""), "Drops Diários");
        assert!(accept_site("http://www.aq.com/lore/calendar").is_err());
        assert!(accept_site("https://aqwwiki.wikidot.com/new-releases").is_ok());
        assert!(accept_site("https://aqwwiki.wikidot.com/search:site/q/sword").is_ok());
        let about = about_dialog("en-US");
        assert!(about.title.contains(env!("CARGO_PKG_VERSION")));
        assert!(about.title.contains("About AquaStar NEO Version:"));
        assert!(about.detail.contains("133spider (AQLite)"));
        assert!(about.detail.contains(releases_url()));
        assert_eq!(charpage_url(""), "https://account.aq.com/CharPage");
        assert_eq!(
            charpage_url("Yulgar!"),
            "https://account.aq.com/CharPage?id=Yulgar"
        );
    }

    #[test]
    fn obsolete_web_shortcuts_are_removed_but_game_launches_and_wiki_remain() {
        let bindings = keybinds();
        let ids: Vec<&str> = bindings.iter().map(|bind| bind.id.as_str()).collect();
        for removed in [
            "about",
            "fullscreen",
            "forward",
            "backward",
            "reload",
            "reloadCache",
        ] {
            assert!(!ids.contains(&removed), "{removed} still has a shortcut");
        }
        assert!(bindings
            .iter()
            .any(|bind| bind.id == "help" && bind.defaults == ["Alt+H"]));
        assert!(bindings
            .iter()
            .any(|bind| bind.id == "wiki" && bind.defaults == ["Alt+W"]));
        assert!(bindings
            .iter()
            .any(|bind| bind.id == "newAqw" && bind.defaults == ["Alt+N"]));
        assert!(bindings.iter().any(|bind| bind.id == "dragon"));
        for removed in ["back", "forward", "reload", "reloadCache", "about"] {
            assert!(
                find_node(&manifest().menus, removed).is_none(),
                "{removed} remains in the menu"
            );
        }
        assert!(find_node(&manifest().menus, "help").is_some());
        assert!(find_node(&manifest().menus, "fullscreen").is_some());
    }

    #[test]
    fn help_close_button_uses_the_selected_locale() {
        assert_eq!(help_dialog("en-US", None).close, "Close");
        assert_eq!(help_dialog("pt-BR", None).close, "Fechar");
    }

    #[test]
    fn package_does_not_restore_character_page_printing() {
        let needles = [format!("{}{}", "Alt+", "K"), format!("{}{}", "cp", "Sshot")];
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let mut files = Vec::new();
        for rel in [
            "src",
            "../ui",
            "games",
            "permissions",
            "capabilities",
            "assets",
        ] {
            collect_files(&root.join(rel), &mut files);
        }
        files.push(root.join("Cargo.toml"));
        files.push(root.join("tauri.conf.json"));
        for path in &files {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let _ = name;
            let Ok(bytes) = std::fs::read(path) else {
                continue;
            };
            let Ok(text) = String::from_utf8(bytes) else {
                continue;
            };
            for needle in &needles {
                assert!(
                    !text.contains(needle),
                    "{} contains {needle}",
                    path.display()
                );
            }
        }
        let banned_ids = [format!("{}{}", "cp", "Sshot")];
        let banned_accel = format!("{}{}", "Alt+", "K");
        for bind in keybinds() {
            assert!(!banned_ids.iter().any(|id| id == &bind.id), "{}", bind.id);
            assert!(!bind.defaults.iter().any(|accel| accel == &banned_accel));
        }
        let help = help_dialog("en-US", None);
        for needle in &needles {
            assert!(!help.detail.contains(needle));
            assert!(!help.message.contains(needle));
        }
        let permissions = std::fs::read_to_string(root.join("permissions/app.toml")).unwrap();
        assert!(permissions.contains("capture_start"));
    }

    fn collect_files(path: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
        if path.file_name().and_then(|n| n.to_str()) == Some("target") {
            return;
        }
        if path.is_file() {
            out.push(path.to_path_buf());
            return;
        }
        let Ok(entries) = std::fs::read_dir(path) else {
            return;
        };
        for entry in entries.flatten() {
            collect_files(&entry.path(), out);
        }
    }
}
