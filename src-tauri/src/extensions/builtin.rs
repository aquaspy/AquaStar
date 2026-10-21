//! First-party plugins that ship inside the executable but run exactly like installed
//! ones: same manifest rules, same permissions, same isolated tool windows. They cannot be
//! disabled or removed, and an installed package with the same id is ignored.
//!
//! The AQW plugin is different: it needs host-only features and lives in `launcher.rs`.

use super::model::Manifest;
use std::path::{Path, PathBuf};

pub struct Embedded {
    pub id: &'static str,
    pub files: &'static [(&'static str, &'static [u8])],
}

pub const EMBEDDED: &[Embedded] = &[Embedded {
    id: "example-companion",
    files: &[
        ("plugin.json", include_bytes!("../../../plugins/example-companion/plugin.json")),
        ("index.html", include_bytes!("../../../plugins/example-companion/index.html")),
        ("main.js", include_bytes!("../../../plugins/example-companion/main.js")),
        ("style.css", include_bytes!("../../../plugins/example-companion/style.css")),
    ],
}];

pub fn is_builtin(id: &str) -> bool {
    EMBEDDED.iter().any(|plugin| plugin.id == id)
}

impl Embedded {
    pub fn manifest(&self, app_version: &str) -> Result<Manifest, String> {
        let bytes = self
            .files
            .iter()
            .find(|(name, _)| *name == "plugin.json")
            .map(|(_, bytes)| *bytes)
            .ok_or("built-in plugin has no manifest")?;
        let manifest: Manifest = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
        manifest.validate(app_version)?;
        if manifest.id != self.id {
            return Err("built-in plugin id does not match its manifest".into());
        }
        Ok(manifest)
    }

    /// Folder the plugin's files are served from. Files are rewritten only when they differ,
    /// so a normal start touches nothing.
    pub fn materialize(&self, extensions_root: &Path) -> Result<PathBuf, String> {
        let dir = folder(extensions_root, self.id);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        for (name, bytes) in self.files {
            let target = dir.join(name);
            if std::fs::read(&target).ok().as_deref() != Some(*bytes) {
                std::fs::write(&target, bytes).map_err(|e| e.to_string())?;
            }
        }
        Ok(dir)
    }
}

pub fn folder(extensions_root: &Path, id: &str) -> PathBuf {
    extensions_root.join("builtin").join(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_embedded_plugin_is_a_valid_package_with_its_files() {
        for embedded in EMBEDDED {
            let manifest = embedded.manifest(env!("CARGO_PKG_VERSION")).unwrap();
            let has = |name: &str| embedded.files.iter().any(|(file, _)| *file == name);
            for tool in &manifest.tools {
                assert!(has(&tool.entry), "{} misses {}", embedded.id, tool.entry);
            }
            assert!(is_builtin(embedded.id));
        }
        assert!(!is_builtin("adventure-quest-worlds"));
    }

    #[test]
    fn materializing_repairs_files_and_leaves_matching_ones_alone() {
        let root = std::env::temp_dir().join(format!("aquastar-builtin-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let embedded = &EMBEDDED[0];
        let dir = embedded.materialize(&root).unwrap();
        assert_eq!(dir, folder(&root, embedded.id));
        for (name, bytes) in embedded.files {
            assert_eq!(std::fs::read(dir.join(name)).unwrap(), *bytes);
        }
        std::fs::write(dir.join("main.js"), b"tampered").unwrap();
        embedded.materialize(&root).unwrap();
        let (_, original) = embedded.files.iter().find(|(name, _)| *name == "main.js").unwrap();
        assert_eq!(std::fs::read(dir.join("main.js")).unwrap(), *original);
        std::fs::remove_dir_all(root).unwrap();
    }
}
