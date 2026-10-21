use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use super::Engine;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) enum Os {
    Linux,
    Windows,
    Macos,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) enum Arch {
    X86,
    X86_64,
    Aarch64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Cli {
    Artix,
    Stock,
    Projector,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ClaimRank {
    Native,
    Compatible,
}

impl Os {
    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "linux" => Some(Self::Linux),
            "windows" => Some(Self::Windows),
            "macos" => Some(Self::Macos),
            _ => None,
        }
    }

    pub fn host() -> Option<Self> {
        Self::parse(std::env::consts::OS)
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Linux => "linux",
            Self::Windows => "windows",
            Self::Macos => "macos",
        }
    }
}

impl Arch {
    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "x86" => Some(Self::X86),
            "x86_64" => Some(Self::X86_64),
            "aarch64" => Some(Self::Aarch64),
            _ => None,
        }
    }

    pub fn host() -> Option<Self> {
        Self::parse(std::env::consts::ARCH)
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::X86 => "x86",
            Self::X86_64 => "x86_64",
            Self::Aarch64 => "aarch64",
        }
    }
}

#[derive(Clone, Copy)]
pub(super) enum ArchiveKind {
    TarGz,
    Zip,
    Exe,
    Dmg,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Extract {
    Archive,
    AppImage,
    SingleExe,
    MacosCli,
}

#[derive(Clone)]
pub(super) struct Pin {
    pub dir: String,
    pub sha256: String,
    pub binary_sha256: Option<String>,
    pub exe: String,
    pub url: String,
    pub kind: ArchiveKind,
    pub extract: Extract,
    pub cli: Cli,
    pub version: String,
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

pub(super) struct Catalog {
    by_host: HashMap<(Engine, Os, Arch), Pin>,
}

impl Catalog {
    pub(super) fn parse(text: &str) -> Result<Self, String> {
        let file: serde_json::Value =
            serde_json::from_str(text).map_err(|e| format!("players.json: {e}"))?;
        let players = file
            .get("players")
            .and_then(|v| v.as_array())
            .ok_or("players.json: missing players array")?;
        let mut staged: HashMap<(Engine, Os, Arch), (ClaimRank, Pin)> = HashMap::new();
        let mut dirs_on_os = HashSet::new();
        for player in players {
            if player.get("dir").is_some() {
                return Err("player has dir".into());
            }
            let engine = match player.get("engine").and_then(|v| v.as_str()) {
                Some("ruffle") => Engine::Ruffle,
                Some("flash") => Engine::Flash,
                Some(other) => return Err(format!("unknown engine {other}")),
                None => return Err("player is missing engine".into()),
            };
            let version = player
                .get("version")
                .and_then(|v| v.as_str())
                .ok_or("player is missing version")?
                .to_string();
            let artifacts = player
                .get("artifacts")
                .and_then(|v| v.as_array())
                .ok_or("player is missing artifacts")?;
            for artifact in artifacts {
                let os_text = field(artifact, "os")?;
                let arch_text = field(artifact, "arch")?;
                let dir = field(artifact, "dir")?;
                let kind_text = field(artifact, "kind")?;
                let url = field(artifact, "url")?;
                let sha256 = field(artifact, "sha256")?;
                let exe = field(artifact, "exe")?;
                let os = Os::parse(os_text).ok_or_else(|| format!("unknown os {os_text}"))?;
                let native =
                    Arch::parse(arch_text).ok_or_else(|| format!("unknown arch {arch_text}"))?;
                let also = also_arches(artifact)?;
                if also.contains(&native) {
                    return Err(format!("arch {arch_text} is listed again in also"));
                }
                if !single_dir(dir) {
                    return Err(format!("dir {dir} is not a single path component"));
                }
                if !dirs_on_os.insert((os, dir.to_string())) {
                    return Err(format!("duplicate dir {dir} on {os_text}"));
                }
                let cli = parse_cli(field(artifact, "cli")?)?;
                if !cli_matches_engine(engine, cli) {
                    return Err(format!("{cli:?} is not valid for {engine:?}"));
                }
                if engine == Engine::Ruffle && !ruffle_exe_matches(cli, exe) {
                    return Err(format!("exe {exe} does not match {cli:?}"));
                }
                let kind = match kind_text {
                    "tar.gz" => ArchiveKind::TarGz,
                    "zip" => ArchiveKind::Zip,
                    "exe" => ArchiveKind::Exe,
                    "dmg" => ArchiveKind::Dmg,
                    other => return Err(format!("unknown kind {other}")),
                };
                let extract = match artifact.get("extract").and_then(|v| v.as_str()) {
                    None => Extract::Archive,
                    Some("appimage") => Extract::AppImage,
                    Some("single-exe") => Extract::SingleExe,
                    Some("macos-cli") => Extract::MacosCli,
                    Some(other) => return Err(format!("unknown extract {other}")),
                };
                let binary_sha256 = match artifact.get("binarySha256") {
                    None => None,
                    Some(value) => {
                        let text = value.as_str().ok_or("binarySha256 is not a string")?;
                        if !sha_ok(text) {
                            return Err(format!(
                                "binarySha256 is not 64 lowercase hex digits: {text}"
                            ));
                        }
                        Some(text.to_string())
                    }
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
                if matches!(kind, ArchiveKind::Dmg) && os != Os::Macos {
                    return Err(format!("dmg archive is only valid on macos, not {os_text}"));
                }
                if !extract_ok(extract, os.as_str(), &kind, exe, binary_sha256.is_some()) {
                    return Err(format!(
                        "extract {extract:?} is not valid for {os_text} {kind_text} exe {exe}"
                    ));
                }
                if !relative_exe(exe) {
                    return Err(format!("exe is not a relative path: {exe}"));
                }
                let pin = Pin {
                    dir: dir.to_string(),
                    sha256: sha256.to_string(),
                    binary_sha256,
                    exe: exe.to_string(),
                    url: url.to_string(),
                    kind,
                    extract,
                    cli,
                    version: version.clone(),
                };
                let mut claims = vec![(native, ClaimRank::Native)];
                for arch in also {
                    claims.push((arch, ClaimRank::Compatible));
                }
                for (arch, rank) in claims {
                    let key = (engine, os, arch);
                    match admit(staged.get(&key).map(|(held, _)| *held), rank) {
                        Admit::Place => {
                            staged.insert(key, (rank, pin.clone()));
                        }
                        Admit::KeepNative => {}
                        Admit::Conflict => {
                            return Err(format!("duplicate pin for {engine:?} {os:?} {arch:?}"));
                        }
                    }
                }
            }
        }
        let by_host = staged.into_iter().map(|(key, (_, pin))| (key, pin)).collect();
        Ok(Self { by_host })
    }

    pub(super) fn pinned() -> &'static Self {
        static CATALOG: OnceLock<Catalog> = OnceLock::new();
        CATALOG.get_or_init(|| {
            Self::parse(include_str!("../../../players.json"))
                .unwrap_or_else(|err| panic!("players.json is invalid: {err}"))
        })
    }

