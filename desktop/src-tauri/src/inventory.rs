//! Account inventory and wiki hover. Sync uses the account window's cookies and
//! writes `aquastar_inventory.json` in the same shape Electron writes.

use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde_json::{Map, Value};

use crate::profile::ProfileFiles;

const INVENTORY_MESSAGES: &str = include_str!("../assets/inventory-messages.json");
const WIKI_MESSAGES: &str = include_str!("../assets/wiki-messages.json");
const PAGE_SIZE: usize = 100;
const MAX_WIKI_BYTES: usize = 5 * 1024 * 1024;
const AUTO_SYNC_MS: i64 = 2 * 60 * 60 * 1000;

const SUFFIXES: &[&str] = &[
    "",
    " (AC)",
    " (0 AC)",
    " (Rare)",
    " (Merge)",
    " (Class)",
    " (Quest)",
    " (Sword)",
    " (Pet)",
];
const NAME_OVERRIDE: (&str, &str) = ("legion doomknight", " (Class) (Merge) (1)");
const PAGE_OVERRIDE: (&str, &str) = ("???", "3-question-marks-misc-2");

const ALIASES: &[(&str, &str)] = &[
    ("trig buster", "Unidentified 1"),
    ("sharkbait's true head", "Unidentified 2"),
    ("dragon bone hammer", "Unidentified 3"),
    ("small hammer", "Unidentified 4"),
    ("rounded stone hammer", "Unidentified 5"),
    ("parasitic hacker", "Unidentified 6"),
    ("star dagger", "Unidentified 7"),
    ("bee sting dagger", "Unidentified 8"),
    ("ordinary iron wing helm", "Unidentified 9"),
    ("bag of dirt", "Unidentified 10"),
    ("bone walking cane", "Unidentified 12"),
    ("the contract of nulgath", "Unidentified 13"),
    ("worn axe", "Unidentified 14"),
    ("emblem mace", "Unidentified 15"),
    ("iron plate hammer", "Unidentified 16"),
    ("duck on a stick", "Unidentified 17"),
    ("dark cyclops face", "Unidentified 18"),
    ("koi fish in a sphere", "Unidentified 19"),
    ("dragonbone blade", "Unidentified 20"),
    ("dragonbone axe", "Unidentified 21"),
    ("essence of the hex void", "Unidentified 22"),
    ("essence of the blood void", "Unidentified 23"),
    ("essence of the void fiend", "Unidentified 24"),
    ("essence of the shadow void", "Unidentified 25"),
    ("ordinary cape", "Unidentified 26"),
    ("chameleon cape", "Unidentified 27"),
    ("spinal tap", "Unidentified 28"),
    ("mysterious walking cane", "Unidentified 29"),
    ("platinum twin blade", "Unidentified 30"),
    ("platinum battle shank", "Unidentified 31"),
    ("cruel dagger of nulgath", "Unidentified 32"),
    ("primal dagger tooth", "Unidentified 33"),
    ("ball of malignant essence", "Unidentified 34"),
    ("essence of the almighty archfiend", "Unidentified 35"),
    ("the contract of lae", "Unidentified 36"),
    ("bone slasher", "Unidentified 65"),
    ("tyrant bone slasher", "Unidentified 66"),
];

pub fn inventory_messages() -> Value {
    serde_json::from_str(INVENTORY_MESSAGES).unwrap_or(Value::Null)
}
pub fn wiki_messages() -> Value {
    serde_json::from_str(WIKI_MESSAGES).unwrap_or(Value::Null)
}

pub fn document(files: &ProfileFiles) -> Value {
    serde_json::json!({
        "data": load_book(&files.inventory),
        "savePath": files.inventory.display().to_string()
    })
}

pub fn save_labels(files: &ProfileFiles, labels: &Value) -> Value {
    let mut book = load_book(&files.inventory);
    book["labels"] = migrate_labels(labels);
    let _ = write_pretty(&files.inventory, &book);
    serde_json::json!({ "labels": book["labels"] })
}

pub fn set_active_char(files: &ProfileFiles, char_id: &str) -> Value {
    let mut book = load_book(&files.inventory);
    book["lastActiveCharId"] = Value::String(char_id.to_string());
    let _ = write_pretty(&files.inventory, &book);
    serde_json::json!({ "ok": true })
}

pub fn sync_locked(path: &Path, fetch: impl Fn(&str) -> Result<String, String>) -> Value {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    let lock = LOCK.get_or_init(|| Mutex::new(()));
    let _guard = lock.lock().unwrap_or_else(|err| err.into_inner());
    sync_document(path, fetch)
}

