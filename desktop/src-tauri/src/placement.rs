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

pub struct PlayerRoots {
    app_data: PathBuf,
    bundled: Option<PathBuf>,
}

impl PlayerRoots {
    pub fn app_data(&self) -> &Path {
        &self.app_data
    }

    pub fn bundled(&self) -> Option<&Path> {
        self.bundled.as_deref()
    }
}

fn players_dir(base: Option<&Path>) -> Option<PathBuf> {
    let dir = base?.join("players");
    dir.is_dir().then_some(dir)
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

    pub fn player_roots(
        &self,
        app_data_dir: &Path,
        resource_dir: Option<&Path>,
        exe_dir: Option<&Path>,
    ) -> PlayerRoots {
        let resource_players = players_dir(resource_dir);
        let exe_players = players_dir(exe_dir);
        let bundled = match self {
            Self::Portable(_) => exe_players.or(resource_players),
            Self::Installed => resource_players,
        };
        PlayerRoots {
            app_data: app_data_dir.join("players"),
            bundled,
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

pub(crate) struct ProfilePaths {
    pub settings_files: Vec<PathBuf>,
    pub swf_candidates: Vec<PathBuf>,
    pub shell_cache: PathBuf,
    pub electron_loader_cache: PathBuf,
    pub aqua_dir: PathBuf,
    pub legacy_reminders: PathBuf,
}

const SHELL_ID: &str = "io.github.aquaspy.aquastar-lite";
const SWF_NAMES: [&str; 2] = ["custom-game.swf", "aqlite_old.swf"];

pub fn electron_profile(exe_dir: Option<&Path>) -> ProfilePaths {
    let cwd = std::env::current_dir().ok();
    profile_paths(
        &electron_app_data_root(),
        cwd.as_deref(),
        exe_dir,
        &shell_config_dir(exe_dir),
    )
}

fn profile_paths(
    app_data_root: &Path,
    cwd: Option<&Path>,
    exe_dir: Option<&Path>,
    config_dir: &Path,
) -> ProfilePaths {
    let aqua = app_data_root.join("AquaStar");
    let mut settings_files = vec![app_data_root.join("aquastar.json")];
    if let Some(exe_dir) = exe_dir {
        settings_files.push(exe_dir.join("aquastar.json"));
    }
    settings_files.push(aqua.join("aquastar.json"));

    let mut swf_dirs = vec![aqua.clone()];
    if let Some(cwd) = cwd {
        swf_dirs.push(cwd.to_path_buf());
    }
    if let Some(exe_dir) = exe_dir {
        if let Some(beside) = directory_beside_app(exe_dir) {
            swf_dirs.push(beside);
        }
    }
    let mut swf_candidates = Vec::new();
    for dir in swf_dirs {
        for name in SWF_NAMES {
            swf_candidates.push(dir.join(name));
        }
    }
    ProfilePaths {
        settings_files,
        swf_candidates,
        shell_cache: config_dir.join("loader-cache.json"),
        electron_loader_cache: aqua.join("aquastar.adventure-quest-worlds.launcher-config.json"),
        legacy_reminders: app_data_root.join("aquastar_reminders.json"),
        aqua_dir: aqua,
    }
}

fn shell_config_dir(exe_dir: Option<&Path>) -> PathBuf {
    if let Some(exe_dir) = exe_dir {
        if matches!(
            placement_for(cfg!(target_os = "windows"), exe_dir),
            Placement::Portable(_)
        ) {
            return exe_dir.join("data").join("config");
        }
    }
    tauri_config_dir()
}

fn electron_app_data_root() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."))
    }
    #[cfg(target_os = "macos")]
    {
        home_dir().join("Library").join("Application Support")
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or_else(|| home_dir().join(".config"))
    }
}

/// Folder of the launcher's own `settings.json`, known before the app is built.
pub fn launcher_config_dir() -> PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf));
    shell_config_dir(exe_dir.as_deref())
}