    pub(super) fn select(&self, engine: Engine, os: Os, arch: Arch) -> Option<&Pin> {
        self.by_host.get(&(engine, os, arch))
    }
}

enum Admit {
    Place,
    KeepNative,
    Conflict,
}

fn admit(held: Option<ClaimRank>, incoming: ClaimRank) -> Admit {
    match (held, incoming) {
        (None, _) => Admit::Place,
        (Some(ClaimRank::Compatible), ClaimRank::Native) => Admit::Place,
        (Some(ClaimRank::Native), ClaimRank::Compatible) => Admit::KeepNative,
        _ => Admit::Conflict,
    }
}

fn also_arches(artifact: &serde_json::Value) -> Result<Vec<Arch>, String> {
    match artifact.get("also") {
        None => Ok(Vec::new()),
        Some(value) => {
            let list = value.as_array().ok_or("also is not an array")?;
            let mut arches = Vec::new();
            for item in list {
                let text = item.as_str().ok_or("also entry is not a string")?;
                let arch = Arch::parse(text).ok_or_else(|| format!("unknown arch {text}"))?;
                arches.push(arch);
            }
            Ok(arches)
        }
    }
}

fn parse_cli(text: &str) -> Result<Cli, String> {
    match text {
        "artix" => Ok(Cli::Artix),
        "stock" => Ok(Cli::Stock),
        "projector" => Ok(Cli::Projector),
        other => Err(format!("unknown cli {other}")),
    }
}

fn cli_matches_engine(engine: Engine, cli: Cli) -> bool {
    matches!(
        (engine, cli),
        (Engine::Ruffle, Cli::Artix | Cli::Stock) | (Engine::Flash, Cli::Projector)
    )
}

fn ruffle_exe_matches(cli: Cli, exe: &str) -> bool {
    let name = Path::new(exe)
        .file_name()
        .and_then(|part| part.to_str())
        .unwrap_or("");
    match cli {
        Cli::Artix => name == "ruffle_desktop" || name == "ruffle_desktop.exe",
        Cli::Stock => name == "ruffle" || name == "ruffle.exe",
        Cli::Projector => false,
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

fn extract_ok(
    extract: Extract,
    os: &str,
    kind: &ArchiveKind,
    exe: &str,
    has_binary_sha: bool,
) -> bool {
    let flat = !exe.contains('/') && !exe.contains('\\');
    match extract {
        Extract::Archive => !has_binary_sha,
        Extract::AppImage => {
            os == "linux" && matches!(kind, ArchiveKind::Zip) && flat && has_binary_sha
        }
        Extract::SingleExe => {
            os == "windows" && matches!(kind, ArchiveKind::Zip) && flat && has_binary_sha
        }
        Extract::MacosCli => {
            os == "macos" && matches!(kind, ArchiveKind::Zip) && flat && has_binary_sha
        }
    }
}

fn sha_ok(sha: &str) -> bool {
    sha.len() == 64
        && sha
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

pub(super) fn judge(dir: &Path, pin: &Pin) -> TreeJudge {
    if !dir.join(&pin.exe).is_file() {
        return TreeJudge::Absent;
    }
    match fs::read_to_string(dir.join(STAMP_NAME)) {
        Err(_) => TreeJudge::Legacy,
        Ok(text) if text.trim() == pin.sha256 => TreeJudge::Match,
        Ok(_) => TreeJudge::Other,
    }
}

pub(super) fn publish(pin: &Pin, players_parent: &Path) -> Result<PathBuf, String> {
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
    pin: &Pin,
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

fn download(pin: &Pin, temp: &Path) -> Result<Vec<u8>, String> {
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

fn unpack(pin: &Pin, bytes: &[u8], dest: &Path) -> Result<(), String> {
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
    }?;
    arrange(pin, dest)
}

fn unpack_zip(bytes: &[u8], dest: &Path) -> Result<(), String> {
    zip::ZipArchive::new(std::io::Cursor::new(bytes.to_vec()))
        .and_then(|mut archive| archive.extract(dest))
        .map_err(|e| e.to_string())
}

fn arrange(pin: &Pin, dest: &Path) -> Result<(), String> {
    match pin.extract {
        Extract::Archive => Ok(()),
        Extract::AppImage => arrange_appimage(pin, dest),
        Extract::SingleExe => arrange_single_exe(pin, dest),
        Extract::MacosCli => arrange_macos_cli(pin, dest),
    }
}

fn arrange_appimage(pin: &Pin, dest: &Path) -> Result<(), String> {
    let app = sole_file(dest, |path| {
        path.extension().and_then(|ext| ext.to_str()) == Some("AppImage")
    })?;
    make_executable(&app)?;
    let work = dest.join(".appimage-extract");
    let _ = remove_path(&work);
    fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let status = Command::new(&app)
        .arg("--appimage-extract")
        .current_dir(&work)
        .env("APPIMAGE_EXTRACT_AND_RUN", "1")
        .status()
        .map_err(|e| format!("appimage extract failed: {e}"))?;
    if !status.success() {
        return Err(format!("appimage extract exited {status}"));
    }
    let inner = work
        .join("squashfs-root")
        .join("usr")
        .join("bin")
        .join(&pin.exe);
    if !inner.is_file() {
        return Err(format!("appimage is missing usr/bin/{}", pin.exe));
    }
    let published = dest.join(&pin.exe);
    fs::copy(&inner, &published).map_err(|e| e.to_string())?;
    make_executable(&published)?;
    if let Some(sha) = &pin.binary_sha256 {
        require_sha(&published, sha)?;
    }
    let license = work
        .join("squashfs-root")
        .join("usr")
        .join("share")
        .join("doc")
        .join("artix-games-launcher")
        .join("LICENSE.md");
    if license.is_file() {
        fs::copy(&license, dest.join("LICENSE.md")).map_err(|e| e.to_string())?;
    }
    keep_only(dest, &[&pin.exe, "LICENSE.md"])
}

fn arrange_single_exe(pin: &Pin, dest: &Path) -> Result<(), String> {
    let published = dest.join(&pin.exe);
    if !published.is_file() {
        let source = sole_file(dest, |path| {
            path.extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
        })?;
        fs::copy(&source, &published).map_err(|e| e.to_string())?;
    }
    if let Some(sha) = &pin.binary_sha256 {
        require_sha(&published, sha)?;
    }
    keep_only(dest, &[&pin.exe])
}

fn arrange_macos_cli(pin: &Pin, dest: &Path) -> Result<(), String> {
    let published = dest.join(&pin.exe);
    if !published.is_file() {
        let source = sole_file(dest, |path| {
            path.file_name().and_then(|name| name.to_str()) == Some(pin.exe.as_str())
        })?;
        fs::copy(&source, &published).map_err(|e| e.to_string())?;
    }
    make_executable(&published)?;
    if let Some(sha) = &pin.binary_sha256 {
        require_sha(&published, sha)?;
    }
    keep_only(dest, &[&pin.exe])?;
    #[cfg(target_os = "macos")]
    vendor_macos_dylibs(&published)?;
    Ok(())
}

fn sole_file(dest: &Path, pred: impl Fn(&Path) -> bool) -> Result<PathBuf, String> {
    let mut files = Vec::new();
    walk_files(dest, &mut files)?;
    let matched: Vec<PathBuf> = files.into_iter().filter(|path| pred(path)).collect();
    if matched.len() != 1 {
        return Err(format!(
            "expected one matching file in {}, found {}",
            dest.display(),
            matched.len()
        ));
    }
    Ok(matched.into_iter().next().unwrap())
}

fn walk_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            walk_files(&path, out)?;
        } else if path.is_file() {
            out.push(path);
        }
    }
    Ok(())
}

fn require_sha(path: &Path, expected: &str) -> Result<(), String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let got = format!("{:x}", Sha256::digest(bytes));
    if got != expected {
        return Err(format!(
            "{} sha256 {got} does not match the pinned binary",
            path.display()
        ));
    }
    Ok(())
}

fn keep_only(dest: &Path, names: &[&str]) -> Result<(), String> {
    let hold = dest.join(".aquastar-keep");
    let _ = remove_path(&hold);
    fs::create_dir_all(&hold).map_err(|e| e.to_string())?;
    for name in names {
        let src = dest.join(name);
        if src.is_file() {
            fs::rename(&src, hold.join(name)).map_err(|e| e.to_string())?;
        }
    }
    for entry in fs::read_dir(dest).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_name() == ".aquastar-keep" {
            continue;
        }
        remove_path(&entry.path())?;
    }
    for name in names {
        let src = hold.join(name);
        if src.is_file() {
            fs::rename(&src, dest.join(name)).map_err(|e| e.to_string())?;
        }
    }
    remove_path(&hold)
}

fn make_executable(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path).map_err(|e| e.to_string())?.permissions();
        perms.set_mode(perms.mode() | 0o755);
        fs::set_permissions(path, perms).map_err(|e| e.to_string())?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn vendor_macos_dylibs(exe: &Path) -> Result<(), String> {
    let dir = exe.parent().ok_or("player executable has no directory")?;
    let archs = macho_archs(exe)?;
    let mut pending = vec![exe.to_path_buf()];
    let mut queued = HashSet::new();
    queued.insert(exe.to_path_buf());
    while let Some(bin) = pending.pop() {
        for dep in macho_deps(&bin)? {
            if dep.starts_with("/usr/lib/") || dep.starts_with("/System/") || dep.starts_with('@') {
                continue;
            }
            let base = Path::new(&dep)
                .file_name()
                .ok_or_else(|| format!("dylib {dep} has no file name"))?
                .to_os_string();
            let local = dir.join(&base);
            let own_id = bin
                .file_name()
                .is_some_and(|name| name == Path::new(&dep).file_name().unwrap_or_default());
            if !own_id && !queued.contains(&local) {
                if !Path::new(&dep).is_file() {
                    return Err(format!(
                        "missing {dep}, required by {}. The Apple Silicon build vendors this library next to ruffle_desktop.",
                        bin.display()
                    ));
                }
                thin_macho(Path::new(&dep), &local, &archs)?;
                make_executable(&local)?;
                install_name(
                    &local,
                    &[
                        "-id",
                        &format!(
                            "@executable_path/{}",
                            local.file_name().unwrap().to_string_lossy()
                        ),
                    ],
                )?;
                pending.push(local.clone());
                queued.insert(local);
            }
            if !own_id {
                let installed = format!(
                    "@executable_path/{}",
                    Path::new(&dep).file_name().unwrap().to_string_lossy()
                );
                install_name(&bin, &["-change", &dep, &installed])?;
            }
        }
    }
    for path in &queued {
        let status = Command::new("codesign")
            .args(["--force", "-s", "-"])
            .arg(path)
            .status()
            .map_err(|e| format!("codesign failed: {e}"))?;
        if !status.success() {
            return Err(format!("codesign exited {status} for {}", path.display()));
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn macho_deps(path: &Path) -> Result<Vec<String>, String> {
    let output = Command::new("otool")
        .args(["-L"])
        .arg(path)
        .output()
        .map_err(|e| format!("otool failed: {e}"))?;
    if !output.status.success() {
        return Err(format!("otool exited {}", output.status));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut deps = Vec::new();
    for line in text.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let dep = line.split(" (compatibility").next().unwrap_or(line).trim();
        if !dep.is_empty() {
            deps.push(dep.to_string());
        }
    }
    Ok(deps)
}

#[cfg(target_os = "macos")]
fn macho_archs(path: &Path) -> Result<Vec<String>, String> {
    let output = Command::new("lipo")
        .args(["-archs"])
        .arg(path)
        .output()
        .map_err(|e| format!("lipo failed: {e}"))?;
    if !output.status.success() {
        return Err(format!("lipo exited {}", output.status));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let archs: Vec<String> = text.split_whitespace().map(str::to_string).collect();
    if archs.is_empty() {
        return Err(format!(
            "lipo reported no architectures for {}",
            path.display()
        ));
    }
    Ok(archs)
}

#[cfg(target_os = "macos")]
fn thin_macho(src: &Path, dest: &Path, archs: &[String]) -> Result<(), String> {
    if archs.len() == 1 {
        let status = Command::new("lipo")
            .arg(src)
            .args(["-extract", &archs[0], "-output"])
            .arg(dest)
            .status()
            .map_err(|e| format!("lipo extract failed: {e}"))?;
        if !status.success() {
            return Err(format!(
                "could not extract {} from {}",
                archs[0],
                src.display()
            ));
        }
        return Ok(());
    }
    fs::copy(src, dest).map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn install_name(path: &Path, args: &[&str]) -> Result<(), String> {
    let status = Command::new("install_name_tool")
        .args(args)
        .arg(path)
        .status()
        .map_err(|e| format!("install_name_tool failed: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "install_name_tool exited {status} for {}",
            path.display()
        ))
    }
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

    fn cli_name(engine: &str, exe: &str) -> &'static str {
        if engine == "flash" {
            "projector"
        } else if exe.contains("ruffle_desktop") {
            "artix"
        } else {
            "stock"
        }
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
        let cli = cli_name(engine, exe);
        format!(
            r#"{{"players":[{{"engine":"{engine}","version":"1","artifacts":[{{"os":"{os}","arch":"{arch}","dir":"{dir}","cli":"{cli}","kind":"{kind}","url":"{url}","sha256":"{sha256}","exe":"{exe}"}}]}}]}}"#
        )
    }

    #[test]
    fn phase1_hosts_select_these_pins() {
        let catalog = Catalog::parse(include_str!("../../../players.json")).expect("players.json");
        let cases = [
            (
                Engine::Ruffle,
                Os::Linux,
                Arch::X86_64,
                Cli::Artix,
                "ruffle-artix-1.7.0",
                "ruffle_desktop",
                "https://chaoslabs.artix.com/Ruffle/1.7.0/ArtixGamesLauncher-Ruffle-1.7.0-linux-x64.zip",
            ),
            (
                Engine::Ruffle,
                Os::Linux,
                Arch::X86,
                Cli::Stock,
                "ruffle-0.7.1-linux-x86",
                "ruffle",
                "https://github.com/ruffle-rs/ruffle/releases/download/v0.7.1/ruffle-0.7.1-linux-i686.tar.gz",
            ),
            (
                Engine::Ruffle,
                Os::Linux,
                Arch::Aarch64,
                Cli::Stock,
                "ruffle-0.7.1-linux-aarch64",
                "ruffle",
                "https://github.com/ruffle-rs/ruffle/releases/download/v0.7.1/ruffle-0.7.1-linux-aarch64.tar.gz",
            ),
            (
                Engine::Ruffle,
                Os::Windows,
                Arch::X86_64,
                Cli::Artix,
                "ruffle-artix-1.7.0",
                "ruffle_desktop.exe",
                "https://chaoslabs.artix.com/Ruffle/1.7.0/ArtixGamesLauncher-Ruffle-1.7.0-windows-x64.zip",
            ),
            (
                Engine::Ruffle,
                Os::Windows,
                Arch::X86,
                Cli::Stock,
                "ruffle-0.7.1-windows-x86",
                "ruffle.exe",
                "https://github.com/ruffle-rs/ruffle/releases/download/v0.7.1/ruffle-0.7.1-windows-x86_32.zip",
            ),
            (
                Engine::Ruffle,
                Os::Macos,
                Arch::Aarch64,
                Cli::Artix,
                "ruffle-artix-1.7.0",
                "ruffle_desktop",
                "https://chaoslabs.artix.com/Ruffle/1.7.0/ArtixGamesLauncher-Ruffle-1.7.0-macOS-arm64.zip",
            ),
            (
                Engine::Ruffle,
                Os::Macos,
                Arch::X86_64,
                Cli::Stock,
                "ruffle-0.7.1",
                "Ruffle.app/Contents/MacOS/ruffle",
                "https://github.com/ruffle-rs/ruffle/releases/download/v0.7.1/ruffle-0.7.1-macos-universal.tar.gz",
            ),
            (
                Engine::Flash,
                Os::Linux,
                Arch::X86_64,
                Cli::Projector,
                "flashplayer-32.0.0.465",
                "flashplayer",
                "https://fpdownload.macromedia.com/pub/flashplayer/updaters/32/flash_player_sa_linux.x86_64.tar.gz",
            ),
            (
                Engine::Flash,
                Os::Windows,
                Arch::X86,
                Cli::Projector,
                "flashplayer-32.0.0.465",
                "flashplayer_32_sa.exe",
                "https://fpdownload.macromedia.com/pub/flashplayer/updaters/32/flashplayer_32_sa.exe",
            ),
            (
                Engine::Flash,
                Os::Windows,
                Arch::X86_64,
                Cli::Projector,
                "flashplayer-32.0.0.465",
                "flashplayer_32_sa.exe",
                "https://fpdownload.macromedia.com/pub/flashplayer/updaters/32/flashplayer_32_sa.exe",
            ),
            (
                Engine::Flash,
                Os::Macos,
                Arch::X86_64,
                Cli::Projector,
                "flashplayer-32.0.0.465",
                "Flash Player.app/Contents/MacOS/Flash Player",
                "https://fpdownload.macromedia.com/pub/flashplayer/updaters/32/flashplayer_32_sa.dmg",
            ),
            (
                Engine::Flash,
                Os::Macos,
                Arch::Aarch64,
                Cli::Projector,
                "flashplayer-32.0.0.465",
                "Flash Player.app/Contents/MacOS/Flash Player",
                "https://fpdownload.macromedia.com/pub/flashplayer/updaters/32/flashplayer_32_sa.dmg",
            ),
        ];
        for (engine, os, arch, cli, dir, exe, url) in cases {
            let pin = catalog
                .select(engine, os, arch)
                .unwrap_or_else(|| panic!("missing {engine:?} {os:?} {arch:?}"));
            assert_eq!(pin.cli, cli, "{engine:?} {os:?} {arch:?}");
            assert_eq!(pin.dir, dir);
            assert_eq!(pin.exe, exe);
            assert_eq!(pin.url, url);
        }
        let win_x86 = catalog
            .select(Engine::Flash, Os::Windows, Arch::X86)
            .unwrap();
        let win_x64 = catalog
            .select(Engine::Flash, Os::Windows, Arch::X86_64)
            .unwrap();
        assert_eq!(win_x86.url, win_x64.url);
        let apple = catalog
            .select(Engine::Ruffle, Os::Macos, Arch::Aarch64)
            .unwrap();
        assert!(!apple.url.contains("macos-universal"));
        assert_eq!(apple.extract, Extract::MacosCli);
        let artix = catalog
            .select(Engine::Ruffle, Os::Linux, Arch::X86_64)
            .unwrap();
        assert_eq!(artix.extract, Extract::AppImage);
        assert_eq!(
            artix.binary_sha256.as_deref(),
            Some("9ad71857ea0c3546b7666addea064d14f1bcb214e148b2e34f99c04af2eff2a8")
        );
        assert_eq!(
            catalog
                .select(Engine::Ruffle, Os::Windows, Arch::X86_64)
                .unwrap()
                .extract,
            Extract::SingleExe
        );
        assert!(catalog
            .select(Engine::Flash, Os::Linux, Arch::X86)
            .is_none());
        assert!(catalog
            .select(Engine::Flash, Os::Linux, Arch::Aarch64)
            .is_none());
        assert!(catalog
            .select(Engine::Flash, Os::Windows, Arch::Aarch64)
            .is_none());
        assert!(catalog
            .select(Engine::Ruffle, Os::Windows, Arch::Aarch64)
            .is_none());
    }

    #[test]
    fn parse_rejects_a_second_native_claim_and_github_arch_suffixes() {
        let ok_sha = sha(0x11);
        for arch in ["i686", "x86_32", "universal"] {
            assert!(
                Catalog::parse(&one(
                    "ruffle",
                    "ruffle-1",
                    "linux",
                    arch,
                    "tar.gz",
                    "https://example.com/r.tar.gz",
                    &ok_sha,
                    "ruffle",
                ))
                .is_err(),
                "{arch}"
            );
        }
        assert!(Catalog::parse(&one(
            "ruffle",
            "ruffle-1",
            "macos",
            "universal",
            "tar.gz",
            "https://example.com/r.tar.gz",
            &ok_sha,
            "ruffle",
        ))
        .is_err());
        assert!(Catalog::parse(&one(
            "ruffle",
            "ruffle-arm",
            "linux",
            "aarch64",
            "tar.gz",
            "https://example.com/r.tar.gz",
            &ok_sha,
            "ruffle",
        ))
        .is_ok());
        let same_dir = format!(
            r#"{{"players":[{{"engine":"ruffle","version":"1","artifacts":[
                {{"os":"linux","arch":"x86_64","dir":"ruffle-1","cli":"stock","kind":"tar.gz","url":"https://example.com/a.tar.gz","sha256":"{ok_sha}","exe":"ruffle"}},
                {{"os":"linux","arch":"x86","dir":"ruffle-1","cli":"stock","kind":"tar.gz","url":"https://example.com/b.tar.gz","sha256":"{ok_sha}","exe":"ruffle"}}
            ]}}]}}"#
        );
        assert!(Catalog::parse(&same_dir).is_err());
        let player_dir = format!(
            r#"{{"players":[{{"engine":"ruffle","version":"1","dir":"ruffle-1","artifacts":[
                {{"os":"linux","arch":"x86_64","dir":"ruffle-1","cli":"stock","kind":"tar.gz","url":"https://example.com/a.tar.gz","sha256":"{ok_sha}","exe":"ruffle"}}
            ]}}]}}"#
        );
        assert!(Catalog::parse(&player_dir).is_err());
        let two_natives = format!(
            r#"{{"players":[{{"engine":"ruffle","version":"1","artifacts":[
                {{"os":"linux","arch":"x86_64","dir":"ruffle-a","cli":"stock","kind":"tar.gz","url":"https://example.com/a.tar.gz","sha256":"{ok_sha}","exe":"ruffle"}},
                {{"os":"linux","arch":"x86_64","dir":"ruffle-b","cli":"stock","kind":"tar.gz","url":"https://example.com/b.tar.gz","sha256":"{ok_sha}","exe":"ruffle"}}
            ]}}]}}"#
        );
        assert!(Catalog::parse(&two_natives).is_err());
        let two_compatible = format!(
            r#"{{"players":[{{"engine":"flash","version":"1","artifacts":[
                {{"os":"windows","arch":"x86","also":["x86_64"],"dir":"flash-a","cli":"projector","kind":"exe","url":"https://example.com/a.exe","sha256":"{ok_sha}","exe":"flash.exe"}},
                {{"os":"windows","arch":"x86","also":["x86_64"],"dir":"flash-b","cli":"projector","kind":"exe","url":"https://example.com/b.exe","sha256":"{ok_sha}","exe":"flash.exe"}}
            ]}}]}}"#
        );
        assert!(Catalog::parse(&two_compatible).is_err());
        let native_then_compatible = format!(
            r#"{{"players":[
                {{"engine":"ruffle","version":"1","artifacts":[
                    {{"os":"macos","arch":"aarch64","dir":"artix","cli":"artix","kind":"zip","url":"https://example.com/artix.zip","sha256":"{ok_sha}","exe":"ruffle_desktop"}}
                ]}},
                {{"engine":"ruffle","version":"1","artifacts":[
                    {{"os":"macos","arch":"x86_64","also":["aarch64"],"dir":"stock","cli":"stock","kind":"tar.gz","url":"https://example.com/stock.tar.gz","sha256":"{ok_sha}","exe":"ruffle"}}
                ]}}
            ]}}"#
        );
        let replaced = Catalog::parse(&native_then_compatible).expect("native replaces compatible");
        assert_eq!(
            replaced
                .select(Engine::Ruffle, Os::Macos, Arch::Aarch64)
                .unwrap()
                .url,
            "https://example.com/artix.zip"
        );
        assert_eq!(
            replaced
                .select(Engine::Ruffle, Os::Macos, Arch::X86_64)
                .unwrap()
                .url,
            "https://example.com/stock.tar.gz"
        );
        let stock_named_artix = format!(
            r#"{{"players":[{{"engine":"ruffle","version":"1","artifacts":[
                {{"os":"linux","arch":"x86_64","dir":"ruffle-1","cli":"stock","kind":"tar.gz","url":"https://example.com/r.tar.gz","sha256":"{ok_sha}","exe":"ruffle_desktop"}}
            ]}}]}}"#
        );
        assert!(Catalog::parse(&stock_named_artix).is_err());
        let artix_named_stock = format!(
            r#"{{"players":[{{"engine":"ruffle","version":"1","artifacts":[
                {{"os":"linux","arch":"x86_64","dir":"ruffle-1","cli":"artix","kind":"tar.gz","url":"https://example.com/r.tar.gz","sha256":"{ok_sha}","exe":"ruffle"}}
            ]}}]}}"#
        );
        assert!(Catalog::parse(&artix_named_stock).is_err());
        let arch_in_also = format!(
            r#"{{"players":[{{"engine":"ruffle","version":"1","artifacts":[
                {{"os":"macos","arch":"x86_64","also":["x86_64"],"dir":"stock","cli":"stock","kind":"tar.gz","url":"https://example.com/stock.tar.gz","sha256":"{ok_sha}","exe":"ruffle"}}
            ]}}]}}"#
        );
        assert!(Catalog::parse(&arch_in_also).is_err());
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
        .is_ok());
        assert!(Catalog::parse(&base(
            "https://example.com/r.tar.gz",
            "linux",
            "aarch64",
            "tar.gz",
            "ruffle",
        ))
        .is_ok());
        assert!(Catalog::parse(
            r#"{"players":[{"engine":"ruffle","version":"1","artifacts":[{"os":"windows","arch":"x86_64","dir":"ruffle-1","cli":"artix","kind":"zip","extract":"appimage","url":"https://example.com/r.zip","sha256":"abababababababababababababababababababababababababababababababab","binarySha256":"abababababababababababababababababababababababababababababababab","exe":"ruffle_desktop"}]}]}"#
        )
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
            r#"{{"players":[{{"engine":"ruffle","version":"1","artifacts":[
                {{"os":"linux","arch":"x86_64","dir":"ruffle-a","cli":"stock","kind":"tar.gz","url":"https://example.com/a.tar.gz","sha256":"{ok_sha}","exe":"ruffle"}},
                {{"os":"linux","arch":"x86_64","dir":"ruffle-b","cli":"stock","kind":"tar.gz","url":"https://example.com/b.tar.gz","sha256":"{ok_sha}","exe":"ruffle"}}
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

    fn fixture() -> Pin {
        Pin {
            dir: "player-under-test".into(),
            sha256: sha(0x44),
            binary_sha256: None,
            exe: "player".into(),
            url: "https://example.invalid/player.tar.gz".into(),
            kind: ArchiveKind::TarGz,
            extract: Extract::Archive,
            cli: Cli::Stock,
            version: String::new(),
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
    fn single_exe_extract_publishes_the_only_windows_binary() {
        let dir = scratch("single-exe");
        fs::write(dir.join("Artix Games Launcher.exe"), b"ruffle-bytes").unwrap();
        let pin = Pin {
            dir: "ruffle-artix".into(),
            sha256: sha(0x11),
            binary_sha256: Some(format!("{:x}", Sha256::digest(b"ruffle-bytes"))),
            exe: "ruffle_desktop.exe".into(),
            url: "https://example.invalid/r.zip".into(),
            kind: ArchiveKind::Zip,
            extract: Extract::SingleExe,
            cli: Cli::Artix,
            version: String::new(),
        };
        arrange(&pin, &dir).unwrap();
        assert_eq!(
            fs::read(dir.join("ruffle_desktop.exe")).unwrap(),
            b"ruffle-bytes"
        );
        assert!(!dir.join("Artix Games Launcher.exe").exists());
    }

    #[test]
    fn macos_cli_extract_flattens_ruffle_desktop_out_of_the_app() {
        let dir = scratch("macos-cli");
        let nested = dir.join("Artix Games Launcher · Ruffle.app/Contents/MacOS");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("ruffle_desktop"), b"arm64-ruffle").unwrap();
        fs::write(nested.join("ruffle"), b"#!/bin/sh\n").unwrap();
        let pin = Pin {
            dir: "ruffle-artix".into(),
            sha256: sha(0x12),
            binary_sha256: Some(format!("{:x}", Sha256::digest(b"arm64-ruffle"))),
            exe: "ruffle_desktop".into(),
            url: "https://example.invalid/r.zip".into(),
            kind: ArchiveKind::Zip,
            extract: Extract::MacosCli,
            cli: Cli::Artix,
            version: String::new(),
        };
        arrange(&pin, &dir).unwrap();
        assert_eq!(
            fs::read(dir.join("ruffle_desktop")).unwrap(),
            b"arm64-ruffle"
        );
        assert!(!dir.join("Artix Games Launcher · Ruffle.app").exists());
    }

    #[test]
    fn a_binary_hash_mismatch_is_not_published() {
        let dir = scratch("bad-sha");
        fs::write(dir.join("player.exe"), b"nope").unwrap();
        let pin = Pin {
            dir: "ruffle-artix".into(),
            sha256: sha(0x13),
            binary_sha256: Some(sha(0x99)),
            exe: "ruffle_desktop.exe".into(),
            url: "https://example.invalid/r.zip".into(),
            kind: ArchiveKind::Zip,
            extract: Extract::SingleExe,
            cli: Cli::Artix,
            version: String::new(),
        };
        assert!(arrange(&pin, &dir).is_err());
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
