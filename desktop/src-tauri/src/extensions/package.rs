use super::model::{safe_relative, valid_id, Manifest};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

const MAX_ZIP: u64 = 50 * 1024 * 1024;
const MAX_UNPACKED: u64 = 200 * 1024 * 1024;
const MAX_ENTRIES: usize = 2048;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    pub manifest: Manifest,
    pub version_dir: String,
    pub enabled: bool,
    pub pending_restart: bool,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Registry {
    #[serde(default)]
    pub plugins: BTreeMap<String, InstalledPlugin>,
    #[serde(default)]
    pub pending_data_removals: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallReview {
    pub manifest: Manifest,
    pub sha256: String,
    pub size: u64,
}
#[derive(Clone)]
pub struct PackageStore {
    root: PathBuf,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn read_zip(path: &Path) -> Result<Vec<u8>, String> {
    let file = fs::File::open(path).map_err(err)?;
    if !file.metadata().map_err(err)?.is_file() {
        return Err("Choose a ZIP file".into());
    }
    let mut data = Vec::new();
    file.take(MAX_ZIP + 1).read_to_end(&mut data).map_err(err)?;
    if data.len() as u64 > MAX_ZIP {
        return Err("ZIP exceeds 50 MiB".into());
    }
    Ok(data)
}
fn archive_manifest(bytes: &[u8], app_version: &str) -> Result<Manifest, String> {
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(err)?;
    if zip.len() > MAX_ENTRIES {
        return Err("ZIP contains too many entries".into());
    }
    let mut names = BTreeSet::new();
    let mut total = 0u64;
    let mut manifest = None;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(err)?;
        let name = entry.name().trim_end_matches('/');
        if !safe_relative(name) || !names.insert(name.to_ascii_lowercase()) {
            return Err("Unsafe or duplicate ZIP path".into());
        }
        if name.split('/').any(|part| {
            part.ends_with([' ', '.'])
                || part.split('.').next().is_some_and(|x| {
                    matches!(
                        x.to_ascii_uppercase().as_str(),
                        "CON"
                            | "PRN"
                            | "AUX"
                            | "NUL"
                            | "COM1"
                            | "COM2"
                            | "COM3"
                            | "COM4"
                            | "COM5"
                            | "COM6"
                            | "COM7"
                            | "COM8"
                            | "COM9"
                            | "LPT1"
                            | "LPT2"
                            | "LPT3"
                            | "LPT4"
                            | "LPT5"
                            | "LPT6"
                            | "LPT7"
                            | "LPT8"
                            | "LPT9"
                    )
                })
        }) {
            return Err("ZIP path is not portable".into());
        }
        if let Some(mode) = entry.unix_mode() {
            let kind = mode & 0o170000;
            if kind != 0 && kind != 0o100000 && kind != 0o040000 {
                return Err("Links and special ZIP files are forbidden".into());
            }
        }
        total = total.checked_add(entry.size()).ok_or("ZIP size overflow")?;
        if total > MAX_UNPACKED {
            return Err("ZIP expands beyond 200 MiB".into());
        }
        if entry.is_dir() {
            continue;
        }
        let ext = Path::new(name)
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ![
            "html", "css", "js", "json", "svg", "png", "jpg", "jpeg", "gif", "webp", "ico", "woff",
            "woff2", "ttf", "otf", "swf", "txt", "md", "map",
        ]
        .contains(&ext.as_str())
        {
            return Err("Unsupported file type; plugins cannot contain native binaries".into());
        }
        if name == "plugin.json" {
            if entry.size() > 256 * 1024 {
                return Err("Plugin manifest is too large".into());
            }
            let mut data = Vec::new();
            entry
                .by_ref()
                .take(256 * 1024 + 1)
                .read_to_end(&mut data)
                .map_err(err)?;
            if data.len() > 256 * 1024 {
                return Err("Plugin manifest is too large".into());
            }
            manifest = Some(serde_json::from_slice::<Manifest>(&data).map_err(err)?);
        }
    }
    let manifest = manifest.ok_or("ZIP must contain plugin.json at its root")?;
    manifest.validate(app_version)?;
    for path in manifest
        .tools
        .iter()
        .map(|t| &t.entry)
        .chain(manifest.games.iter().filter_map(|g| g.file.as_ref()))
    {
        let mut item = zip
            .by_name(path)
            .map_err(|_| format!("Missing contribution file: {path}"))?;
        if item.is_dir() {
            return Err("Contribution entry must be a file".into());
        }
        if path.to_ascii_lowercase().ends_with(".swf") {
            let mut header = [0; 3];
            item.read_exact(&mut header).map_err(err)?;
            if ![b"FWS", b"CWS", b"ZWS"].contains(&&header) {
                return Err("Invalid SWF header".into());
            }
        }
    }
    Ok(manifest)
}
impl PackageStore {
    pub fn new(app_data: &Path) -> Self {
        Self {
            root: app_data.join("extensions"),
        }
    }
    pub fn load(&self) -> Result<Registry, String> {
        let mut path = self.root.join("registry.json");
        if !path.exists() && self.root.join("registry.previous.json").exists() {
            path = self.root.join("registry.previous.json");
        }
        match fs::read(path) {
            Ok(bytes) => {
                let registry: Registry = serde_json::from_slice(&bytes).map_err(err)?;
                for (id, p) in &registry.plugins {
                    if !valid_id(id)
                        || id != &p.manifest.id
                        || !safe_relative(&p.version_dir)
                        || p.version_dir.contains('/')
                    {
                        return Err("Invalid installed plugin registry".into());
                    }
                }
                Ok(registry)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Registry::default()),
            Err(e) => Err(err(e)),
        }
    }
    fn save(&self, registry: &Registry) -> Result<(), String> {
        fs::create_dir_all(&self.root).map_err(err)?;
        let path = self.root.join("registry.json");
        let next = self.root.join("registry.next.json");
        let bytes = serde_json::to_vec_pretty(registry).map_err(err)?;
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&next)
            .map_err(err)?;
        f.write_all(&bytes).map_err(err)?;
        f.sync_all().map_err(err)?;
        drop(f);
        #[cfg(windows)]
        {
            let old = self.root.join("registry.previous.json");
            if path.exists() {
                if old.exists() {
                    fs::remove_file(&old).map_err(err)?;
                }
                fs::rename(&path, &old).map_err(err)?;
            }
            if let Err(e) = fs::rename(&next, &path) {
                if old.exists() {
                    let _ = fs::rename(&old, &path);
                }
                return Err(err(e));
            }
        }
        #[cfg(not(windows))]
        fs::rename(&next, &path).map_err(err)?;
        Ok(())
    }
    pub fn review(&self, zip: &Path, app_version: &str) -> Result<InstallReview, String> {
        let bytes = read_zip(zip)?;
        Ok(InstallReview {
            manifest: archive_manifest(&bytes, app_version)?,
            sha256: digest(&bytes),
            size: bytes.len() as u64,
        })
    }
    pub fn install(
        &self,
        zip_path: &Path,
        reviewed: &InstallReview,
    ) -> Result<InstalledPlugin, String> {
        let bytes = read_zip(zip_path)?;
        if digest(&bytes) != reviewed.sha256 {
            return Err("ZIP changed after review; review it again".into());
        }
        let manifest = archive_manifest(&bytes, env!("CARGO_PKG_VERSION"))?;
        if manifest != reviewed.manifest {
            return Err("Manifest changed after review".into());
        }
        let mut registry = self.load()?;
        let version_dir = format!("{}-{}", manifest.version, reviewed.sha256);
        let versions = self.root.join("packages").join(&manifest.id);
        fs::create_dir_all(&versions).map_err(err)?;
        let dest = versions.join(&version_dir);
        if !dest.exists() {
            let staging = versions.join(format!(
                ".install-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(err)?
                    .as_nanos()
            ));
            fs::create_dir(&staging).map_err(err)?;
            let result = (|| {
                let mut zip = zip::ZipArchive::new(std::io::Cursor::new(&bytes)).map_err(err)?;
                let mut copied = 0u64;
                for i in 0..zip.len() {
                    let mut entry = zip.by_index(i).map_err(err)?;
                    let target = staging.join(entry.name());
                    if entry.is_dir() {
                        fs::create_dir_all(&target).map_err(err)?;
                        continue;
                    }
                    if let Some(parent) = target.parent() {
                        fs::create_dir_all(parent).map_err(err)?;
                    }
                    let mut file = fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&target)
                        .map_err(err)?;
                    let actual = std::io::copy(
                        &mut entry.by_ref().take(MAX_UNPACKED - copied + 1),
                        &mut file,
                    )
                    .map_err(err)?;
                    copied = copied.checked_add(actual).ok_or("ZIP size overflow")?;
                    if copied > MAX_UNPACKED {
                        return Err("ZIP expands beyond limit".into());
                    }
                    file.sync_all().map_err(err)?;
                }
                fs::rename(&staging, &dest).map_err(err)
            })();
            if result.is_err() {
                let _ = fs::remove_dir_all(&staging);
            }
            result?;
        }
        let enabled = registry
            .plugins
            .get(&manifest.id)
            .map_or(true, |p| p.enabled);
        let installed = InstalledPlugin {
            manifest,
            version_dir,
            enabled,
            pending_restart: true,
        };
        registry
            .pending_data_removals
            .retain(|id| id != &installed.manifest.id);
        registry
            .plugins
            .insert(installed.manifest.id.clone(), installed.clone());
        self.save(&registry)?;
        Ok(installed)
    }
    pub fn set_enabled(&self, id: &str, enabled: bool) -> Result<(), String> {
        let mut r = self.load()?;
        let p = r.plugins.get_mut(id).ok_or("Plugin not installed")?;
        p.enabled = enabled;
        p.pending_restart = true;
        self.save(&r)
    }
    pub fn uninstall(&self, id: &str, remove_data: bool) -> Result<(), String> {
        if !valid_id(id) {
            return Err("Invalid plugin ID".into());
        }
        let mut r = self.load()?;
        r.plugins.remove(id).ok_or("Plugin not installed")?;
        if remove_data && !r.pending_data_removals.iter().any(|value| value == id) {
            r.pending_data_removals.push(id.to_string());
        }
        self.save(&r)?;
        Ok(())
    }
    pub fn clear_restart_flags(&self) -> Result<(), String> {
        let mut r = self.load()?;
        let packages = self.root.join("packages");
        match fs::read_dir(&packages) {
            Ok(entries) => {
                for entry in entries {
                    let entry = entry.map_err(err)?;
                    let id = entry.file_name();
                    if !id.to_str().is_some_and(|id| r.plugins.contains_key(id)) {
                        if entry.file_type().map_err(err)?.is_dir() {
                            fs::remove_dir_all(entry.path()).map_err(err)?;
                        } else {
                            fs::remove_file(entry.path()).map_err(err)?;
                        }
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(err(error)),
        }
        if !r.plugins.values().any(|p| p.pending_restart) && r.pending_data_removals.is_empty() {
            return Ok(());
        }
        for id in &r.pending_data_removals {
            if !valid_id(id) {
                return Err("Invalid pending data removal".into());
            }
            let path = self.data_dir(id);
            if path.exists() {
                fs::remove_dir_all(&path).map_err(err)?;
            }
        }
        r.pending_data_removals.clear();
        for p in r.plugins.values_mut() {
            p.pending_restart = false;
        }
        self.save(&r)
    }
    pub fn plugin_dir(&self, p: &InstalledPlugin) -> PathBuf {
        self.root
            .join("packages")
            .join(&p.manifest.id)
            .join(&p.version_dir)
    }
    pub fn data_dir(&self, id: &str) -> PathBuf {
        self.root.join("data").join(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp() -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "aquastar-extension-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }
    fn fixture(path: &Path, version: &str, extra: Option<&str>) {
        let f = fs::File::create(path).unwrap();
        let mut z = zip::ZipWriter::new(f);
        let opts = zip::write::SimpleFileOptions::default();
        z.start_file("plugin.json", opts).unwrap();
        z.write_all(format!(r#"{{"format":"aquastar-desktop-plugin","apiVersion":1,"id":"example","name":"Example","version":"{version}","permissions":["storage"],"tools":[{{"id":"hello","name":"Hello","entry":"index.html"}}]}}"#).as_bytes()).unwrap();
        z.start_file("index.html", opts).unwrap();
        z.write_all(b"<!doctype html><h1>Hello</h1>").unwrap();
        if let Some(name) = extra {
            z.start_file(name, opts).unwrap();
            z.write_all(b"no").unwrap();
        }
        z.finish().unwrap();
    }
    #[test]
    fn install_update_toggle_and_preserve_data() {
        let dir = temp();
        let store = PackageStore::new(&dir);
        let zip = dir.join("plugin.zip");
        fixture(&zip, "1.0.0", None);
        let review = store.review(&zip, env!("CARGO_PKG_VERSION")).unwrap();
        let first = store.install(&zip, &review).unwrap();
        assert!(store.plugin_dir(&first).join("index.html").exists());
        let data = store.data_dir("example");
        fs::create_dir_all(&data).unwrap();
        fs::write(data.join("state.json"), "{}").unwrap();
        store.set_enabled("example", false).unwrap();
        fixture(&zip, "1.1.0", None);
        let updated = store
            .install(
                &zip,
                &store.review(&zip, env!("CARGO_PKG_VERSION")).unwrap(),
            )
            .unwrap();
        assert!(!updated.enabled);
        assert!(updated.pending_restart);
        assert!(store.plugin_dir(&first).exists());
        store.clear_restart_flags().unwrap();
        assert!(!store.load().unwrap().plugins["example"].pending_restart);
        store.uninstall("example", false).unwrap();
        assert!(data.join("state.json").exists());
        assert!(store.load().unwrap().plugins.is_empty());
        assert!(store.plugin_dir(&first).exists());
        assert!(store.plugin_dir(&updated).exists());
        store.clear_restart_flags().unwrap();
        assert!(!store.plugin_dir(&first).exists());
        assert!(!store.plugin_dir(&updated).exists());
        assert!(data.join("state.json").exists());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn requested_data_removal_waits_for_restart_and_reinstall_cancels_it() {
        let dir = temp();
        let store = PackageStore::new(&dir);
        let zip = dir.join("p.zip");
        fixture(&zip, "1.0.0", None);
        let review = store.review(&zip, env!("CARGO_PKG_VERSION")).unwrap();
        store.install(&zip, &review).unwrap();
        let data = store.data_dir("example");
        fs::create_dir_all(&data).unwrap();
        fs::write(data.join("state.json"), "{}").unwrap();
        store.uninstall("example", true).unwrap();
        assert!(data.exists());
        assert_eq!(store.load().unwrap().pending_data_removals, vec!["example"]);
        store.install(&zip, &review).unwrap();
        store.clear_restart_flags().unwrap();
        assert!(data.exists());
        store.uninstall("example", true).unwrap();
        store.clear_restart_flags().unwrap();
        assert!(!data.exists());
        assert!(store.load().unwrap().pending_data_removals.is_empty());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn rejects_traversal_native_files_and_changed_review() {
        let dir = temp();
        let store = PackageStore::new(&dir);
        let zip = dir.join("p.zip");
        for bad in ["../evil.js", "bin/evil.exe", "CON.js", "other/../evil.js"] {
            fixture(&zip, "1.0.0", Some(bad));
            assert!(
                store.review(&zip, env!("CARGO_PKG_VERSION")).is_err(),
                "{bad}"
            );
        }
        fixture(&zip, "1.0.0", None);
        let r = store.review(&zip, env!("CARGO_PKG_VERSION")).unwrap();
        fixture(&zip, "1.1.0", None);
        assert!(store.install(&zip, &r).is_err());
        assert!(store.load().unwrap().plugins.is_empty());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn minimum_versions_follow_semver_prerelease_order() {
        use super::super::model::version_at_least;
        assert!(version_at_least("3.0.0", "3.0.0-rc.9").unwrap());
        assert!(!version_at_least("3.0.0-rc.3", "3.0.0").unwrap());
        assert!(version_at_least("3.0.0-rc.10", "3.0.0-rc.9").unwrap());
    }
}