pub fn sync_document(path: &Path, fetch: impl Fn(&str) -> Result<String, String>) -> Value {
    let home = match fetch("https://account.aq.com/Home") {
        Ok(body) => body,
        Err(_) => return fail("network"),
    };
    let Some(name) = capture(&home, r#"<span class="small fw-bold ml-1 ms-lg-3">([^<]+)</span>"#) else {
        return fail("unauthenticated");
    };
    let name = name.trim().to_string();
    let char_page = match fetch(&format!(
        "https://account.aq.com/CharPage?id={}",
        urlencoding_name(&name)
    )) {
        Ok(body) => body,
        Err(_) => return fail("network"),
    };
    let Some(ccid) = capture(&char_page, r"var ccid = (\d+);") else {
        return fail("parse");
    };
    let inventory = match load_collection(
        "/AQW/InventoryData",
        "https://account.aq.com/myapi/inventory/InventoryData?",
        &fetch,
    ) {
        Ok(rows) => rows,
        Err(error) => return fail(&error),
    };
    let buyback = match fetch_pages(
        "https://account.aq.com/myapi/inventory/BuyBackData?",
        &fetch,
    ) {
        Ok(rows) => rows,
        Err(error) => return fail(&error),
    };
    let inventory: Vec<Value> = inventory
        .iter()
        .map(convert_inventory_row)
        .filter(|row| named(row))
        .collect();
    let buyback: Vec<Value> = buyback
        .iter()
        .map(convert_buyback_row)
        .filter(|row| named(row))
        .collect();
    if inventory.is_empty() && buyback.is_empty() {
        return fail("empty");
    }
    let mut book = load_book(path);
    let existing = book["characters"].get(&ccid).cloned();
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let wheel = existing
        .as_ref()
        .and_then(|character| character.get("wheel").cloned())
        .filter(Value::is_array)
        .unwrap_or(serde_json::json!([]));
    let last_wheel = existing
        .as_ref()
        .and_then(|character| character.get("lastWheelSync").cloned())
        .unwrap_or(Value::Null);
    let character = migrate_character(
        &ccid,
        &serde_json::json!({
            "name": name,
            "lastInventorySync": now,
            "lastBuyBackSync": now,
            "lastWheelSync": last_wheel,
            "inventory": inventory,
            "buyback": buyback,
            "wheel": wheel
        }),
    );
    book["characters"]
        .as_object_mut()
        .unwrap()
        .insert(ccid.clone(), character);
    book["lastActiveCharId"] = Value::String(ccid.clone());
    if write_pretty(path, &book).is_err() {
        return fail("network");
    }
    serde_json::json!({
        "ok": true,
        "charId": ccid.parse::<u64>().unwrap_or(0),
        "charName": name,
        "syncedAt": now
    })
}

pub fn live_get(url: &str, cookie: &str) -> Result<String, String> {
    let mut request = ureq::get(url).timeout(Duration::from_secs(20));
    if url.contains("account.aq.com") {
        request = request
            .set(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36",
            )
            .set("artixmode", "launcher");
        if !cookie.is_empty() {
            request = request.set("Cookie", cookie);
        }
        if url.contains("InventoryData") || url.contains("BuyBackData") {
            request = request
                .set("Accept", "application/json, text/javascript, */*; q=0.01")
                .set("X-Requested-With", "XMLHttpRequest");
        }
    }
    match request.call() {
        Ok(response) => read_limited(response, MAX_WIKI_BYTES),
        Err(ureq::Error::Status(code, _)) if url.contains("aqwwiki.wikidot.com") => {
            Err(format!("http-{code}"))
        }
        Err(_) => Err("network".into()),
    }
}

pub fn fetch_wiki(url: &str, fetch: impl Fn(&str) -> Result<String, String>) -> Value {
    if !wiki_url_allowed(url) {
        return serde_json::json!({ "ok": false, "error": "blocked" });
    }
    match fetch(url) {
        Ok(html) => serde_json::json!({ "ok": true, "html": html }),
        Err(error) => serde_json::json!({ "ok": false, "error": error }),
    }
}

pub fn wiki_url_allowed(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    (lower.starts_with("https://aqwwiki.wikidot.com/") || lower.starts_with("http://aqwwiki.wikidot.com/"))
        && !lower.contains('@')
}

pub fn item_image_srcs(html: &str) -> Vec<String> {
    let Some(content) = between(html, "id=\"page-content\"", None).or_else(|| between(html, "id='page-content'", None))
    else {
        return Vec::new();
    };
    let mut srcs = Vec::new();
    let mut rest = content.as_str();
    while let Some(start) = rest.to_ascii_lowercase().find("<img") {
        rest = &rest[start + 4..];
        let end = rest.find('>').unwrap_or(rest.len());
        let tag = &rest[..end];
        rest = &rest[end..];
        let Some(src) = attr(tag, "src") else { continue };
        if src_blocked(&src) {
            continue;
        }
        srcs.push(src);
        break;
    }
    srcs
}

pub fn match_title(files: &ProfileFiles, title: &str) -> Value {
    let book = load_book(&files.inventory);
    let char_id = book["lastActiveCharId"].as_str().unwrap_or("");
    match_in_book(&book, title, char_id)
}

pub fn match_titles(files: &ProfileFiles, titles: &[String]) -> Value {
    let book = load_book(&files.inventory);
    let char_id = book["lastActiveCharId"].as_str().unwrap_or("").to_string();
    let mut out = Map::new();
    for title in titles.iter().take(500) {
        out.insert(title.clone(), match_in_book(&book, title, &char_id));
    }
    Value::Object(out)
}

pub fn item_counts(files: &ProfileFiles, names: &[String]) -> Value {
    let names: Vec<&str> = names.iter().take(200).map(String::as_str).collect();
    let mut counts = Map::new();
    for name in &names {
        counts.insert((*name).to_string(), serde_json::json!({ "characters": [] }));
    }
    let book = load_book(&files.inventory);
    let Some(characters) = book.get("characters").and_then(Value::as_object) else {
        return Value::Object(counts);
    };
    for (char_id, character) in characters {
        let char_name = character.get("name").and_then(Value::as_str).unwrap_or("");
        let label = if char_name.is_empty() {
            format!("Character {char_id}")
        } else {
            char_name.to_string()
        };
        let mut per_name: Vec<(i64, i64)> = names.iter().map(|_| (0, 0)).collect();
        if let Some(items) = character.get("inventory").and_then(Value::as_array) {
            for item in items {
                let item_name = item.get("name").and_then(Value::as_str).unwrap_or("");
                let normalized = normalize(item_name);
                let Some(index) = names.iter().position(|name| normalize(name) == normalized) else {
                    continue;
                };
                let member = item.get("member") == Some(&Value::Bool(true));
                let coins = item.get("coins") == Some(&Value::Bool(true));
                if member || (coins && normalized != normalize("Dark Potion")) {
                    continue;
                }
                let count = item.get("count").and_then(Value::as_i64).unwrap_or(0);
                if item.get("bank") == Some(&Value::Bool(true)) {
                    per_name[index].1 += count;
                } else {
                    per_name[index].0 += count;
                }
            }
        }
        for (index, name) in names.iter().enumerate() {
            let (inventory, bank) = per_name[index];
            if let Some(list) = counts
                .get_mut(*name)
                .and_then(|entry| entry.get_mut("characters"))
                .and_then(Value::as_array_mut)
            {
                list.push(serde_json::json!({
                    "id": char_id,
                    "name": label,
                    "inventory": inventory,
                    "bank": bank
                }));
            }
        }
    }
    Value::Object(counts)
}

