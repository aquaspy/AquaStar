use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
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

pub(super) const STAMP_NAME: &str = ".aquastar-pin";

pub(super) enum Source {
    Updated(PathBuf),
    Bundled(PathBuf),
    Cached(PathBuf),
}

impl Source {
    pub(super) fn path(&self) -> &Path {
        match self {
            Self::Updated(path) | Self::Bundled(path) | Self::Cached(path) => path,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum TreeJudge {
    Match,
    Legacy,
    Other,
    Absent,
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

pub(super) fn judge(dir: &Path, pin: &Pinned) -> TreeJudge {
    if !dir.join(&pin.exe).is_file() {
        return TreeJudge::Absent;
    }
    match fs::read_to_string(dir.join(STAMP_NAME)) {
        Err(_) => TreeJudge::Legacy,
        Ok(text) if text.trim() == pin.sha256 => TreeJudge::Match,
        Ok(_) => TreeJudge::Other,
    }
}

pub(super) fn publish(pin: &Pinned, players_parent: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(players_parent).map_err(|e| e.to_string())?;
    let incoming = players_parent.join(format!(".{}.incoming", pin.dir));
    let trash = players_parent.join(format!(".{}.trash", pin.dir));
    let live = players_parent.join(&pin.dir);
    let exe = live.join(&pin.exe);

    if judge(&incoming, pin) == TreeJudge::Match {
        swap_in(&incoming, &live, &trash)?;
        return Ok(exe);
    }
    remove_path(&incoming)?;
    if judge(&live, pin) == TreeJudge::Match {
        remove_path(&trash)?;
        return Ok(exe);
    }

    let temp = players_parent.join(format!(".{}.download", pin.dir));
    let published = publish_downloaded(pin, &temp, &incoming, &live, &trash);
    if published.is_err() {
        let _ = remove_path(&incoming);
        let _ = remove_path(&temp);
    }
    published
}

fn publish_downloaded(
    pin: &Pinned,
    temp: &Path,
    incoming: &Path,
    live: &Path,
    trash: &Path,
) -> Result<PathBuf, String> {
    let bytes = download(pin, temp)?;
    fs::create_dir_all(incoming).map_err(|e| e.to_string())?;
    unpack(pin, &bytes, incoming)?;
    fs::write(incoming.join(STAMP_NAME), format!("{}\n", pin.sha256)).map_err(|e| e.to_string())?;
    if judge(incoming, pin) != TreeJudge::Match {
        return Err(format!("unpacked {} is missing {}", pin.url, pin.exe));
    }
    swap_in(incoming, live, trash)?;
    remove_path(temp)?;
    Ok(live.join(&pin.exe))
}

fn download(pin: &Pinned, temp: &Path) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    ureq::get(&pin.url)
        .call()
        .map_err(|e| format!("download failed: {e}"))?
        .into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    fs::write(temp, &bytes).map_err(|e| e.to_string())?;
    let got = format!("{:x}", Sha256::digest(&bytes));
    if got != pin.sha256 {
        remove_path(temp)?;
        return Err(format!("checksum mismatch for {}: {got}", pin.url));
    }
    Ok(bytes)
}

fn swap_in(incoming: &Path, live: &Path, trash: &Path) -> Result<(), String> {
    if live.exists() {
        remove_path(trash)?;
        fs::rename(live, trash).map_err(|e| e.to_string())?;
    }
    fs::rename(incoming, live).map_err(|e| e.to_string())?;
    remove_path(trash)?;
    Ok(())
}

fn remove_path(path: &Path) -> Result<(), String> {
    if !path.exists() && !path.is_symlink() {
        return Ok(());
    }
    if path.is_dir() && !path.is_symlink() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

fn unpack(pin: &Pinned, bytes: &[u8], dest: &Path) -> Result<(), String> {
    match pin.kind {
        ArchiveKind::Exe => {
            let name = pin
                .url
                .rsplit('/')
                .next()
                .and_then(|part| part.split('?').next())
                .filter(|part| !part.is_empty())
                .unwrap_or("player.exe");
            fs::write(dest.join(name), bytes).map_err(|e| e.to_string())
        }
        ArchiveKind::Dmg => unpack_dmg(bytes, dest),
        ArchiveKind::Zip => unpack_zip(bytes, dest),
        ArchiveKind::TarGz => tar::Archive::new(flate2::read::GzDecoder::new(bytes))
            .unpack(dest)
            .map_err(|e| e.to_string()),
    }
}

fn unpack_zip(bytes: &[u8], dest: &Path) -> Result<(), String> {
    zip::ZipArchive::new(std::io::Cursor::new(bytes.to_vec()))
        .and_then(|mut archive| archive.extract(dest))
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn detach_dmg(mount: &Path) {
    let _ = std::process::Command::new("hdiutil")
        .args(["detach", "-force"])
        .arg(mount)
        .status();
}

#[cfg(target_os = "macos")]
fn unpack_dmg(bytes: &[u8], dest: &Path) -> Result<(), String> {
    let dmg = dest.join("projector.dmg");
    fs::write(&dmg, bytes).map_err(|e| e.to_string())?;
    let mount = dest.join("mnt");
    detach_dmg(&mount);
    fs::create_dir_all(&mount).map_err(|e| e.to_string())?;
    let attached = std::process::Command::new("hdiutil")
        .args(["attach", "-nobrowse", "-readonly", "-mountpoint"])
        .arg(&mount)
        .arg(&dmg)
        .status()
        .map_err(|e| format!("hdiutil attach failed: {e}"))?;
    if !attached.success() {
        detach_dmg(&mount);
        return Err(format!("hdiutil attach exited {attached}"));
    }
    let copied = std::process::Command::new("ditto")
        .arg(mount.join("Flash Player.app"))
        .arg(dest.join("Flash Player.app"))
        .status();
    detach_dmg(&mount);
    let _ = fs::remove_file(&dmg);
    match copied {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!("ditto exited {status}")),
        Err(e) => Err(format!("ditto failed: {e}")),
    }
}

#[cfg(not(target_os = "macos"))]
fn unpack_dmg(_bytes: &[u8], _dest: &Path) -> Result<(), String> {
    Err("the macOS projector is a disk image and is unpacked on macOS".into())
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

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "aquastar-lite-publish-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn fixture() -> Pinned {
        Pinned {
            dir: "player-under-test".into(),
            sha256: sha(0x44),
            exe: "player".into(),
            url: "https://example.invalid/player.tar.gz".into(),
            kind: ArchiveKind::TarGz,
        }
    }

    fn touch(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"player").unwrap();
    }

    #[test]
    fn publish_adopts_a_matching_incoming_tree_without_downloading() {
        let pin = fixture();
        let parent = scratch("incoming");
        let incoming = parent.join(format!(".{}.incoming", pin.dir));
        touch(&incoming.join(&pin.exe));
        fs::write(incoming.join(STAMP_NAME), format!("{}\n", pin.sha256)).unwrap();
        let trash = parent.join(format!(".{}.trash", pin.dir));
        touch(&trash.join("old"));
        let exe = publish(&pin, &parent).unwrap();
        assert_eq!(exe, parent.join(&pin.dir).join(&pin.exe));
        assert_eq!(fs::read(&exe).unwrap(), b"player");
        assert!(!incoming.exists());
        assert!(!trash.exists());
    }

    #[test]
    fn publish_leaves_a_matching_live_tree_in_place() {
        let pin = fixture();
        let parent = scratch("live");
        let live = parent.join(&pin.dir);
        touch(&live.join(&pin.exe));
        fs::write(live.join(STAMP_NAME), format!("{}\n", pin.sha256)).unwrap();
        let exe = publish(&pin, &parent).unwrap();
        assert_eq!(fs::read(&exe).unwrap(), b"player");
        assert!(!parent.join(format!(".{}.incoming", pin.dir)).exists());
    }
}
