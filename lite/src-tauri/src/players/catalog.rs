use std::collections::HashSet;
use std::path::{Component, Path};
use std::sync::OnceLock;

use super::Engine;

#[derive(Clone, Copy)]
pub(super) enum ArchiveKind {
    TarGz,
    Zip,
    Exe,
    Dmg,
}

pub(super) struct Pinned {
    pub dir: String,
    pub sha256: String,
    pub exe: String,
    pub url: String,
    pub kind: ArchiveKind,
}

struct Row {
    engine: Engine,
    dir: String,
    os: String,
    arch: String,
    kind: ArchiveKind,
    url: String,
    sha256: String,
    exe: String,
}

pub(super) struct Catalog {
    rows: Vec<Row>,
}

impl Catalog {
    pub(super) fn parse(text: &str) -> Result<Self, String> {
        let file: serde_json::Value =
            serde_json::from_str(text).map_err(|e| format!("players.json: {e}"))?;
        let players = file
            .get("players")
            .and_then(|v| v.as_array())
            .ok_or("players.json: missing players array")?;
        let mut rows = Vec::new();
        let mut seen = HashSet::new();
        for player in players {
            let engine = match player.get("engine").and_then(|v| v.as_str()) {
                Some("ruffle") => Engine::Ruffle,
                Some("flash") => Engine::Flash,
                Some(other) => return Err(format!("unknown engine {other}")),
                None => return Err("player is missing engine".into()),
            };
            if player.get("version").and_then(|v| v.as_str()).is_none() {
                return Err("player is missing version".into());
            }
            let dir = player
                .get("dir")
                .and_then(|v| v.as_str())
                .ok_or("player is missing dir")?;
            if !single_dir(dir) {
                return Err(format!("dir {dir} is not a single path component"));
            }
            let artifacts = player
                .get("artifacts")
                .and_then(|v| v.as_array())
                .ok_or("player is missing artifacts")?;
            for artifact in artifacts {
                let os = field(artifact, "os")?;
                let arch = field(artifact, "arch")?;
                let kind_text = field(artifact, "kind")?;
                let url = field(artifact, "url")?;
                let sha256 = field(artifact, "sha256")?;
                let exe = field(artifact, "exe")?;
                if !matches!(os, "linux" | "windows" | "macos") {
                    return Err(format!("unknown os {os}"));
                }
                if !matches!(arch, "x86_64" | "universal") {
                    return Err(format!("unknown arch {arch}"));
                }
                if arch == "universal" && os != "macos" {
                    return Err(format!("universal arch is only valid on macos, not {os}"));
                }
                let kind = match kind_text {
                    "tar.gz" => ArchiveKind::TarGz,
                    "zip" => ArchiveKind::Zip,
                    "exe" => ArchiveKind::Exe,
                    "dmg" => ArchiveKind::Dmg,
                    other => return Err(format!("unknown kind {other}")),
                };
                if !url.starts_with("https://") {
                    return Err(format!("url is not https: {url}"));
                }
                if !sha_ok(sha256) {
                    return Err(format!("sha256 is not 64 lowercase hex digits: {sha256}"));
                }
                if !suffix_ok(&kind, url) {
                    return Err(format!("kind {kind_text} does not match url {url}"));
                }
                if matches!(kind, ArchiveKind::Zip) && os != "windows" {
                    return Err(format!("zip archive is only valid on windows, not {os}"));
                }
                if matches!(kind, ArchiveKind::Dmg) && os != "macos" {
                    return Err(format!("dmg archive is only valid on macos, not {os}"));
                }
                if !relative_exe(exe) {
                    return Err(format!("exe is not a relative path: {exe}"));
                }
                if !seen.insert((engine, os.to_string(), arch.to_string())) {
                    return Err(format!("duplicate pin for {engine:?} {os} {arch}"));
                }
                rows.push(Row {
                    engine,
                    dir: dir.to_string(),
                    os: os.to_string(),
                    arch: arch.to_string(),
                    kind,
                    url: url.to_string(),
                    sha256: sha256.to_string(),
                    exe: exe.to_string(),
                });
            }
        }
        Ok(Self { rows })
    }