pub fn wiki_slug(name: &str) -> String {
    let normalized = normalize(name);
    if normalized == PAGE_OVERRIDE.0 {
        return PAGE_OVERRIDE.1.to_string();
    }
    normalized
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

pub fn auto_sync_enabled(files: &ProfileFiles) -> bool {
    let mut enabled = false;
    for path in &files.settings_files {
        let Some(value) = read_json(path) else { continue };
        if let Some(flag) = value.get("autoSync").and_then(Value::as_bool) {
            enabled = flag;
        }
        if let Some(flag) = value
            .pointer("/plugins/adventure-quest-worlds/autoSync")
            .and_then(Value::as_bool)
        {
            enabled = flag;
        }
    }
    enabled
}

pub fn auto_sync_due(path: &Path, now_ms: i64) -> bool {
    let book = load_book(path);
    let Some(characters) = book.get("characters").and_then(Value::as_object) else {
        return true;
    };
    if characters.is_empty() {
        return true;
    }
    let latest = characters.values().filter_map(|character| {
        character
            .get("lastInventorySync")
            .and_then(Value::as_str)
            .and_then(|text| chrono::DateTime::parse_from_rfc3339(text).ok())
            .map(|time| time.timestamp_millis())
    }).max().unwrap_or(0);
    now_ms - latest >= AUTO_SYNC_MS
}

pub fn page_kind(url: &str) -> &'static str {
    let lower = url.to_ascii_lowercase();
    if lower.contains("aqwwiki.wikidot.com/") && wiki_has_path(&lower) {
        return "wiki";
    }
    if lower.contains("account.aq.com/charpage?id=") && charpage_has_id(&lower) {
        return "charpage";
    }
    if lower.contains("account.aq.com/aqw/inventory")
        || lower.contains("account.aq.com/aqw/buyback")
        || lower.contains("account.aq.com/aqw/wheelprogress")
        || lower.contains("account.aq.com/aqw/house")
    {
        return "account-aqw";
    }
    if lower.contains("://account.aq.com/login") {
        return "account-login";
    }
    if lower.contains("://account.aq.com") {
        return "account";
    }
    "other"
}

pub fn page_script(url: &str) -> String {
    let kind = page_kind(url);
    if matches!(kind, "wiki" | "charpage" | "account-aqw") {
        let mut script = String::from(WIKI_BRIDGE);
        script.push('\n');
        if kind == "wiki" {
            script.push_str(include_str!("../../ui/wiki/jquery.min.js"));
            script.push_str("\n;\n");
        }
        script.push_str(include_str!("../../ui/wiki/nameVariants.js"));
        script.push_str("\n;\n");
        script.push_str(include_str!("../../ui/wiki/hoverPreview.js"));
        script.push_str("\n;\n");
        script.push_str(include_str!("../../ui/wiki/wikiviewsource.js"));
        let mut wrapped = String::from("(function(){if(window.__aquastarWikiViewInjected)return false;try{\n");
        wrapped.push_str(&script);
        wrapped.push_str("\nwindow.__aquastarWikiViewInjected=true;return true;}catch(error){delete window.__aquastarWikiViewInjected;throw error;}})();");
        return wrapped;
    }
    if kind == "account" {
        let mut script = String::from(WIKI_BRIDGE);
        script.push('\n');
        script.push_str(include_str!("../../ui/wiki/accountSyncButton.js"));
        return script;
    }
    String::new()
}

const WIKI_BRIDGE: &str = r#"(function(){if(!window.__TAURI__||!window.__TAURI__.core)return;var invoke=window.__TAURI__.core.invoke;window.aquastarWiki=window.aquastarWiki||{fetchWikiPage:function(url){return invoke('fetch_wiki_page',{url:url});},getMessages:function(){return invoke('get_wiki_messages');},syncInventoryNow:function(){return invoke('sync_inventory_now');},getInventory:function(){return invoke('get_inventory');},setInventoryActiveChar:function(charId){return invoke('set_inventory_active_char',{char_id:charId});},matchWikiItem:function(title){return invoke('match_wiki_item',{title:title});},matchWikiItems:function(titles){return invoke('match_wiki_items',{titles:titles});}};})();"#;

fn wiki_has_path(lower: &str) -> bool {
    lower.split("aqwwiki.wikidot.com/").nth(1).is_some_and(|rest| !rest.is_empty() && rest != "/")
}

fn charpage_has_id(lower: &str) -> bool {
    lower.split("charpage?id=").nth(1).is_some_and(|rest| !rest.is_empty() && !rest.starts_with('&'))
}

fn fail(error: &str) -> Value {
    serde_json::json!({ "ok": false, "error": error })
}

fn named(row: &Value) -> bool {
    row.get("name")
        .and_then(Value::as_str)
        .is_some_and(|name| !name.trim().is_empty())
}

