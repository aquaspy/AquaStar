// Electron cancels the same hosts (`res/platform/ad-hosts.json`) in every window.
// Tauri's navigation hook does not see script or iframe loads on WebKitGTK,
// WebView2, or WKWebView, so site windows also inject `init_script` at document start.

use std::sync::OnceLock;

const AD_HOSTS_JSON: &str = include_str!("../../../res/platform/ad-hosts.json");
const INIT_TEMPLATE: &str = include_str!("ads_init.js");

fn blocked_hosts() -> &'static [String] {
    static HOSTS: OnceLock<Vec<String>> = OnceLock::new();
    HOSTS.get_or_init(|| parse_ad_hosts(AD_HOSTS_JSON).expect("ad-hosts.json"))
}

pub fn parse_ad_hosts(text: &str) -> Result<Vec<String>, String> {
    let hosts: Vec<String> =
        serde_json::from_str(text).map_err(|err| format!("ad hosts: {err}"))?;
    if hosts.is_empty() {
        return Err("ad hosts: empty".into());
    }
    let mut seen = std::collections::HashSet::new();
    for host in &hosts {
        if !bare_host(host) {
            return Err(format!("ad hosts: {host} is not a bare hostname"));
        }
        if !seen.insert(host.as_str()) {
            return Err(format!("ad hosts: duplicate {host}"));
        }
    }
    Ok(hosts)
}

fn bare_host(host: &str) -> bool {
    !host.is_empty()
        && !host.starts_with('.')
        && !host.ends_with('.')
        && !host.contains("..")
        && host.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'.' || byte == b'-'
        })
}

pub fn host_blocked(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    blocked_hosts().iter().any(|entry| {
        let entry = entry.as_str();
        host == entry
            || host.len() > entry.len()
                && host.as_bytes()[host.len() - entry.len() - 1] == b'.'
                && host.ends_with(entry)
    })
}

pub fn init_script() -> String {
    let hosts = blocked_hosts()
        .iter()
        .map(|host| format!("\"{host}\""))
        .collect::<Vec<_>>()
        .join(",");
    INIT_TEMPLATE.replace("/*HOSTS*/", &hosts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn electron_hosts_and_the_wiki_loader_are_blocked() {
        for host in [
            "adsymptotic.com",
            "g.doubleclick.net",
            "stats.g.doubleclick.net",
            "onesignal.com",
            "s.nitropay.com",
            "api.nitropay.com",
            "translate.googleapis.com",
            "securepubads.g.doubleclick.net",
            "acdn.adnxs.com",
            "gum.criteo.com",
            "px.ads.linkedin.com",
        ] {
            assert!(host_blocked(host), "{host} should be blocked");
        }
    }

    #[test]
    fn the_wiki_and_game_hosts_are_not_blocked() {
        for host in [
            "aqwwiki.wikidot.com",
            "aqwwiki.wdfiles.com",
            "d3g0gp89917ko0.cloudfront.net",
            "www.aq.com",
            "account.aq.com",
            "www.artix.com",
            "fonts.googleapis.com",
            "www.googleapis.com",
            "notdoubleclick.net",
            "linkedin.com",
            "cdn.jsdelivr.net",
        ] {
            assert!(!host_blocked(host), "{host} should load");
        }
    }

    #[test]
    fn the_init_script_pins_the_same_hosts_and_the_wikidot_slots() {
        let script = init_script();
        assert!(!script.contains("/*HOSTS*/"));
        for host in blocked_hosts() {
            assert!(script.contains(&format!("\"{host}\"")), "missing {host}");
        }
        assert!(parse_ad_hosts("[]").is_err());
        assert!(parse_ad_hosts("[\"Doubleclick.net\"]").is_err());
        assert!(parse_ad_hosts("[\"doubleclick.net\",\"doubleclick.net\"]").is_err());
        assert!(script.contains(".wd-adunit"));
        assert!(script.contains("#ncmp__tool"));
        assert!(script.contains(".fb-page"));
    }
}