    pub(super) fn pinned() -> &'static Self {
        static CATALOG: OnceLock<Catalog> = OnceLock::new();
        CATALOG.get_or_init(|| {
            Self::parse(include_str!("../../../players.json"))
                .unwrap_or_else(|err| panic!("players.json is invalid: {err}"))
        })
    }

    pub(super) fn select(&self, engine: Engine, os: &str, arch: &str) -> Option<Pinned> {
        let exact = self
            .rows
            .iter()
            .find(|row| row.engine == engine && row.os == os && row.arch == arch);
        let row = exact.or_else(|| {
            self.rows
                .iter()
                .find(|row| row.engine == engine && row.os == os && row.arch == "universal")
        })?;
        Some(Pinned {
            dir: row.dir.clone(),
            sha256: row.sha256.clone(),
            exe: row.exe.clone(),
            url: row.url.clone(),
            kind: row.kind,
        })
    }
}

fn field<'a>(artifact: &'a serde_json::Value, name: &str) -> Result<&'a str, String> {
    artifact
        .get(name)
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("artifact is missing {name}"))
}

fn single_dir(dir: &str) -> bool {
    if dir.is_empty() || dir.contains('/') || dir.contains('\\') {
        return false;
    }
    matches!(
        Path::new(dir).components().next(),
        Some(Component::Normal(_))
    )
}