fn load_collection(
    fresh_path: &str,
    legacy_base: &str,
    fetch: &impl Fn(&str) -> Result<String, String>,
) -> Result<Vec<Value>, String> {
    match account_collection(fresh_path, fetch) {
        Ok(rows) if !rows.is_empty() => Ok(rows),
        fresh => match fetch_pages(legacy_base, fetch) {
            Ok(legacy) if !legacy.is_empty() => Ok(legacy),
            Ok(_) => fresh,
            Err(error) => fresh.or(Err(error)),
        },
    }
}

fn account_collection(path: &str, fetch: &impl Fn(&str) -> Result<String, String>) -> Result<Vec<Value>, String> {
    let mut items = Vec::new();
    let mut skip = 0usize;
    loop {
        let stamp = chrono::Utc::now().timestamp_millis();
        let url = if skip == 0 {
            format!("https://account.aq.com{path}?_={stamp}")
        } else {
            format!("https://account.aq.com{path}?skip={skip}&take={PAGE_SIZE}&requireTotalCount=true&_={stamp}")
        };
        let body = fetch(&url)?;
        let parsed: Value = serde_json::from_str(&body).map_err(|_| "unauthenticated".to_string())?;
        let Some(data) = parsed.get("data").and_then(Value::as_array).cloned() else {
            return Err("unauthenticated".into());
        };
        let total = parsed
            .get("totalCount")
            .or_else(|| parsed.get("total"))
            .and_then(Value::as_i64);
        let len = data.len();
        items.extend(data);
        let complete = total.map(|count| items.len() as i64 >= count).unwrap_or(true);
        if complete || len == 0 || skip > 20000 {
            break;
        }
        skip += len.max(1);
    }
    Ok(items)
}

fn fetch_pages(base: &str, fetch: &impl Fn(&str) -> Result<String, String>) -> Result<Vec<Value>, String> {
    let mut items = Vec::new();
    let mut skip = 0usize;
    loop {
        let stamp = chrono::Utc::now().timestamp_millis();
        let url = format!("{base}&skip={skip}&take={PAGE_SIZE}&requireTotalCount=true&_={stamp}");
        let body = fetch(&url)?;
        let parsed: Value = serde_json::from_str(&body).map_err(|_| "unauthenticated".to_string())?;
        let Some(data) = parsed.get("data").and_then(Value::as_array).cloned() else {
            return Err("unauthenticated".into());
        };
        let len = data.len();
        items.extend(data);
        if len < PAGE_SIZE || skip > 20000 {
            break;
        }
        skip += PAGE_SIZE;
    }
    Ok(items)
}

fn convert_inventory_row(row: &Value) -> Value {
    if let Some(cells) = row.as_array() {
        return convert_inventory_cells(cells);
    }
    serde_json::json!({
        "id": finite_i64(row.get("ID")),
        "name": row.get("Name").and_then(Value::as_str).unwrap_or(""),
        "type": row.get("Type").and_then(Value::as_str).unwrap_or(""),
        "count": finite_i64(row.get("Count")).unwrap_or(0),
        "bank": flag(row.get("Bank")),
        "coins": flag(row.get("Coins")),
        "member": flag(row.get("Member")),
        "added": to_iso(row.get("Added").and_then(Value::as_str))
    })
}

fn convert_inventory_cells(cells: &[Value]) -> Value {
    let type_name = cell_str(cells, 1);
    let (name, count) = split_stack(cell_str(cells, 0), type_name);
    serde_json::json!({
        "id": cell_i64(cells, 2),
        "name": name,
        "type": type_name,
        "count": count,
        "bank": cell_str(cells, 3).eq_ignore_ascii_case("bank"),
        "coins": cell_str(cells, 4).eq_ignore_ascii_case("ac"),
        "member": cell_str(cells, 5).eq_ignore_ascii_case("member"),
        "added": to_iso(cells.get(6).and_then(Value::as_str))
    })
}

fn cell_str(cells: &[Value], index: usize) -> &str {
    cells.get(index).and_then(Value::as_str).unwrap_or("")
}

fn cell_i64(cells: &[Value], index: usize) -> Option<i64> {
    let cell = cells.get(index)?;
    finite_i64(Some(cell)).or_else(|| cell.as_str().and_then(|text| text.parse().ok()))
}

fn split_stack(raw: &str, type_name: &str) -> (String, i64) {
    let stackable = matches!(
        type_name,
        "Item" | "Resource" | "Quest Item" | "Wall Item" | "Floor Item"
    );
    if stackable {
        if let Some(index) = raw.rfind(" x") {
            let digits = &raw[index + 2..];
            if !digits.is_empty() && digits.chars().all(|ch| ch.is_ascii_digit()) {
                if let Ok(count) = digits.parse::<i64>() {
                    return (raw[..index].to_string(), count);
                }
            }
        }
    }
    (raw.to_string(), 1)
}

fn convert_buyback_row(row: &Value) -> Value {
    serde_json::json!({
        "itemId": finite_i64(row.get("AQW_ItemID")),
        "name": row.get("strName").and_then(Value::as_str).unwrap_or(""),
        "type": row.get("strType").and_then(Value::as_str).unwrap_or(""),
        "cost": finite_i64(row.get("intCost")).unwrap_or(0),
        "amount": finite_i64(row.get("intAmount")).unwrap_or(0),
        "inserted": to_iso(row.get("dateInsert").and_then(Value::as_str)),
        "typeId": finite_i64(row.get("AQW_TypeID")),
        "rarity": finite_i64(row.get("intRarity")),
        "rarityName": row.get("sRarityName").and_then(Value::as_str).unwrap_or("")
    })
}

fn flag(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(true)) => true,
        Some(Value::Number(number)) => number.as_i64() == Some(1),
        _ => false,
    }
}

fn finite_i64(value: Option<&Value>) -> Option<i64> {
    value.and_then(Value::as_i64).or_else(|| value.and_then(Value::as_f64).map(|n| n as i64))
}

