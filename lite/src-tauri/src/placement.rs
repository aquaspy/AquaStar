use std::io;
use std::path::{Path, PathBuf};

use tauri::utils::config::{AppDirectoriesOverride, AppDirectoryOverrides};

const MARKER: &str = "portable.txt";

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Placement {
    Installed,
    Portable(PortableRoot),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PortableRoot {
    ruffle_saves: PathBuf,
}

pub fn placement_for(os_is_windows: bool, exe_dir: &Path) -> Placement {
    if os_is_windows && exe_dir.join(MARKER).is_file() {
        Placement::Portable(PortableRoot {
            ruffle_saves: exe_dir.join("data").join("ruffle-saves"),
        })
    } else {
        Placement::Installed
    }
}

impl Placement {
    pub fn directories_override(&self) -> Option<AppDirectoriesOverride> {
        match self {
            Self::Installed => None,
            Self::Portable(_) => Some(AppDirectoriesOverride::Directories(AppDirectoryOverrides {
                data: Some(PathBuf::from("data")),
                local_data: Some(PathBuf::from("data/webview")),
                cache: Some(PathBuf::from("data/cache")),
                log: Some(PathBuf::from("data/logs")),
                config: Some(PathBuf::from("data/config")),
            })),
        }
    }

    pub fn ruffle_save_directory(&self) -> Option<&Path> {
        match self {
            Self::Installed => None,
            Self::Portable(root) => Some(&root.ruffle_saves),
        }
    }

    pub fn prepare(&self, exe_dir: &Path) -> io::Result<()> {
        let Self::Portable(root) = self else {
            return Ok(());
        };
        for name in ["webview", "cache", "logs", "config"] {
            std::fs::create_dir_all(exe_dir.join("data").join(name))?;
        }
        std::fs::create_dir_all(&root.ruffle_saves)
    }
}

pub fn apply<R: tauri::Runtime>(context: &mut tauri::Context<R>) -> io::Result<Placement> {
    let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
    else {
        return Ok(Placement::Installed);
    };
    apply_in(context, cfg!(target_os = "windows"), &exe_dir)
}

pub fn apply_in<R: tauri::Runtime>(
    context: &mut tauri::Context<R>,
    os_is_windows: bool,
    exe_dir: &Path,
) -> io::Result<Placement> {
    let placement = placement_for(os_is_windows, exe_dir);
    placement.prepare(exe_dir)?;
    context.config_mut().app.app_directories_override = placement.directories_override();
    Ok(placement)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("aqlite-placement-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn marker(dir: &Path) {
        std::fs::write(dir.join("portable.txt"), b"ignored\n").unwrap();
    }

    fn fresh_context() -> tauri::Context<tauri::Wry> {
        tauri::generate_context!()
    }

    fn portable_override() -> AppDirectoriesOverride {
        AppDirectoriesOverride::Directories(AppDirectoryOverrides {
            data: Some(PathBuf::from("data")),
            local_data: Some(PathBuf::from("data/webview")),
            cache: Some(PathBuf::from("data/cache")),
            log: Some(PathBuf::from("data/logs")),
            config: Some(PathBuf::from("data/config")),
        })
    }

    #[test]
    fn no_marker_directory_marker_and_data_dir_are_installed() {
        let empty = scratch("empty");
        assert_eq!(placement_for(true, &empty), Placement::Installed);

        let as_dir = scratch("marker-dir");
        std::fs::create_dir(as_dir.join("portable.txt")).unwrap();
        assert_eq!(placement_for(true, &as_dir), Placement::Installed);

        let data = scratch("data-dir");
        std::fs::create_dir(data.join("data")).unwrap();
        assert_eq!(placement_for(true, &data), Placement::Installed);
    }

    #[test]
    fn marker_file_saves_under_data_ruffle_saves() {
        let dir = scratch("marker-file");
        marker(&dir);
        let placement = placement_for(true, &dir);
        let save = placement
            .ruffle_save_directory()
            .expect("portable save directory");
        assert_eq!(save, dir.join("data").join("ruffle-saves"));
        assert!(save.is_absolute());
    }

    #[test]
    fn non_windows_ignores_the_marker() {
        let dir = scratch("non-windows");
        marker(&dir);
        let placement = placement_for(false, &dir);
        assert_eq!(placement, Placement::Installed);
        assert_eq!(placement.directories_override(), None);
        assert_eq!(placement.ruffle_save_directory(), None);
    }

    #[test]
    fn installed_override_is_none_and_has_no_save_directory() {
        let placement = placement_for(true, &scratch("installed"));
        assert_eq!(placement, Placement::Installed);
        assert_eq!(placement.directories_override(), None);
        assert_eq!(placement.ruffle_save_directory(), None);
    }

    #[test]
    fn portable_override_is_directories_under_data() {
        let dir = scratch("override");
        marker(&dir);
        assert_eq!(
            placement_for(true, &dir).directories_override(),
            Some(portable_override())
        );
    }

    #[test]
    fn prepare_creates_the_portable_tree_and_a_second_call_succeeds() {
        let dir = scratch("prepare");
        marker(&dir);
        let placement = placement_for(true, &dir);
        placement.prepare(&dir).unwrap();
        placement.prepare(&dir).unwrap();
        for rel in [
            "data/webview",
            "data/cache",
            "data/logs",
            "data/config",
            "data/ruffle-saves",
        ] {
            assert!(dir.join(rel).is_dir(), "{rel}");
        }
    }

    #[test]
    fn installed_prepare_creates_nothing() {
        let dir = scratch("prepare-installed");
        placement_for(true, &dir).prepare(&dir).unwrap();
        assert!(dir.read_dir().unwrap().next().is_none());
    }

    #[test]
    fn apply_in_writes_the_override_and_creates_directories() {
        let dir = scratch("apply");
        marker(&dir);
        let mut context = fresh_context();
        let placement = apply_in(&mut context, true, &dir).unwrap();
        assert_eq!(
            context.config().app.app_directories_override,
            Some(portable_override())
        );
        assert_eq!(
            placement.ruffle_save_directory(),
            Some(dir.join("data").join("ruffle-saves").as_path())
        );
        for rel in [
            "data/webview",
            "data/cache",
            "data/logs",
            "data/config",
            "data/ruffle-saves",
        ] {
            assert!(dir.join(rel).is_dir(), "{rel}");
        }
        let again = apply_in(&mut context, true, &dir).unwrap();
        assert_eq!(
            context.config().app.app_directories_override,
            Some(portable_override())
        );
        assert_eq!(
            again.ruffle_save_directory(),
            Some(dir.join("data").join("ruffle-saves").as_path())
        );
    }

    #[test]
    fn apply_in_off_windows_stays_installed() {
        let dir = scratch("apply-off");
        marker(&dir);
        let mut context = fresh_context();
        let placement = apply_in(&mut context, false, &dir).unwrap();
        assert_eq!(placement, Placement::Installed);
        assert_eq!(placement.ruffle_save_directory(), None);
        assert_eq!(context.config().app.app_directories_override, None);
        assert!(dir.join("portable.txt").is_file());
        assert!(!dir.join("data").exists());
    }

    #[test]
    fn release_workflow_publishes_the_portable_zip() {
        let yml = include_str!("../../../.github/workflows/lite-release.yml");
        assert!(yml.contains("portable.txt"));
        assert!(yml.contains("AquaStar.Lite_"));
        assert!(yml.contains("_x64-portable.zip"));
        assert!(yml.contains("gh release upload"));
        assert!(yml.contains("prerelease: true"));
        assert!(yml.contains("aquastar-lite-windows-portable"));
        assert!(yml.contains("lite/src-tauri/target/release/AquaStar.Lite_"));
        assert!(!yml
            .lines()
            .any(|line| line.contains("bundle/nsis") && line.contains("portable")));
        for line in yml.lines() {
            if line.contains("gh release edit") {
                assert!(line.contains("--prerelease"), "{line}");
                assert!(line.contains("--latest=false"), "{line}");
            }
        }
    }
}