fn tauri_config_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        electron_app_data_root().join(SHELL_ID)
    }
    #[cfg(target_os = "macos")]
    {
        home_dir()
            .join("Library")
            .join("Application Support")
            .join(SHELL_ID)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        electron_app_data_root().join(SHELL_ID)
    }
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn directory_beside_app(exe_dir: &Path) -> Option<PathBuf> {
    let mut dir = exe_dir.to_path_buf();
    for _ in 0..8 {
        let is_app = dir
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.len() > 4 && name.to_ascii_lowercase().ends_with(".app"));
        if is_app {
            return dir.parent().map(Path::to_path_buf);
        }
        let parent = dir.parent()?.to_path_buf();
        if parent == dir {
            return None;
        }
        dir = parent;
    }
    None
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
        crate::app_context()
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
        let yml = include_str!("../../../.github/workflows/desktop-release.yml");
        assert!(yml.contains("portable.txt"));
        assert!(yml.contains("aquastar-neo_"));
        assert!(yml.contains("_x64-portable.zip"));
        assert!(yml.contains("gh release upload"));
        assert!(yml.contains("prerelease: ${{ needs.gate.outputs.kind != 'stable' }}"));
        assert!(yml.contains("aquastar-neo-desktop-windows-portable"));
        assert!(yml.contains("desktop/src-tauri/target/release/aquastar-neo_"));
        assert!(!yml
            .lines()
            .any(|line| line.contains("bundle/nsis") && line.contains("portable")));
        for line in yml.lines() {
            if line.contains("gh release edit") {
                assert!(line.contains("--prerelease"), "{line}");
                assert!(line.contains("--latest=false"), "{line}");
            }
        }
        let tar_line = yml
            .lines()
            .find(|line| line.contains("tar.exe"))
            .expect("portable tar.exe");
        assert!(tar_line.contains("players"), "{tar_line}");
        let fetch = yml.find("desktop/scripts/fetch-players.sh").expect("fetch sh");
        let fetch_ps = yml
            .find("desktop/scripts/fetch-players.ps1")
            .expect("fetch ps1");
        let mut actions = yml.match_indices("tauri-apps/tauri-action");
        let first = actions.next().expect("first tauri-action").0;
        let second = actions.next().expect("second tauri-action").0;
        assert!(fetch < first && fetch_ps < first && first < second);
        assert!(yml.contains("--bundles app"));
        assert!(yml.contains("v3.*-*"));
        assert!(yml.contains("needs.gate.outputs.publish == 'true'"));
        assert!(!yml.contains("startsWith(github.ref, 'refs/tags/lite-v')"));
        assert!(yml.contains("desktop/scripts/finish-macos-app.sh"));
        assert!(include_str!("../../scripts/finish-macos-app.sh")
            .contains("codesign --force --deep -s -"));
    }

    #[test]
    fn smoke_workflow_launches_the_release_artifacts() {
        let yml = include_str!("../../../.github/workflows/desktop-smoke.yml");
        assert!(yml.contains("workflow_dispatch"));
        assert!(yml.contains("workflow_run"));
        assert!(yml.contains("AquaStar NEO Desktop Release"));
        assert!(yml.contains("startsWith(github.event.workflow_run.head_branch, 'lite-v')"));
        assert!(yml.contains("startsWith(github.event.workflow_run.head_branch, 'v3.')"));
        assert!(!yml.contains("contains(github.event.workflow_run.head_branch, '-')"));
        assert!(yml.contains("github.event.workflow_run.conclusion == 'success'"));
        for os in [
            "ubuntu-latest",
            "windows-latest",
            "macos-latest",
            "macos-15-intel",
        ] {
            assert!(yml.contains(os), "{os}");
        }
        for package in ["appimage", "deb", "nsis", "portable", "dmg"] {
            assert!(yml.contains(package), "{package}");
        }
        assert!(yml.contains("actions/upload-artifact@v4"));
        assert!(yml.contains("AQUASTAR_LITE_SMOKE"));
        assert_eq!(yml.matches("os: macos-latest").count(), 2);
        assert!(yml.contains("electron_mac.py"));
        let electron = include_str!("../../../scripts/smoke/electron_mac.py");
        assert!(electron.contains("devicePixelRatio"));
        assert!(electron.contains("swf_wrapper.html"));
        assert!(electron.contains("force-device-scale-factor"));
        assert!(electron.contains("--install-rosetta"));
        let unix = include_str!("../../scripts/smoke/install-unix.sh");
        assert!(unix.contains("xattr -cr"));
        assert!(unix.contains("hdiutil attach"));
        assert!(unix.contains("APPIMAGE_EXTRACT_AND_RUN"));
        let windows = include_str!("../../scripts/smoke/install-windows.ps1");
        assert!(windows.contains("/S"));
        assert!(windows.contains("portable.zip"));
        let release = include_str!("../../../.github/workflows/desktop-release.yml");
        assert!(release.contains("desktop-smoke.yml"));
        assert!(release.contains("gh workflow run"));
    }

    #[test]
    fn check_workflow_fetches_players_after_cargo() {
        let yml = include_str!("../../../.github/workflows/desktop-check.yml");
        let mut steps = Vec::new();
        for line in yml.lines() {
            if line.contains("cargo test")
                || line.contains("cargo check")
                || line.contains("fetch-players")
            {
                steps.push(line.trim());
            }
        }
        assert!(
            steps
                .windows(2)
                .any(|pair| pair[0].contains("cargo test") && pair[1].contains("fetch-players")),
            "{steps:?}"
        );
        assert!(
            steps
                .windows(2)
                .any(|pair| pair[0].contains("cargo check") && pair[1].contains("fetch-players")),
            "{steps:?}"
        );
        assert!(yml.contains("if: always()"));
    }

    #[test]
    fn electron_release_skips_every_v3_tag() {
        let yml = include_str!("../../../.github/workflows/release.yml");
        assert!(yml.contains("- 'v*'"));
        assert!(!yml.contains("'!v3.*-*'"));
        assert_eq!(
            yml.matches("!startsWith(github.ref, 'refs/tags/v3.')")
                .count(),
            yml.matches("runs-on:").count()
        );
    }

    #[test]
    fn resolve_tag_accepts_lite_and_v3_releases() {
        let script = Path::new(env!("CARGO_MANIFEST_DIR")).join("../scripts/smoke/resolve-tag.sh");
        let accept = |tag: &str| {
            let output = std::env::temp_dir().join(format!(
                "aquastar-resolve-{}-{}",
                std::process::id(),
                tag.replace('.', "_")
            ));
            let result = std::process::Command::new("bash")
                .arg(&script)
                .env("INPUT_TAG", tag)
                .env("EVENT_NAME", "workflow_dispatch")
                .env("GITHUB_OUTPUT", &output)
                .env("GITHUB_REPOSITORY", "example/example")
                .output()
                .expect("resolve-tag");
            let _ = std::fs::remove_file(&output);
            result.status.success()
        };
        assert!(accept("lite-v0.2.0"));
        assert!(accept("v3.0.0-alpha.1"));
        assert!(accept("v3.0.0"));
        assert!(!accept("v3.0"));
        assert!(!accept("v2.1.1"));
    }

    #[test]
    fn stable_v3_tag_publishes_and_stays_off_latest() {
        let yml = include_str!("../../../.github/workflows/desktop-release.yml");
        assert!(yml.contains("- 'v3.*'"));
        assert!(yml.contains("kind=stable"));
        assert!(yml.contains("--prerelease=false --latest=false"));
        assert!(yml.contains("--prerelease --latest=false"));
        assert!(!yml.contains("--latest=true"));
        assert!(!yml.contains("make_latest"));
    }

    #[test]
    fn fetch_players_reads_artifact_dir_for_this_os() {
        let sh = include_str!("../../scripts/fetch-players.sh");
        let ps = include_str!("../../scripts/fetch-players.ps1");
        assert!(sh.contains("art[\"dir\"]"));
        assert!(!sh.contains("player[\"dir\"]"));
        assert!(sh.contains("art[\"os\"] != host"));
        assert!(sh.contains("host_arch not in also"));
        assert!(ps.contains("$art.os"));
        assert!(ps.contains("$art.also"));
        assert!(ps.contains("$hostArch"));
    }

    #[test]
    fn the_players_resource_dir_exists_before_fetch() {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        assert!(manifest.join("players/.gitkeep").is_file());
        let ignore = std::fs::read_to_string(manifest.join("../.gitignore")).unwrap();
        assert!(ignore.contains("src-tauri/players/*\n"));
        assert!(ignore.contains("!src-tauri/players/.gitkeep\n"));
    }

    #[test]
    fn installed_roots_use_an_existing_resource_players_dir() {
        let base = scratch("roots-installed");
        let app_data = base.join("app");
        let resource = base.join("resource");
        let exe = base.join("exe");
        std::fs::create_dir_all(resource.join("players")).unwrap();
        std::fs::create_dir_all(exe.join("players")).unwrap();
        let roots = placement_for(false, &exe).player_roots(&app_data, Some(&resource), Some(&exe));
        assert_eq!(roots.app_data(), app_data.join("players"));
        assert_eq!(roots.bundled(), Some(resource.join("players").as_path()));
        assert!(!app_data.exists());
    }

    #[test]
    fn missing_players_directories_are_not_bundled() {
        let base = scratch("roots-missing");
        let app_data = base.join("app");
        let resource = base.join("resource");
        std::fs::create_dir_all(&resource).unwrap();
        let roots = placement_for(false, &resource).player_roots(
            &app_data,
            Some(&resource),
            Some(&resource),
        );
        assert_eq!(roots.bundled(), None);
        assert_eq!(roots.app_data(), app_data.join("players"));
    }

    #[test]
    fn portable_roots_prefer_players_beside_the_exe() {
        let exe = scratch("roots-portable");
        marker(&exe);
        std::fs::create_dir_all(exe.join("players")).unwrap();
        let resource = exe.join("resource");
        std::fs::create_dir_all(resource.join("players")).unwrap();
        let app_data = exe.join("data");
        let roots = placement_for(true, &exe).player_roots(&app_data, Some(&resource), Some(&exe));
        assert_eq!(roots.bundled(), Some(exe.join("players").as_path()));
        assert_eq!(roots.app_data(), app_data.join("players"));
    }

    #[test]
    fn portable_roots_fall_back_to_resource_players() {
        let exe = scratch("roots-portable-resource");
        marker(&exe);
        let resource = exe.join("resource");
        std::fs::create_dir_all(resource.join("players")).unwrap();
        let roots =
            placement_for(true, &exe).player_roots(&exe.join("data"), Some(&resource), Some(&exe));
        assert_eq!(roots.bundled(), Some(resource.join("players").as_path()));
    }

    #[test]
    fn electron_profile_lists_settings_then_swf_names_in_electron_order() {
        let root = scratch("profile");
        let app_data = root.join("appData");
        let cwd = root.join("cwd");
        let exe = root.join("AquaStar NEO.app").join("Contents").join("MacOS");
        let config = root.join("config");
        let paths = profile_paths(&app_data, Some(&cwd), Some(&exe), &config);
        assert_eq!(
            paths.settings_files,
            vec![
                app_data.join("aquastar.json"),
                exe.join("aquastar.json"),
                app_data.join("AquaStar").join("aquastar.json"),
            ]
        );
        assert_eq!(
            paths.swf_candidates,
            vec![
                app_data.join("AquaStar").join("custom-game.swf"),
                app_data.join("AquaStar").join("aqlite_old.swf"),
                cwd.join("custom-game.swf"),
                cwd.join("aqlite_old.swf"),
                root.join("custom-game.swf"),
                root.join("aqlite_old.swf"),
            ]
        );
        assert_eq!(paths.shell_cache, config.join("loader-cache.json"));
        assert_eq!(
            paths.electron_loader_cache,
            app_data
                .join("AquaStar")
                .join("aquastar.adventure-quest-worlds.launcher-config.json")
        );
        let host = electron_profile(None);
        assert!(host.shell_cache.ends_with("loader-cache.json"));
        assert!(host
            .settings_files
            .last()
            .unwrap()
            .ends_with(Path::new("AquaStar").join("aquastar.json")));
        assert!(host
            .electron_loader_cache
            .ends_with("aquastar.adventure-quest-worlds.launcher-config.json"));
    }
}