fn to_iso(value: Option<&str>) -> Value {
    let Some(value) = value.filter(|text| !text.is_empty()) else {
        return Value::Null;
    };
    if let Some(rest) = value.strip_prefix("/Date(") {
        let digits: String = rest.chars().take_while(|ch| ch.is_ascii_digit() || *ch == '-').collect();
        if let Ok(ms) = digits.parse::<i64>() {
            if let Some(time) = chrono::DateTime::from_timestamp_millis(ms) {
                return Value::String(time.to_rfc3339_opts(chrono::SecondsFormat::Millis, true));
            }
        }
        return Value::Null;
    }
    match chrono::DateTime::parse_from_rfc3339(value) {
        Ok(time) => Value::String(time.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
        Err(_) => Value::Null,
    }
}

fn epoch_ms(value: &Value) -> i64 {
    value
        .as_str()
        .and_then(|text| chrono::DateTime::parse_from_rfc3339(text).ok())
        .map(|time| time.timestamp_millis())
        .unwrap_or(0)
}

fn load_book(path: &Path) -> Value {
    let Some(parsed) = read_json(path) else {
        return empty_book();
    };
    let raw_chars = parsed.get("characters").and_then(Value::as_object).cloned().unwrap_or_default();
    let mut characters = Map::new();
    for (char_id, raw) in raw_chars {
        characters.insert(char_id.clone(), migrate_character(&char_id, &raw));
    }
    serde_json::json!({
        "characters": characters,
        "lastActiveCharId": parsed.get("lastActiveCharId").and_then(Value::as_str).unwrap_or(""),
        "labels": migrate_labels(parsed.get("labels").unwrap_or(&Value::Null))
    })
}

fn empty_book() -> Value {
    serde_json::json!({
        "characters": {},
        "lastActiveCharId": "",
        "labels": migrate_labels(&Value::Null)
    })
}

fn migrate_character(char_id: &str, raw: &Value) -> Value {
    let inventory = raw
        .get("inventory")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|item| migrate_item(&item))
        .collect::<Vec<_>>();
    let buyback = raw
        .get("buyback")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|item| migrate_buyback(&item))
        .collect::<Vec<_>>();
    serde_json::json!({
        "charId": char_id.parse::<i64>().unwrap_or(0),
        "name": raw.get("name").and_then(Value::as_str),
        "lastInventorySync": raw.get("lastInventorySync").and_then(Value::as_str),
        "lastBuyBackSync": raw.get("lastBuyBackSync").and_then(Value::as_str),
        "lastWheelSync": raw.get("lastWheelSync").and_then(Value::as_str),
        "inventory": inventory,
        "buyback": buyback,
        "wheel": raw.get("wheel").cloned().filter(Value::is_array).unwrap_or(serde_json::json!([]))
    })
}

fn migrate_item(raw: &Value) -> Value {
    let name = raw.get("name").and_then(Value::as_str).unwrap_or("").trim_start();
    let added = raw.get("added").and_then(Value::as_str);
    serde_json::json!({
        "id": finite_i64(raw.get("id")),
        "name": name,
        "type": raw.get("type").and_then(Value::as_str).unwrap_or(""),
        "count": finite_i64(raw.get("count")).unwrap_or(0),
        "bank": raw.get("bank") == Some(&Value::Bool(true)),
        "coins": raw.get("coins") == Some(&Value::Bool(true)),
        "member": raw.get("member") == Some(&Value::Bool(true)),
        "added": added,
        "searchName": name.to_lowercase(),
        "sortName": name.to_lowercase(),
        "addedAt": added.map(|text| epoch_ms(&Value::String(text.to_string()))).unwrap_or(0)
    })
}

fn migrate_buyback(raw: &Value) -> Value {
    let name = raw.get("name").and_then(Value::as_str).unwrap_or("").trim_start();
    let inserted = raw.get("inserted").and_then(Value::as_str);
    serde_json::json!({
        "itemId": finite_i64(raw.get("itemId")),
        "name": name,
        "type": raw.get("type").and_then(Value::as_str).unwrap_or(""),
        "cost": finite_i64(raw.get("cost")).unwrap_or(0),
        "amount": finite_i64(raw.get("amount")).unwrap_or(0),
        "inserted": inserted,
        "typeId": finite_i64(raw.get("typeId")),
        "rarity": finite_i64(raw.get("rarity")),
        "rarityName": raw.get("rarityName").and_then(Value::as_str).unwrap_or(""),
        "searchName": name.to_lowercase(),
        "sortName": name.to_lowercase(),
        "insertedAt": inserted.map(|text| epoch_ms(&Value::String(text.to_string()))).unwrap_or(0)
    })
}

fn migrate_labels(raw: &Value) -> Value {
    let valid = |value: Option<&str>| {
        value
            .filter(|text| text.len() == 7 && text.starts_with('#') && text[1..].chars().all(|ch| ch.is_ascii_hexdigit()))
            .unwrap_or("#4da3ff")
            .to_string()
    };
    let tags = raw
        .get("tags")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|tag| {
            let name = tag.get("name").and_then(Value::as_str).unwrap_or("").trim().to_string();
            if name.is_empty() {
                return None;
            }
            let scope = match tag.get("scope").and_then(Value::as_str) {
                Some("global") => "global",
                _ => "character",
            };
            Some(serde_json::json!({
                "id": tag.get("id").and_then(Value::as_str).unwrap_or("label_kept"),
                "name": name,
                "color": valid(tag.get("color").and_then(Value::as_str)),
                "scope": scope
            }))
        })
        .collect::<Vec<_>>();
    serde_json::json!({
        "tags": tags,
        "globalItemLabels": raw.get("globalItemLabels").cloned().filter(Value::is_object).unwrap_or(serde_json::json!({})),
        "characterItemLabels": raw.get("characterItemLabels").cloned().filter(Value::is_object).unwrap_or(serde_json::json!({}))
    })
}