fn relative_exe(exe: &str) -> bool {
    if exe.is_empty() || exe.starts_with('/') || exe.starts_with('\\') {
        return false;
    }
    let bytes = exe.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' {
        return false;
    }
    let path = Path::new(exe);
    path.components().next().is_some()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn sha_ok(sha: &str) -> bool {
    sha.len() == 64
        && sha
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

fn suffix_ok(kind: &ArchiveKind, url: &str) -> bool {
    let path = url.split('?').next().unwrap_or(url);
    match kind {
        ArchiveKind::TarGz => path.ends_with(".tar.gz"),
        ArchiveKind::Zip => path.ends_with(".zip"),
        ArchiveKind::Exe => path.ends_with(".exe"),
        ArchiveKind::Dmg => path.ends_with(".dmg"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sha(byte: u8) -> String {
        format!("{byte:02x}").repeat(32)
    }

    fn one(
        engine: &str,
        dir: &str,
        os: &str,
        arch: &str,
        kind: &str,
        url: &str,
        sha256: &str,
        exe: &str,
    ) -> String {
        format!(
            r#"{{"players":[{{"engine":"{engine}","version":"1","dir":"{dir}","artifacts":[{{"os":"{os}","arch":"{arch}","kind":"{kind}","url":"{url}","sha256":"{sha256}","exe":"{exe}"}}]}}]}}"#
        )
    }

    #[test]
    fn players_json_round_trips_six_pins() {
        let text = include_str!("../../../players.json");
        let catalog = Catalog::parse(text).expect("players.json");
        let raw: serde_json::Value = serde_json::from_str(text).unwrap();
        let mut count = 0;
        for player in raw["players"].as_array().unwrap() {
            let engine = match player["engine"].as_str().unwrap() {
                "ruffle" => Engine::Ruffle,
                "flash" => Engine::Flash,
                other => panic!("engine {other}"),
            };
            let dir = player["dir"].as_str().unwrap();
            for artifact in player["artifacts"].as_array().unwrap() {
                count += 1;
                let os = artifact["os"].as_str().unwrap();
                let arch = artifact["arch"].as_str().unwrap();
                let pin = catalog
                    .select(engine, os, arch)
                    .unwrap_or_else(|| panic!("missing {engine:?} {os} {arch}"));
                assert_eq!(pin.url, artifact["url"].as_str().unwrap());
                assert_eq!(pin.sha256, artifact["sha256"].as_str().unwrap());
                assert_eq!(pin.dir, dir);
                assert_eq!(pin.exe, artifact["exe"].as_str().unwrap());
            }
        }
        assert_eq!(count, 6);
    }

    #[test]
    fn exact_arch_beats_universal_and_apple_silicon_has_no_flash_row() {
        let exact = sha(0x11);
        let universal = sha(0x22);
        let text = format!(
            r#"{{"players":[
                {{"engine":"ruffle","version":"1","dir":"ruffle-1","artifacts":[
                    {{"os":"macos","arch":"universal","kind":"tar.gz","url":"https://example.com/u.tar.gz","sha256":"{universal}","exe":"Ruffle.app/Contents/MacOS/ruffle"}},
                    {{"os":"macos","arch":"x86_64","kind":"tar.gz","url":"https://example.com/x.tar.gz","sha256":"{exact}","exe":"Ruffle.app/Contents/MacOS/ruffle"}}
                ]}},
                {{"engine":"flash","version":"1","dir":"flash-1","artifacts":[
                    {{"os":"macos","arch":"x86_64","kind":"dmg","url":"https://example.com/f.dmg","sha256":"{exact}","exe":"Flash Player.app/Contents/MacOS/Flash Player"}}
                ]}}
            ]}}"#
        );
        let catalog = Catalog::parse(&text).unwrap();
        assert_eq!(
            catalog
                .select(Engine::Ruffle, "macos", "x86_64")
                .unwrap()
                .url,
            "https://example.com/x.tar.gz"
        );
        assert_eq!(
            catalog
                .select(Engine::Ruffle, "macos", "aarch64")
                .unwrap()
                .url,
            "https://example.com/u.tar.gz"
        );
        assert!(catalog.select(Engine::Flash, "macos", "aarch64").is_none());
        assert!(catalog.select(Engine::Flash, "macos", "x86_64").is_some());
    }

    #[test]
    fn parse_rejects_a_pin_that_cannot_be_published() {
        let ok_sha = sha(0xab);
        let base =
            |url, os, arch, kind, exe| one("ruffle", "ruffle-1", os, arch, kind, url, &ok_sha, exe);
        assert!(Catalog::parse(&base(
            "http://example.com/r.tar.gz",
            "linux",
            "x86_64",
            "tar.gz",
            "ruffle",
        ))
        .is_err());
        assert!(Catalog::parse(&one(
            "ruffle",
            "ruffle-1",
            "linux",
            "x86_64",
            "tar.gz",
            "https://example.com/r.tar.gz",
            "ABC",
            "ruffle",
        ))
        .is_err());
        assert!(Catalog::parse(&one(
            "ruffle",
            "ruffle-1",
            "linux",
            "x86_64",
            "tar.gz",
            "https://example.com/r.tar.gz",
            &"ab".repeat(32).to_uppercase(),
            "ruffle",
        ))
        .is_err());
        assert!(Catalog::parse(&base(
            "https://example.com/r.zip",
            "linux",
            "x86_64",
            "zip",
            "ruffle",
        ))
        .is_err());
        assert!(Catalog::parse(&base(
            "https://example.com/r.dmg",
            "linux",
            "x86_64",
            "dmg",
            "ruffle",
        ))
        .is_err());
        assert!(Catalog::parse(&base(
            "https://example.com/r.tar.gz",
            "linux",
            "universal",
            "tar.gz",
            "ruffle",
        ))
        .is_err());
        assert!(Catalog::parse(&base(
            "https://example.com/r.tar.gz",
            "linux",
            "x86_64",
            "zip",
            "ruffle",
        ))
        .is_err());
        assert!(Catalog::parse(&base(
            "https://example.com/r.tar.gz",
            "linux",
            "x86_64",
            "tar.gz",
            "/usr/bin/ruffle",
        ))
        .is_err());
        assert!(Catalog::parse(&base(
            "https://example.com/r.tar.gz",
            "linux",
            "x86_64",
            "tar.gz",
            "../ruffle",
        ))
        .is_err());
        assert!(Catalog::parse(&one(
            "ruffle",
            "nested/dir",
            "linux",
            "x86_64",
            "tar.gz",
            "https://example.com/r.tar.gz",
            &ok_sha,
            "ruffle",
        ))
        .is_err());
        let dup = format!(
            r#"{{"players":[{{"engine":"ruffle","version":"1","dir":"ruffle-1","artifacts":[
                {{"os":"linux","arch":"x86_64","kind":"tar.gz","url":"https://example.com/a.tar.gz","sha256":"{ok_sha}","exe":"ruffle"}},
                {{"os":"linux","arch":"x86_64","kind":"tar.gz","url":"https://example.com/b.tar.gz","sha256":"{ok_sha}","exe":"ruffle"}}
            ]}}]}}"#
        );
        assert!(Catalog::parse(&dup).is_err());
        assert!(Catalog::parse("{").is_err());
    }
}
