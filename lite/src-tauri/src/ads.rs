// Electron cancels these hosts in every window (`res/platform/platform-rules.js`).
// The entries after that list are the other hosts named by the NitroPay loader
// currently embedded on the wiki (`https://s.nitropay.com/ads-143.js`). Tauri's
// navigation hook does not see script or iframe loads on WebKitGTK, WebView2, or
// WKWebView, so site windows also inject `init_script` at document start.

const BLOCKED_HOSTS: &[&str] = &[
    "3lift.com",
    "adnxs-simple.com",
    "adnxs.com",
    "ads.linkedin.com",
    "adsrvr.org",
    "adsymptotic.com",
    "amazon-adsystem.com",
    "appnexus.com",
    "btloader.com",
    "casalemedia.com",
    "confiant-integrations.net",
    "criteo.com",
    "doubleclick.net",
    "geoedge.be",
    "id5-sync.com",
    "indexww.com",
    "inmobi.com",
    "lijit.com",
    "media.net",
    "nitropay.com",
    "onesignal.com",
    "openx.net",
    "postrelease.com",
    "privacymanager.io",
    "pubmatic.com",
    "rlcdn.com",
    "rubiconproject.com",
    "scorecardresearch.com",
    "sharethrough.com",
    "smartadserver.com",
    "sonobi.com",
    "thumbmarkjs.com",
    "translate.googleapis.com",
    "trustedstack.com",
    "uidapi.com",
];

const INIT_TEMPLATE: &str = include_str!("ads_init.js");

pub fn host_blocked(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    BLOCKED_HOSTS.iter().any(|entry| {
        host == *entry
            || host.len() > entry.len()
                && host.as_bytes()[host.len() - entry.len() - 1] == b'.'
                && host.ends_with(entry)
    })
}

pub fn init_script() -> String {
    let hosts = BLOCKED_HOSTS
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
        for host in BLOCKED_HOSTS {
            assert!(script.contains(&format!("\"{host}\"")), "missing {host}");
        }
        assert!(script.contains(".wd-adunit"));
        assert!(script.contains("#ncmp__tool"));
        assert!(script.contains(".fb-page"));
    }
}