fn match_in_book(book: &Value, title: &str, char_id: &str) -> Value {
    let empty = serde_json::json!({ "owned": false, "bank": 0, "inventory": 0, "buyback": 0, "matchedName": null });
    let character = book.get("characters").and_then(|chars| chars.get(char_id));
    let Some(character) = character else { return empty };
    let displayed = wiki_base_name(title);
    let target = ALIASES
        .iter()
        .find(|(key, _)| *key == displayed)
        .map(|(_, value)| normalize(value))
        .unwrap_or(displayed);
    if target.is_empty() {
        return empty;
    }
    let mut bank = 0i64;
    let mut inventory = 0i64;
    let mut buyback = 0i64;
    let mut matched = None;
    if let Some(items) = character.get("inventory").and_then(Value::as_array) {
        for item in items {
            let name = item.get("name").and_then(Value::as_str).unwrap_or("");
            if !name_matches(name, &target) {
                continue;
            }
            matched = matched.or_else(|| Some(name.to_string()));
            let count = item.get("count").and_then(Value::as_i64).unwrap_or(0);
            if item.get("bank") == Some(&Value::Bool(true)) {
                bank += count;
            } else {
                inventory += count;
            }
        }
    }
    if let Some(items) = character.get("buyback").and_then(Value::as_array) {
        for item in items {
            let name = item.get("name").and_then(Value::as_str).unwrap_or("");
            if !name_matches(name, &target) {
                continue;
            }
            matched = matched.or_else(|| Some(name.to_string()));
            buyback += 1;
        }
    }
    serde_json::json!({
        "owned": bank + inventory + buyback > 0,
        "bank": bank,
        "inventory": inventory,
        "buyback": buyback,
        "matchedName": matched
    })
}

fn name_matches(inventory_name: &str, target: &str) -> bool {
    let normalized = normalize(inventory_name);
    suffixes_for(target).iter().any(|suffix| normalized == format!("{target}{}", suffix.to_lowercase()))
}

fn suffixes_for(target: &str) -> Vec<String> {
    let mut suffixes: Vec<String> = SUFFIXES.iter().map(|suffix| (*suffix).to_string()).collect();
    if target == NAME_OVERRIDE.0 {
        suffixes.push(NAME_OVERRIDE.1.to_string());
    }
    suffixes
}

fn wiki_base_name(name: &str) -> String {
    let normalized = normalize(name);
    let mut known: Vec<&str> = SUFFIXES.to_vec();
    known.push(NAME_OVERRIDE.1);
    known.sort_by_key(|suffix| std::cmp::Reverse(suffix.len()));
    let Some(suffix) = known.into_iter().find(|suffix| !suffix.is_empty() && normalized.ends_with(&suffix.to_lowercase())) else {
        return normalized;
    };
    normalized[..normalized.len() - suffix.len()].trim().to_string()
}

fn normalize(name: &str) -> String {
    name.trim().to_lowercase()
}

fn capture(text: &str, pattern: &str) -> Option<String> {
    let regex = regex_lite(pattern);
    regex(text)
}

fn regex_lite(pattern: &str) -> impl Fn(&str) -> Option<String> {
    let pattern = pattern.to_string();
    move |text: &str| {
        if pattern.contains(r"var ccid = (\d+)") || pattern == r"var ccid = (\d+);" {
            let marker = "var ccid = ";
            let start = text.find(marker)? + marker.len();
            let digits: String = text[start..].chars().take_while(|ch| ch.is_ascii_digit()).collect();
            return (!digits.is_empty()).then_some(digits);
        }
        let marker = r#"<span class="small fw-bold ml-1 ms-lg-3">"#;
        let start = text.find(marker)? + marker.len();
        let end = text[start..].find('<')? + start;
        Some(text[start..end].to_string())
    }
}

fn urlencoding_name(name: &str) -> String {
    let mut out = String::new();
    for byte in name.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

fn read_limited(response: ureq::Response, max: usize) -> Result<String, String> {
    let mut buf = Vec::new();
    response
        .into_reader()
        .take(max as u64 + 1)
        .read_to_end(&mut buf)
        .map_err(|_| "network".to_string())?;
    if buf.len() > max {
        return Err("response-too-large".into());
    }
    String::from_utf8(buf).map_err(|_| "network".to_string())
}

fn src_blocked(src: &str) -> bool {
    let lower = src.to_ascii_lowercase();
    lower.contains("wdfiles.com/local--files/image-tags/")
        || lower.contains("wdfiles.com/local--files/css:homepage/")
        || lower.contains("twitter.png")
        || lower.contains("facebook.png")
}

fn attr(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let needle = format!("{name}=");
    let start = lower.find(&needle)? + needle.len();
    let rest = tag[start..].trim_start();
    let quote = rest.chars().next()?;
    if quote == '"' || quote == '\'' {
        let body = &rest[1..];
        let end = body.find(quote)?;
        Some(body[..end].to_string())
    } else {
        None
    }
}

fn between(html: &str, start_marker: &str, _end: Option<&str>) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let marker = start_marker.to_ascii_lowercase();
    let start = lower.find(&marker)? + marker.len();
    Some(html[start..].to_string())
}

fn read_json(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_pretty(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|err| err.to_string())?;
    }
    let formatter = serde_json::ser::PrettyFormatter::with_indent(b"    ");
    let mut buf = Vec::new();
    let mut serializer = serde_json::Serializer::with_formatter(&mut buf, formatter);
    use serde::Serialize;
    value.serialize(&mut serializer).map_err(|err| err.to_string())?;
    fs::write(path, buf).map_err(|err| err.to_string())
}

pub fn fixture_fetch(url: &str) -> Result<String, String> {
    let body = if url.starts_with("https://account.aq.com/Home") {
        include_str!("../fixtures/account-home.html")
    } else if url.starts_with("https://account.aq.com/CharPage") {
        include_str!("../fixtures/charpage.html")
    } else if url.contains("/myapi/inventory/InventoryData") {
        include_str!("../fixtures/inventory-page.json")
    } else if url.contains("/myapi/inventory/BuyBackData") {
        include_str!("../fixtures/buyback-page.json")
    } else if url.starts_with("https://aqwwiki.wikidot.com/") {
        include_str!("../fixtures/wiki-item.html")
    } else {
        return Err("network".into());
    };
    Ok(body.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch() -> (PathBuf, ProfileFiles) {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let root = std::env::temp_dir().join(format!(
            "aquastar-inventory-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let aqua = root.join("AquaStar");
        fs::create_dir_all(&aqua).unwrap();
        let files = ProfileFiles {
            settings_files: vec![aqua.join("aquastar.json")],
            canonical_settings: aqua.join("aquastar.json"),
            reminders: aqua.join("aquastar_reminders.json"),
            legacy_reminders: root.join("aquastar_reminders.json"),
            todo: aqua.join("aquastar_todo.json"),
            strategy: aqua.join("aquastar_strategy.json"),
            inventory: aqua.join("aquastar_inventory.json"),
            plugins_dir: aqua.join("plugins"),
            swf_managed: aqua.join("custom-game.swf"),
            swf_candidates: vec![aqua.join("custom-game.swf")],
        };
        (root, files)
    }

    fn home_page() -> String {
        include_str!("../fixtures/account-home.html").to_string()
    }

    fn char_page() -> String {
        include_str!("../fixtures/charpage.html").to_string()
    }

    fn live_account_fetch(url: &str) -> Result<String, String> {
        if url.contains("myapi/") && !url.contains("/myapi/inventory/BuyBackData") {
            return Err("network".into());
        }
        if url.contains("/AQW/InventoryData") {
            return Ok(include_str!("../fixtures/inventory-live.json").to_string());
        }
        if url.starts_with("https://account.aq.com/Home") {
            return Ok(home_page());
        }
        if url.starts_with("https://account.aq.com/CharPage") {
            return Ok(char_page());
        }
        if url.contains("BuyBackData") {
            return Ok(include_str!("../fixtures/buyback-page.json").to_string());
        }
        Err("network".into())
    }

    fn buyback_regression_path(test: &str) -> PathBuf {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        std::env::temp_dir().join(format!(
            "aquastar-buyback-regression-{}-{}-{test}.json",
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ))
    }

    #[test]
    fn buyback_sync_uses_legacy_pages_and_persists_every_field() {
        let path = buyback_regression_path("pages");
        let calls = std::cell::RefCell::new(Vec::new());
        let start = chrono::Utc::now().timestamp_millis();
        let result = sync_document(&path, |url| {
            if url.contains("/AQW/BuyBackData") {
                return Ok(serde_json::json!({"data": [["unsupported buyback row"]]}).to_string());
            }
            if url.contains("/myapi/inventory/BuyBackData?") {
                calls.borrow_mut().push(url.to_string());
                assert!(url.contains("take=100&requireTotalCount=true"), "{url}");
                let stamp: i64 = url.split("&_=").nth(1).unwrap().parse().unwrap();
                assert!(stamp >= start && stamp <= chrono::Utc::now().timestamp_millis(), "{url}");
                let fixture: Value = serde_json::from_str(include_str!("../fixtures/buyback-page.json")).unwrap();
                let count = if url.contains("skip=0&") { 100 } else {
                    assert!(url.contains("skip=100&"), "{url}");
                    1
                };
                return Ok(serde_json::json!({"data": vec![fixture["data"][0].clone(); count]}).to_string());
            }
            if url.contains("/AQW/InventoryData") {
                return Ok(include_str!("../fixtures/inventory-live.json").to_string());
            }
            fixture_fetch(url)
        });
        assert_eq!(result["ok"], true, "{result}");
        let saved: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let rows = saved["characters"]["4242"]["buyback"].as_array().unwrap();
        assert_eq!(rows.len(), 101);
        assert_eq!(calls.borrow().len(), 2);
        let expected = serde_json::json!({
            "itemId": 9, "name": "Body Tonic", "type": "Item", "cost": 100,
            "amount": 1, "inserted": "2021-05-06T07:08:09.000Z", "typeId": 1,
            "rarity": 2, "rarityName": "Rare", "searchName": "body tonic",
            "sortName": "body tonic", "insertedAt": 1620284889000_i64
        });
        assert!(rows.iter().all(|row| row == &expected), "{rows:?}");
        assert!(!saved["characters"]["4242"]["inventory"].as_array().unwrap().is_empty());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn buyback_sync_failure_preserves_the_existing_profile() {
        let path = buyback_regression_path("failure");
        let existing = r#"{"characters":{"4242":{"name":"FixtureHero","buyback":[{"name":"Keep me"}],"inventory":[],"lastBuyBackSync":"before"}},"lastActiveCharId":"4242"}"#;
        fs::write(&path, existing).unwrap();
        let result = sync_document(&path, |url| {
            if url.contains("/AQW/BuyBackData") {
                return Ok(serde_json::json!({"data": [["unsupported buyback row"]]}).to_string());
            }
            if url.contains("/myapi/inventory/BuyBackData?") {
                return Err("network".to_string());
            }
            if url.contains("/AQW/InventoryData") {
                return Ok(include_str!("../fixtures/inventory-live.json").to_string());
            }
            fixture_fetch(url)
        });
        assert_eq!(result, serde_json::json!({"ok": false, "error": "network"}));
        assert_eq!(fs::read_to_string(&path).unwrap(), existing);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn account_page_rows_fill_the_saved_inventory() {
        let (_root, files) = scratch();
        let synced = sync_document(&files.inventory, live_account_fetch);
        assert_eq!(synced["ok"], true, "{synced}");
        assert_eq!(synced["charId"], 4242);
        let book = load_book(&files.inventory);
        let tonic = &book["characters"]["4242"]["inventory"][0];
        assert_eq!(tonic["name"], "Body Tonic");
        assert_eq!(tonic["count"], 3);
        assert_eq!(tonic["bank"], false);
        let dark = &book["characters"]["4242"]["inventory"][1];
        assert_eq!(dark["name"], "Dark Potion");
        assert_eq!(dark["bank"], true);
        assert_eq!(dark["coins"], true);
        let member = &book["characters"]["4242"]["inventory"][3];
        assert_eq!(member["name"], "Member Potion");
        assert_eq!(member["member"], true);
        assert_eq!(member["count"], 4);
    }

    #[test]
    fn empty_account_payload_is_not_a_successful_sync() {
        let (_root, files) = scratch();
        let fetch = |url: &str| {
            if url.starts_with("https://account.aq.com/Home") {
                return Ok(home_page());
            }
            if url.starts_with("https://account.aq.com/CharPage") {
                return Ok(char_page());
            }
            Ok(r#"{"data":[]}"#.to_string())
        };
        let synced = sync_document(&files.inventory, fetch);
        assert_eq!(synced["ok"], false, "{synced}");
        let written = fs::read_to_string(&files.inventory).unwrap_or_default();
        assert!(!written.contains("lastInventorySync"), "{written}");
    }

    #[test]
    fn fixtures_fill_the_inventory_list_and_the_hover_image() {
        let (_root, files) = scratch();
        fs::write(
            &files.inventory,
            r##"{"characters":{"9":{"name":"Kept","inventory":[],"buyback":[],"wheel":["keep-wheel"]}},"lastActiveCharId":"9","labels":{"tags":[{"id":"tag1","name":"Farm","color":"#4da3ff","scope":"character"}],"globalItemLabels":{},"characterItemLabels":{}},"fixtureKept":true}"##,
        )
        .unwrap();
        let synced = sync_document(&files.inventory, fixture_fetch);
        assert_eq!(synced["ok"], true);
        assert_eq!(synced["charName"], "FixtureHero");
        assert_eq!(synced["charId"], 4242);
        let text = fs::read_to_string(&files.inventory).unwrap();
        assert!(text.contains("\n    \""), "{text}");
        assert!(text.contains("Body Tonic"));
        assert!(text.contains("keep-wheel"));
        assert!(text.contains("Farm"));
        let book = load_book(&files.inventory);
        let tonic = &book["characters"]["4242"]["inventory"][0];
        assert_eq!(tonic["name"], "Body Tonic");
        assert_eq!(tonic["count"], 3);
        assert_eq!(tonic["bank"], false);
        assert_eq!(tonic["addedAt"], chrono::DateTime::parse_from_rfc3339("2020-01-02T03:04:05.000Z").unwrap().timestamp_millis());
        assert_eq!(book["characters"]["9"]["wheel"][0], "keep-wheel");
        assert_eq!(book["lastActiveCharId"], "4242");
        let counts = item_counts(&files, &["Body Tonic".into(), "Dark Potion".into(), "Member Potion".into()]);
        let hero = |name: &str| {
            counts[name]["characters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|character| character["id"] == "4242")
                .unwrap()
                .clone()
        };
        assert_eq!(hero("Body Tonic")["inventory"], 3);
        assert_eq!(hero("Dark Potion")["bank"], 1);
        assert_eq!(hero("Member Potion")["inventory"], 0);
        let owned = match_in_book(&book, "The Contract of Nulgath", "4242");
        assert_eq!(owned["owned"], true);
        assert_eq!(owned["inventory"], 2);
        assert_eq!(owned["matchedName"], "Unidentified 13");
        let fetched = fetch_wiki("https://aqwwiki.wikidot.com/fixture-sword", fixture_fetch);
        assert_eq!(fetched["ok"], true);
        let images = item_image_srcs(fetched["html"].as_str().unwrap());
        assert_eq!(images, vec!["https://aqwwiki.wdfiles.com/local--files/fixture-sword/sword.png".to_string()]);
        assert_eq!(fetch_wiki("https://evil.example/sword", fixture_fetch)["error"], "blocked");
    }

    #[test]
    fn account_and_wiki_pages_install_the_electron_tools() {
        let home = page_script("https://account.aq.com/Home");
        assert!(home.contains("aquastarSyncBtn"));
        assert!(home.contains("sync_inventory_now"));
        assert!(page_script("https://account.aq.com/Login").is_empty());
        let wiki = page_script("https://aqwwiki.wikidot.com/fixture-sword");
        assert!(wiki.contains("aquastarCharSwitcher"));
        assert!(wiki.contains("fetch_wiki_page"));
        assert!(wiki.contains("renderMergeShopCalculator"));
        let ui = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../ui/inventory.html");
        let html = fs::read_to_string(ui).unwrap();
        assert!(html.contains("inventory-bridge.js"));
        assert!(html.contains("id=\"syncBtn\""));
        assert!(fs::read_to_string(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../ui/inventory-bridge.js")).unwrap().contains("sync_inventory_now"));
        let worker = fs::read_to_string(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../ui/inventory_worker.js")).unwrap();
        assert!(worker.contains("self.onmessage"));
        assert!(html.contains("new Worker('inventory_worker.js')"));
    }
}
