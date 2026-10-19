mod catalog;
mod flash_menu;
mod movie;
mod window_icon;

pub use movie::MovieKind;
pub(crate) use catalog::{Arch, Os};

use serde::{Deserialize, Serialize};
#[cfg(test)]
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::placement::PlayerRoots;
use crate::ruffle::{self, ExitReport, RuffleGraphics, RuffleQuality, RuffleSettings};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    Ruffle,
    Flash,
}

impl Engine {
    pub const ALL: [Engine; 2] = [Engine::Ruffle, Engine::Flash];

    pub fn id(&self) -> &'static str {
        match self {
            Engine::Ruffle => "ruffle",
            Engine::Flash => "flash",
        }
    }

    pub fn from_id(id: &str) -> Option<Engine> {
        Engine::ALL.into_iter().find(|engine| engine.id() == id)
    }

    pub fn preferred() -> Option<Engine> {
        match (catalog::Os::host(), catalog::Arch::host()) {
            (Some(os), Some(arch)) => Self::preferred_for(os, arch),
            _ => None,
        }
    }

    pub fn preferred_for(os: catalog::Os, arch: catalog::Arch) -> Option<Engine> {
        if catalog::Catalog::pinned()
            .select(Engine::Ruffle, os, arch)
            .is_some()
        {
            Some(Engine::Ruffle)
        } else if catalog::Catalog::pinned()
            .select(Engine::Flash, os, arch)
            .is_some()
        {
            Some(Engine::Flash)
        } else {
            None
        }
    }

    pub fn supported(&self) -> bool {
        match (catalog::Os::host(), catalog::Arch::host()) {
            (Some(os), Some(arch)) => self.supported_on(os, arch),
            _ => false,
        }
    }

    /// Version of the player AquaStar ships for this system (`1.7.0`, `32.0.0.465`).
    pub fn version_on(&self, os: catalog::Os, arch: catalog::Arch) -> Option<String> {
        catalog::Catalog::pinned()
            .select(*self, os, arch)
            .map(|pin| pin.version.clone())
    }

    pub fn supported_on(&self, os: catalog::Os, arch: catalog::Arch) -> bool {
        catalog::Catalog::pinned().select(*self, os, arch).is_some()
    }

}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Presence {
    Running,
    Idle,
}

struct FallbackWatch {
    graphics: RuffleGraphics,
    started: Instant,
    panicked: Arc<AtomicBool>,
    stderr_done: mpsc::Receiver<()>,
    tail: Arc<Mutex<String>>,
    exe: PathBuf,
    swf: String,
    cli: catalog::Cli,
    quality: RuffleQuality,
    save_directory: Option<PathBuf>,
}

struct Tracked {
    engine: Engine,
    child: Child,
    killed: Arc<AtomicBool>,
    watch: Option<FallbackWatch>,
}

struct LaunchHold<'a>(&'a AtomicBool);

impl Drop for LaunchHold<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

#[derive(Clone)]
pub struct Players {
    children: Arc<Mutex<Vec<Tracked>>>,
    shutting_down: Arc<AtomicBool>,
    launch_gate: Arc<Mutex<()>>,
    launch_hold: Arc<AtomicBool>,
    presence_hook: Arc<Mutex<Option<Arc<dyn Fn(Presence) + Send + Sync>>>>,
    last_presence: Arc<Mutex<Option<Presence>>>,
    reaper_started: Arc<AtomicBool>,
}

impl Default for Players {
    fn default() -> Self {
        Self {
            children: Arc::new(Mutex::new(Vec::new())),
            shutting_down: Arc::new(AtomicBool::new(false)),
            launch_gate: Arc::new(Mutex::new(())),
            launch_hold: Arc::new(AtomicBool::new(false)),
            presence_hook: Arc::new(Mutex::new(None)),
            last_presence: Arc::new(Mutex::new(None)),
            reaper_started: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// Set by the launcher when it installed a WebKit-only fontconfig.
/// Player processes drop `FONTCONFIG_FILE` only when this is present, so a
/// fontconfig the user set themselves still reaches Ruffle and Flash.
pub const LIMITED_FONTS_MARKER: &str = "AQUASTAR_LITE_FONTCONFIG";

fn without_launcher_fontconfig(cmd: &mut Command) {
    if std::env::var_os(LIMITED_FONTS_MARKER).is_some() {
        cmd.env_remove("FONTCONFIG_FILE");
        cmd.env_remove(LIMITED_FONTS_MARKER);
    }
}

/// AppImage AppRun points the dynamic linker and GTK module paths at the bundle.
/// The Flash projector is GTK 2. That `usr/lib` directory also holds GTK 3, and
/// inheriting it makes the projector exit before it maps a window (GLib-GObject
/// NULL class). The scrub applies to Ruffle and Flash. Flash then gets only
/// `usr/lib/aquastar-lite/flash-gtk2` on `LD_LIBRARY_PATH`.
const APPIMAGE_DROP: &[&str] = &[
    "GTK_PATH",
    "GTK_EXE_PREFIX",
    "GTK_IM_MODULE_FILE",
    "GTK_DATA_PREFIX",
    "GDK_PIXBUF_MODULE_FILE",
    "GIO_MODULE_DIR",
    "GSETTINGS_SCHEMA_DIR",
    "GI_TYPELIB_PATH",
    "PYTHONHOME",
    "PYTHONPATH",
    "QT_PLUGIN_PATH",
];
const APPIMAGE_PATH_LISTS: &[&str] = &["LD_LIBRARY_PATH", "XDG_DATA_DIRS", "LD_PRELOAD"];

fn scrub_player_env(vars: Vec<(String, String)>) -> Vec<(String, String)> {
    let appdir = vars
        .iter()
        .find(|(key, _)| key == "APPDIR")
        .map(|(_, value)| value.clone())
        .filter(|value| !value.is_empty());
    let Some(appdir) = appdir else {
        return vars;
    };
    let mut out = Vec::with_capacity(vars.len());
    for (key, value) in vars {
        if APPIMAGE_DROP.contains(&key.as_str()) && value.contains(&appdir) {
            continue;
        }
        if APPIMAGE_PATH_LISTS.contains(&key.as_str()) {
            let kept: Vec<&str> = value
                .split(':')
                .filter(|part| !part.is_empty() && !part.contains(&appdir))
                .collect();
            if kept.is_empty() {
                continue;
            }
            out.push((key, kept.join(":")));
            continue;
        }
        out.push((key, value));
    }
    out
}

/// GTK 2 libraries copied by `desktop/scripts/bundle-flash-gtk2.sh` and packed into
/// the AppImage. The deb uses the system packages instead, so this stays empty
/// unless `APPDIR` is set.
const FLASH_RUNTIME_DIR: &str = "usr/lib/aquastar-lite/flash-gtk2";
const FLASH_RUNTIME_MARK: &str = "libgtk-x11-2.0.so.0";

fn flash_runtime_libs(appdir: &Path) -> Option<PathBuf> {
    let dir = appdir.join(FLASH_RUNTIME_DIR);
    dir.join(FLASH_RUNTIME_MARK).is_file().then_some(dir)
}

fn flash_library_path(libs: &Path, scrubbed: &[(String, String)]) -> String {
    let dir = libs.to_string_lossy();
    match scrubbed.iter().find(|(key, _)| key == "LD_LIBRARY_PATH") {
        Some((_, existing)) if !existing.is_empty() => format!("{dir}:{existing}"),
        _ => dir.into_owned(),
    }
}

fn apply_player_env(cmd: &mut Command, engine: Engine) {
    let parent: Vec<(String, String)> = std::env::vars().collect();
    let scrubbed = scrub_player_env(parent);
    for (key, value) in std::env::vars() {
        match scrubbed.iter().find(|(name, _)| name == &key) {
            Some((_, new)) if new != &value => {
                cmd.env(key, new);
            }
            Some(_) => {}
            None => {
                cmd.env_remove(key);
            }
        }
    }
    without_launcher_fontconfig(cmd);
    if engine == Engine::Flash {
        if let Some(appdir) = std::env::var_os("APPDIR") {
            if let Some(libs) = flash_runtime_libs(Path::new(&appdir)) {
                cmd.env("LD_LIBRARY_PATH", flash_library_path(&libs, &scrubbed));
            }
        }
        if let Some(preload) = flash_gtk_preload(&scrubbed) {
            cmd.env("LD_PRELOAD", preload);
            if let Some(icon) = flash_icon_file() {
                cmd.env("AQUASTAR_FLASH_ICON", icon);
            }
        }
    }
}

#[cfg(target_os = "linux")]
fn flash_cache_dir() -> Option<PathBuf> {
    let base = std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache")))?;
    let dir = base.join("aquastar-lite");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

/// The icon the GTK helper gives the Flash projector window. GTK loads it from a file.
#[cfg(target_os = "linux")]
fn flash_icon_file() -> Option<PathBuf> {
    let path = flash_cache_dir()?.join("aquastar-icon.png");
    if std::fs::read(&path).ok().as_deref() != Some(window_icon::PNG_64) {
        std::fs::write(&path, window_icon::PNG_64).ok()?;
    }
    Some(path)
}

#[cfg(target_os = "linux")]
fn flash_gtk_library() -> Option<PathBuf> {
    const BYTES: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/libaquastar_flash_gtk.so"));
    let dir = flash_cache_dir()?;
    let path = dir.join("libaquastar_flash_gtk.so");
    if std::fs::read(&path).ok().as_deref() != Some(BYTES) {
        let tmp = dir.join(format!(
            "libaquastar_flash_gtk.so.{}.tmp",
            std::process::id()
        ));
        std::fs::write(&tmp, BYTES).ok()?;
        std::fs::rename(&tmp, &path).ok()?;
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755));
    }
    Some(path)
}

#[cfg(not(target_os = "linux"))]
fn flash_gtk_library() -> Option<PathBuf> {
    None
}

#[cfg(not(target_os = "linux"))]
fn flash_icon_file() -> Option<PathBuf> {
    None
}

fn flash_gtk_preload(scrubbed: &[(String, String)]) -> Option<String> {
    let path = flash_gtk_library()?;
    let mut preload = path.to_string_lossy().into_owned();
    if let Some((_, existing)) = scrubbed.iter().find(|(key, _)| key == "LD_PRELOAD") {
        if !existing.is_empty() {
            preload.push(':');
            preload.push_str(existing);
        }
    }
    Some(preload)
}

impl Players {
    pub fn launch_movie(
        &self,
        roots: &PlayerRoots,
        engine: Engine,
        profile: &crate::placement::ProfilePaths,
        kind: MovieKind,
        settings: &RuffleSettings,
        save_directory: Option<&Path>,
    ) -> Result<String, String> {
        let movie = movie::resolve(profile, kind);
        self.launch(
            roots,
            engine,
            &movie.player_arg(),
            settings,
            save_directory,
        )
    }

    pub(crate) fn launch_source(&self, roots: &PlayerRoots, engine: Engine, source: &str, settings: &RuffleSettings, saves: Option<&Path>) -> Result<String, String> {
        self.launch(roots, engine, source, settings, saves)
    }

    fn launch(
        &self,
        roots: &PlayerRoots,
        engine: Engine,
        swf: &str,
        settings: &RuffleSettings,
        save_directory: Option<&Path>,
    ) -> Result<String, String> {
        let os = catalog::Os::host()
            .ok_or_else(|| format!("{engine:?} is not available on this platform"))?;
        let arch = catalog::Arch::host()
            .ok_or_else(|| format!("{engine:?} is not available on this platform"))?;
        let pin = catalog::Catalog::pinned()
            .select(engine, os, arch)
            .ok_or_else(|| format!("{engine:?} is not available on this platform"))?;
        let located = match locate(pin, roots) {
            Some(source) => source.path().to_path_buf(),
            None => catalog::publish(&pin, roots.app_data())?,
        };
        self.launch_at(&located, engine, pin.cli, swf, settings, save_directory)
    }

    pub fn watch_presence(
        &self,
        hook: impl Fn(Presence) + Send + Sync + 'static,
    ) -> Result<(), &'static str> {
        let mut slot = self.presence_hook.lock().unwrap();
        if slot.is_some() {
            return Err("presence is already watched");
        }
        *slot = Some(Arc::new(hook));
        Ok(())
    }

    fn launch_at(
        &self,
        exe: &Path,
        engine: Engine,
        cli: catalog::Cli,
        swf: &str,
        settings: &RuffleSettings,
        save_directory: Option<&Path>,
    ) -> Result<String, String> {
        self.launch_hold.store(true, Ordering::SeqCst);
        let _hold = LaunchHold(&self.launch_hold);
        let _gate = self.launch_gate.lock().unwrap();
        self.start_player(exe, engine, cli, swf, settings, save_directory)
    }

    fn start_player(
        &self,
        exe: &Path,
        engine: Engine,
        cli: catalog::Cli,
        swf: &str,
        settings: &RuffleSettings,
        save_directory: Option<&Path>,
    ) -> Result<String, String> {
        if let Some(msg) = self.prepare(engine) {
            return Ok(msg);
        }
        let save_directory = save_directory.map(Path::to_path_buf);
        let settings = settings.for_platform(std::env::consts::OS);
        let graphics = settings.graphics;
        let ruffle_may_fallback = engine == Engine::Ruffle && graphics != RuffleGraphics::Gl;
        let args = argv(&cli, &movie_from_arg(swf), &settings, save_directory.as_deref());
        if engine == Engine::Flash {
            log_flash_launch(exe, &args);
        }
        let mut child = spawn_player(
            exe,
            engine,
            &args,
            ruffle_may_fallback || engine == Engine::Flash,
        )?;
        let started = Instant::now();
        let panicked = Arc::new(AtomicBool::new(false));
        let killed = Arc::new(AtomicBool::new(false));
        flash_menu::watch(engine, child.id(), killed.clone());
        let tail = Arc::new(Mutex::new(String::new()));
        let flash_err = (engine == Engine::Flash).then(|| stderr_tail(child.stderr.take()));
        let stderr_done = ruffle_may_fallback
            .then(|| watch_stderr(child.stderr.take(), panicked.clone(), tail.clone()));

        std::thread::sleep(Duration::from_millis(800));
        match child.try_wait() {
            Ok(Some(status)) => {
                finish_stderr(stderr_done);
                if let Some(logged) = flash_err.as_ref() {
                    if status.code() == Some(127) {
                        return Err(flash_missing_library(&logged.finish()));
                    }
                }
                let report = exit_report(graphics, status, started, &panicked, &killed);
                if ruffle_may_fallback && ruffle::should_fallback(&report) {
                    log_fallback(&report, &tail.lock().unwrap());
                    return self.relaunch_gl(
                        exe,
                        swf,
                        cli,
                        settings.quality,
                        graphics,
                        save_directory.as_deref(),
                    );
                }
                Err(format!(
                    "{engine:?} exited immediately ({status}); see the terminal log"
                ))
            }
            Ok(None) => {
                let pid = child.id();
                let watch = ruffle_may_fallback.then(|| FallbackWatch {
                    graphics,
                    started,
                    panicked,
                    stderr_done: stderr_done.expect("stderr watch"),
                    tail,
                    exe: exe.to_path_buf(),
                    swf: swf.to_string(),
                    cli,
                    quality: settings.quality,
                    save_directory,
                });
                self.adopt(engine, child, killed, watch)?;
                Ok(format!("{engine:?} started (pid {pid})"))
            }
            Err(e) => Err(format!("could not check {engine:?}: {e}")),
        }
    }

    /// Drop exited children. If this engine is already up, say so. Otherwise stop
    /// the other engine so the launcher never keeps two game processes.
    fn prepare(&self, engine: Engine) -> Option<String> {
        let mut list = self.children.lock().unwrap();
        list.retain_mut(|t| matches!(t.child.try_wait(), Ok(None)));
        if list.iter().any(|t| t.engine == engine) {
            return Some(format!("{engine:?} is already running"));
        }
        for tracked in list.drain(..) {
            tracked.killed.store(true, Ordering::SeqCst);
            let mut child = tracked.child;
            let _ = child.kill();
            let _ = child.wait();
        }
        None
    }

    fn adopt(
        &self,
        engine: Engine,
        mut child: Child,
        killed: Arc<AtomicBool>,
        watch: Option<FallbackWatch>,
    ) -> Result<(), String> {
        let mut list = self.children.lock().unwrap();
        list.retain_mut(|t| matches!(t.child.try_wait(), Ok(None)));
        if self.shutting_down.load(Ordering::SeqCst) {
            drop(list);
            let _ = child.kill();
            let _ = child.wait();
            return Err("AquaStar is closing".into());
        }
        list.push(Tracked {
            engine,
            child,
            killed,
            watch,
        });
        drop(list);
        self.ensure_reaper();
        Ok(())
    }

    fn relaunch_gl(
        &self,
        exe: &Path,
        swf: &str,
        cli: catalog::Cli,
        quality: RuffleQuality,
        from: RuffleGraphics,
        save_directory: Option<&Path>,
    ) -> Result<String, String> {
        if self.shutting_down.load(Ordering::SeqCst) {
            return Err("AquaStar is closing".into());
        }
        let settings = RuffleSettings {
            quality,
            graphics: ruffle::safe_graphics(std::env::consts::OS),
        };
        let mut child = spawn_player(
            exe,
            Engine::Ruffle,
            &argv(&cli, &movie_from_arg(swf), &settings, save_directory),
            false,
        )?;
        std::thread::sleep(Duration::from_millis(800));
        if self.shutting_down.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("AquaStar is closing".into());
        }
        let backend = safe_backend_name();
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!(
                "Ruffle exited immediately with {backend} ({status}); see the terminal log"
            ));
        }
        let pid = child.id();
        let killed = Arc::new(AtomicBool::new(false));
        flash_menu::watch(Engine::Ruffle, pid, killed.clone());
        self.adopt(Engine::Ruffle, child, killed, None)?;
        Ok(format!(
            "Ruffle ({}) crashed; relaunched with {backend} (pid {pid})",
            from.as_str()
        ))
    }

    fn ensure_reaper(&self) {
        if self.reaper_started.swap(true, Ordering::SeqCst) {
            return;
        }
        let players = self.clone();
        std::thread::spawn(move || {
            while !players.shutting_down.load(Ordering::SeqCst) {
                players.reap();
                std::thread::sleep(Duration::from_millis(200));
            }
            players.reap();
        });
    }

    fn reap(&self) {
        if let Some((status, tracked)) = self.take_exited_watch() {
            self.fallback(status, tracked);
        }
        self.emit_presence();
    }

    fn take_exited_watch(&self) -> Option<(std::process::ExitStatus, Tracked)> {
        let mut list = self.children.lock().unwrap();
        let mut watch_at = None;
        let mut index = 0;
        while index < list.len() {
            match list[index].child.try_wait() {
                Ok(None) => index += 1,
                Ok(Some(status)) => {
                    if list[index].watch.is_some() && watch_at.is_none() {
                        watch_at = Some((index, status));
                        index += 1;
                    } else {
                        list.remove(index);
                    }
                }
                Err(_) => {
                    list.remove(index);
                }
            }
        }
        let (index, status) = watch_at?;
        Some((status, list.remove(index)))
    }

    fn fallback(&self, status: std::process::ExitStatus, tracked: Tracked) {
        let Some(watch) = tracked.watch else {
            return;
        };
        let _ = watch.stderr_done.recv_timeout(Duration::from_millis(500));
        let report = exit_report(
            watch.graphics,
            status,
            watch.started,
            &watch.panicked,
            &tracked.killed,
        );
        if !ruffle::should_fallback(&report) || self.shutting_down.load(Ordering::SeqCst) {
            return;
        }
        let tail_text = watch
            .tail
            .lock()
            .map(|text| text.clone())
            .unwrap_or_default();
        log_fallback(&report, &tail_text);
        self.launch_hold.store(true, Ordering::SeqCst);
        let _gate = self.launch_gate.lock().unwrap();
        let busy = {
            let mut list = self.children.lock().unwrap();
            list.retain_mut(|tracked| matches!(tracked.child.try_wait(), Ok(None)));
            !list.is_empty()
        };
        if !busy {
            if let Err(err) = self.relaunch_gl(
                &watch.exe,
                &watch.swf,
                watch.cli,
                watch.quality,
                watch.graphics,
                watch.save_directory.as_deref(),
            ) {
                eprintln!("aquastar-lite: OpenGL relaunch failed: {err}");
            }
        }
        self.launch_hold.store(false, Ordering::SeqCst);
    }

    pub fn presence(&self) -> Presence {
        self.last_presence.lock().unwrap().unwrap_or(Presence::Idle)
    }

    fn emit_presence(&self) {
        if self.shutting_down.load(Ordering::SeqCst) {
            return;
        }
        let alive = {
            let mut list = self.children.lock().unwrap();
            let mut count = 0;
            for tracked in list.iter_mut() {
                if matches!(tracked.child.try_wait(), Ok(None)) {
                    count += 1;
                }
            }
            count
        };
        let hold = self.launch_hold.load(Ordering::SeqCst);
        let mut last = self.last_presence.lock().unwrap();
        if alive > 0 && *last != Some(Presence::Running) {
            *last = Some(Presence::Running);
            drop(last);
            self.emit(Presence::Running);
        } else if alive == 0 && !hold && *last == Some(Presence::Running) {
            drop(last);
            if self.shutting_down.load(Ordering::SeqCst) {
                return;
            }
            self.emit(Presence::Idle);
            *self.last_presence.lock().unwrap() = Some(Presence::Idle);
        }
    }

    fn emit(&self, presence: Presence) {
        let hook = self.presence_hook.lock().unwrap().clone();
        if let Some(hook) = hook {
            hook(presence);
        }
    }

    pub fn kill_all(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
        for mut tracked in self.children.lock().unwrap().drain(..) {
            tracked.killed.store(true, Ordering::SeqCst);
            let _ = tracked.child.kill();
            let _ = tracked.child.wait();
        }
    }
}

pub fn warm_loader(paths: &crate::placement::ProfilePaths) {
    if let Err(err) = movie::refresh(paths) {
        eprintln!("aquastar-lite: loader refresh skipped: {err}");
    }
}

fn movie_from_arg(swf: &str) -> movie::Movie {
    if swf.starts_with("https://") || swf.starts_with("http://") {
        movie::Movie::https(swf)
    } else {
        movie::Movie::file(PathBuf::from(swf))
    }
}

fn argv(
    cli: &catalog::Cli,
    movie: &movie::Movie,
    settings: &RuffleSettings,
    save_directory: Option<&Path>,
) -> Vec<String> {
    let arg = movie.player_arg();
    match cli {
        catalog::Cli::Projector => vec![arg],
        catalog::Cli::Stock | catalog::Cli::Artix => {
            let mut args = ruffle::ruffle_args(&arg, settings, std::env::consts::OS);
            if let Some(dir) = save_directory {
                let movie_arg = args.pop().expect("ruffle args end with the movie");
                args.push("--save-directory".to_string());
                args.push(dir.to_string_lossy().into_owned());
                args.push(movie_arg);
            }
            if *cli == catalog::Cli::Artix {
                let movie_arg = args.pop().expect("ruffle args end with the movie");
                args.push("--title".to_string());
                args.push(flash_menu::PLAYER_TITLE.to_string());
                args.push(movie_arg);
            }
            args
        }
    }
}

/// Nearest `Something.app` that contains this executable. That is `Ruffle.app` or
/// `Flash Player.app`, not an outer launcher that also ends in `.app`.
#[cfg(target_os = "macos")]
fn containing_app(exe: &Path) -> Option<&Path> {
    exe.ancestors()
        .find(|path| path.extension().and_then(|ext| ext.to_str()) == Some("app"))
}

#[cfg(target_os = "macos")]
fn clear_quarantine(exe: &Path) {
    let _ = Command::new("xattr")
        .args(["-d", "com.apple.quarantine"])
        .arg(exe)
        .status();
    if let Some(app) = containing_app(exe) {
        let _ = Command::new("xattr")
            .args(["-dr", "com.apple.quarantine"])
            .arg(app)
            .status();
    }
}

#[cfg(not(target_os = "macos"))]
fn clear_quarantine(exe: &Path) {
    let _ = exe;
}

fn is_bad_cpu(err: &std::io::Error) -> bool {
    // errno 86 is EBADARCH. macOS also phrases it as "Bad CPU type in executable".
    err.raw_os_error() == Some(86)
        || err
            .to_string()
            .to_ascii_lowercase()
            .contains("bad cpu type")
}

fn spawn_failure(exe: &Path, err: std::io::Error) -> String {
    if is_bad_cpu(&err) {
        return format!(
            "could not start {}: bad CPU type (errno 86). The Flash projector is Intel-only and Rosetta is not installed. Install it with `softwareupdate --install-rosetta`, or play with Ruffle.",
            exe.display()
        );
    }
    format!("could not start {}: {err}", exe.display())
}

fn spawn_player(
    exe: &Path,
    engine: Engine,
    args: &[String],
    capture_stderr: bool,
) -> Result<Child, String> {
    clear_quarantine(exe);
    let mut cmd = Command::new(exe);
    cmd.args(args);
    if capture_stderr {
        cmd.stderr(Stdio::piped());
    }
    apply_player_env(&mut cmd, engine);
    cmd.spawn().map_err(|err| spawn_failure(exe, err))
}

struct StderrTail {
    done: mpsc::Receiver<()>,
    text: Arc<Mutex<String>>,
}

impl StderrTail {
    fn finish(&self) -> String {
        let _ = self.done.recv_timeout(Duration::from_millis(500));
        self.text.lock().unwrap().clone()
    }
}

fn stderr_tail(stderr: Option<ChildStderr>) -> StderrTail {
    let text = Arc::new(Mutex::new(String::new()));
    let slot = Arc::clone(&text);
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        if let Some(mut stderr) = stderr {
            let mut buf = [0u8; 1024];
            let mut acc = String::new();
            loop {
                match stderr.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        acc.push_str(&String::from_utf8_lossy(&buf[..n]));
                        if acc.len() > 4096 {
                            let mut cut = acc.len() - 4096;
                            while !acc.is_char_boundary(cut) {
                                cut += 1;
                            }
                            acc.drain(..cut);
                        }
                        if let Ok(mut guard) = slot.lock() {
                            *guard = acc.clone();
                        }
                    }
                }
            }
        }
        let _ = tx.send(());
    });
    StderrTail { done: rx, text }
}

/// The dynamic linker names the first library it could not open.
fn missing_shared_library(stderr: &str) -> Option<&str> {
    let marker = "error while loading shared libraries: ";
    let rest = stderr.split(marker).nth(1)?;
    let name = rest.split([':', ' ', '\n']).next()?.trim();
    (!name.is_empty()).then_some(name)
}

fn flash_library_package(library: &str) -> &'static str {
    match library {
        "libgtk-x11-2.0.so.0" | "libgdk-x11-2.0.so.0" => {
            " (Debian and Ubuntu: libgtk2.0-0t64 or libgtk2.0-0)"
        }
        "libnss3.so" | "libsmime3.so" | "libssl3.so" | "libnspr4.so" | "libnssutil3.so"
        | "libplc4.so" | "libplds4.so" => " (Debian and Ubuntu: libnss3)",
        _ => "",
    }
}

fn flash_missing_library(stderr: &str) -> String {
    let Some(library) = missing_shared_library(stderr) else {
        return "Flash could not start because a library it needs is missing (exit 127). Use Ruffle, or install GTK 2 and NSS (Debian and Ubuntu: libgtk2.0-0t64 or libgtk2.0-0, and libnss3).".to_string();
    };
    format!(
        "Flash could not start because {library} is missing. Use Ruffle, or install the package that provides it{}.",
        flash_library_package(library)
    )
}

fn watch_stderr(
    stderr: Option<ChildStderr>,
    panicked: Arc<AtomicBool>,
    tail: Arc<Mutex<String>>,
) -> mpsc::Receiver<()> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        if let Some(mut stderr) = stderr {
            let mut buf = [0u8; 1024];
            let mut acc = String::new();
            loop {
                match stderr.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]);
                        ruffle::note_stderr(&mut acc, &chunk, &panicked);
                        if let Ok(mut slot) = tail.lock() {
                            *slot = acc.clone();
                        }
                    }
                }
            }
        }
        let _ = tx.send(());
    });
    rx
}

fn finish_stderr(done: Option<mpsc::Receiver<()>>) {
    if let Some(done) = done {
        let _ = done.recv_timeout(Duration::from_millis(500));
    }
}

fn exit_report(
    graphics: RuffleGraphics,
    status: ExitStatus,
    started: Instant,
    panicked: &AtomicBool,
    killed: &AtomicBool,
) -> ExitReport {
    ExitReport {
        graphics,
        code: status.code(),
        signal: exit_signal(&status),
        elapsed: started.elapsed(),
        panicked: panicked.load(Ordering::SeqCst),
        killed_by_us: killed.load(Ordering::SeqCst),
    }
}

#[cfg(unix)]
fn exit_signal(status: &ExitStatus) -> Option<i32> {
    use std::os::unix::process::ExitStatusExt;
    status.signal()
}
#[cfg(not(unix))]
fn exit_signal(status: &ExitStatus) -> Option<i32> {
    let _ = status;
    None
}

fn log_flash_launch(exe: &Path, args: &[String]) {
    let args = if args.is_empty() {
        "(none)".to_string()
    } else {
        args.join(" ")
    };
    eprintln!(
        "aquastar-lite: launching Flash {} args={args}",
        exe.display()
    );
}

fn log_fallback(report: &ExitReport, tail: &str) {
    let code = report
        .code
        .map(|c| c.to_string())
        .unwrap_or_else(|| "null".into());
    let signal = report
        .signal
        .map(|s| s.to_string())
        .unwrap_or_else(|| "null".into());
    eprintln!(
        "aquastar-lite: Ruffle desktop ({}) exited abnormally (code {code}, signal {signal}, {} ms{}); relaunching with {}. stderr tail: {}",
        report.graphics.as_str(),
        report.elapsed.as_millis(),
        if report.panicked { ", panic" } else { "" },
        safe_backend_name(),
        ruffle::log_tail(tail),
    );
}

fn safe_backend_name() -> &'static str {
    match ruffle::safe_graphics(std::env::consts::OS) {
        ruffle::RuffleGraphics::Metal => "Metal",
        _ => "OpenGL",
    }
}

fn locate(pin: &catalog::Pin, roots: &PlayerRoots) -> Option<catalog::Source> {
    let updated = roots.app_data().join(&pin.dir);
    if catalog::judge(&updated, pin) == catalog::TreeJudge::Match {
        return Some(catalog::Source::Updated(updated.join(&pin.exe)));
    }
    if let Some(bundled) = roots.bundled() {
        let exe = bundled.join(&pin.dir).join(&pin.exe);
        if exe.is_file() {
            return Some(catalog::Source::Bundled(exe));
        }
    }
    if catalog::judge(&updated, pin) == catalog::TreeJudge::Legacy {
        return Some(catalog::Source::Cached(updated.join(&pin.exe)));
    }
    None
}

#[cfg(test)]
mod pin_tests {
    use super::*;

    #[test]
    fn ruffle_is_preferred_and_apple_silicon_flash_uses_the_intel_projector() {
        assert_eq!(
            Engine::preferred_for(catalog::Os::Linux, catalog::Arch::X86_64),
            Some(Engine::Ruffle)
        );
        assert_eq!(
            Engine::preferred_for(catalog::Os::Windows, catalog::Arch::X86_64),
            Some(Engine::Ruffle)
        );
        assert_eq!(
            Engine::preferred_for(catalog::Os::Macos, catalog::Arch::X86_64),
            Some(Engine::Ruffle)
        );
        assert_eq!(
            Engine::preferred_for(catalog::Os::Macos, catalog::Arch::Aarch64),
            Some(Engine::Ruffle)
        );
        assert_eq!(
            Engine::preferred_for(catalog::Os::Linux, catalog::Arch::Aarch64),
            Some(Engine::Ruffle)
        );
        assert_eq!(
            Engine::preferred_for(catalog::Os::Linux, catalog::Arch::X86),
            Some(Engine::Ruffle)
        );
        assert_eq!(
            Engine::preferred_for(catalog::Os::Windows, catalog::Arch::X86),
            Some(Engine::Ruffle)
        );
        assert_eq!(
            Engine::preferred_for(catalog::Os::Windows, catalog::Arch::Aarch64),
            None
        );
        assert!(Engine::Flash.supported_on(catalog::Os::Macos, catalog::Arch::Aarch64));
        assert!(Engine::Flash.supported_on(catalog::Os::Macos, catalog::Arch::X86_64));
        assert!(Engine::Ruffle.supported_on(catalog::Os::Linux, catalog::Arch::X86_64));
        assert!(Engine::Flash.supported_on(catalog::Os::Linux, catalog::Arch::X86_64));
        assert!(Engine::Flash.supported_on(catalog::Os::Windows, catalog::Arch::X86_64));
        assert!(Engine::Flash.supported_on(catalog::Os::Windows, catalog::Arch::X86));
        assert!(!Engine::Flash.supported_on(catalog::Os::Linux, catalog::Arch::Aarch64));
        assert!(!Engine::Flash.supported_on(catalog::Os::Linux, catalog::Arch::X86));
        assert_eq!(Engine::ALL, [Engine::Ruffle, Engine::Flash]);
        let missing_rosetta = spawn_failure(
            Path::new("Flash Player.app/Contents/MacOS/Flash Player"),
            std::io::Error::from_raw_os_error(86),
        );
        assert!(missing_rosetta.contains("softwareupdate --install-rosetta"));
        assert!(missing_rosetta.contains("Ruffle"));
        assert!(missing_rosetta.contains("Flash Player.app/Contents/MacOS/Flash Player"));
        assert_eq!(
            Engine::preferred(),
            Engine::preferred_for(
                catalog::Os::host().expect("os"),
                catalog::Arch::host().expect("arch")
            )
        );
    }

    #[test]
    fn presence_is_watched_once() {
        let players = Players::default();
        players.watch_presence(|_| {}).unwrap();
        assert!(players.watch_presence(|_| {}).is_err());
    }
}

#[cfg(test)]
mod locate_tests {
    use super::*;
    use crate::placement::placement_for;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "aquastar-lite-locate-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn host_pin() -> &'static catalog::Pin {
        catalog::Catalog::pinned()
            .select(
                Engine::Ruffle,
                catalog::Os::host().expect("os"),
                catalog::Arch::host().expect("arch"),
            )
            .expect("ruffle pin")
    }

    fn touch_exe(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"player").unwrap();
    }

    fn roots(app_data_dir: &Path, resource: Option<&Path>) -> PlayerRoots {
        placement_for(false, app_data_dir).player_roots(app_data_dir, resource, None)
    }

    #[test]
    fn a_matching_stamp_beats_a_bundled_exe() {
        let pin = host_pin();
        let base = scratch("stamp");
        let app_data_dir = base.join("app");
        let resource = base.join("resource");
        let live = app_data_dir.join("players").join(&pin.dir);
        touch_exe(&live.join(&pin.exe));
        fs::write(live.join(catalog::STAMP_NAME), format!("{}\n", pin.sha256)).unwrap();
        let bundled = resource.join("players").join(&pin.dir).join(&pin.exe);
        touch_exe(&bundled);
        let source = locate(&pin, &roots(&app_data_dir, Some(&resource))).unwrap();
        assert!(matches!(source, catalog::Source::Updated(_)));
        assert_eq!(source.path(), live.join(&pin.exe));
    }

    #[test]
    fn a_bundled_exe_beats_a_stamp_less_copy_and_is_not_copied() {
        let pin = host_pin();
        let base = scratch("bundled");
        let app_data_dir = base.join("app");
        let resource = base.join("resource");
        let cached = app_data_dir.join("players").join(&pin.dir).join(&pin.exe);
        touch_exe(&cached);
        let bundled = resource.join("players").join(&pin.dir).join(&pin.exe);
        touch_exe(&bundled);
        let source = locate(&pin, &roots(&app_data_dir, Some(&resource))).unwrap();
        assert!(matches!(source, catalog::Source::Bundled(_)));
        assert_eq!(source.path(), bundled.as_path());
    }

    #[test]
    fn a_foreign_stamp_loses_to_a_bundled_exe_and_is_not_cached() {
        let pin = host_pin();
        let base = scratch("foreign");
        let app_data_dir = base.join("app");
        let resource = base.join("resource");
        let live = app_data_dir.join("players").join(&pin.dir);
        touch_exe(&live.join(&pin.exe));
        fs::write(live.join(catalog::STAMP_NAME), "not-this-pin\n").unwrap();
        let bundled = resource.join("players").join(&pin.dir).join(&pin.exe);
        touch_exe(&bundled);
        let source = locate(&pin, &roots(&app_data_dir, Some(&resource))).unwrap();
        assert!(matches!(source, catalog::Source::Bundled(_)));
        assert_eq!(source.path(), bundled.as_path());
    }

    #[test]
    fn a_foreign_stamp_with_no_bundle_is_not_a_source() {
        let pin = host_pin();
        let base = scratch("foreign-only");
        let app_data_dir = base.join("app");
        let live = app_data_dir.join("players").join(&pin.dir);
        touch_exe(&live.join(&pin.exe));
        fs::write(live.join(catalog::STAMP_NAME), "not-this-pin\n").unwrap();
        assert!(locate(&pin, &roots(&app_data_dir, None)).is_none());
    }

    #[test]
    fn a_stamp_less_exe_is_cached_only_when_nothing_is_bundled() {
        let pin = host_pin();
        let base = scratch("cached");
        let app_data_dir = base.join("app");
        let cached = app_data_dir.join("players").join(&pin.dir).join(&pin.exe);
        touch_exe(&cached);
        let source = locate(&pin, &roots(&app_data_dir, None)).unwrap();
        assert!(matches!(source, catalog::Source::Cached(_)));
        assert_eq!(source.path(), cached.as_path());
    }

    #[test]
    fn nothing_matching_returns_none_and_keeps_the_parents_distinct() {
        let pin = host_pin();
        let base = scratch("none");
        let app_data_dir = base.join("app");
        let resource = base.join("resource");
        fs::create_dir_all(resource.join("players")).unwrap();
        let built = roots(&app_data_dir, Some(&resource));
        assert!(locate(&pin, &built).is_none());
        assert_ne!(built.app_data(), built.bundled().unwrap());
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::ruffle::{RuffleGraphics, RuffleQuality, RuffleSettings};
    use std::os::unix::fs::PermissionsExt;

    struct Stop(Players);
    impl Drop for Stop {
        fn drop(&mut self) {
            self.0.kill_all();
        }
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("aquastar-lite-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_script(dir: &Path, body: &str) -> PathBuf {
        let path = dir.join("fake-ruffle.sh");
        fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    fn log_lines(log: &Path) -> Vec<String> {
        fs::read_to_string(log)
            .unwrap_or_default()
            .lines()
            .map(str::to_string)
            .collect()
    }

    fn record(players: &Players) -> Arc<Mutex<Vec<Presence>>> {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        players
            .watch_presence(move |presence| sink.lock().unwrap().push(presence))
            .unwrap();
        seen
    }

    fn automatic_low() -> RuffleSettings {
        RuffleSettings {
            quality: RuffleQuality::Low,
            graphics: RuffleGraphics::Automatic,
        }
    }

    #[test]
    fn a_bundled_player_runs_in_place() {
        let pin = catalog::Catalog::pinned()
            .select(
                Engine::Ruffle,
                catalog::Os::host().expect("os"),
                catalog::Arch::host().expect("arch"),
            )
            .expect("ruffle pin");
        let base = scratch("in-place");
        let resource = base.join("resource");
        let bundled = resource.join("players").join(&pin.dir).join(&pin.exe);
        fs::create_dir_all(bundled.parent().unwrap()).unwrap();
        let log = base.join("ran");
        fs::write(
            &bundled,
            format!(
                "#!/bin/sh\nprintf '%s\\n' \"$0\" >> '{}'\nsleep 60\n",
                log.display()
            ),
        )
        .unwrap();
        fs::set_permissions(&bundled, fs::Permissions::from_mode(0o755)).unwrap();
        let app_data = base.join("app");
        let roots = crate::placement::placement_for(false, &base).player_roots(
            &app_data,
            Some(&resource),
            None,
        );
        let players = Players::default();
        let _stop = Stop(players.clone());
        let settings = RuffleSettings {
            quality: RuffleQuality::Low,
            graphics: RuffleGraphics::Gl,
        };
        let msg = players
            .launch(&roots, Engine::Ruffle, "movie.swf", &settings, None)
            .unwrap();
        assert!(msg.contains("started"), "{msg}");
        assert_eq!(
            log_lines(&log),
            vec![bundled.to_string_lossy().into_owned()]
        );
        assert!(!app_data.join("players").join(&pin.dir).exists());
        drop(_stop);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn launch_movie_passes_the_chosen_kind_to_the_player() {
        let pin = catalog::Catalog::pinned()
            .select(
                Engine::Ruffle,
                catalog::Os::host().expect("os"),
                catalog::Arch::host().expect("arch"),
            )
            .expect("ruffle pin");
        let base = scratch("movie-kind");
        let resource = base.join("resource");
        let bundled = resource.join("players").join(&pin.dir).join(&pin.exe);
        fs::create_dir_all(bundled.parent().unwrap()).unwrap();
        let log = base.join("ran");
        fs::write(
            &bundled,
            format!(
                "#!/bin/sh\nprintf '%s\\n' \"$*\" >> '{}'\nsleep 60\n",
                log.display()
            ),
        )
        .unwrap();
        fs::set_permissions(&bundled, fs::Permissions::from_mode(0o755)).unwrap();
        let app_data = base.join("app");
        let roots = crate::placement::placement_for(false, &base).player_roots(
            &app_data,
            Some(&resource),
            None,
        );
        let profile = crate::placement::ProfilePaths {
            settings_files: vec![base.join("missing.json")],
            swf_candidates: vec![base.join("missing.swf")],
            shell_cache: base.join("loader-cache.json"),
            electron_loader_cache: base.join("electron.json"),
            aqua_dir: base.join("AquaStar"),
            legacy_reminders: base.join("aquastar_reminders.json"),
        };
        let settings = RuffleSettings {
            quality: RuffleQuality::Low,
            graphics: RuffleGraphics::Gl,
        };
        let start = |kind: MovieKind, needle: &str| {
            let _ = fs::remove_file(&log);
            let players = Players::default();
            let _stop = Stop(players.clone());
            let msg = players
                .launch_movie(&roots, Engine::Ruffle, &profile, kind, &settings, None)
                .unwrap();
            assert!(msg.contains("started"), "{msg}");
            let line = log_lines(&log).pop().expect("argv");
            assert!(line.contains(needle), "{line}");
            assert!(!line.contains("Loader4.swf"), "{line}");
        };
        start(MovieKind::DragonFable, "DFLoader.swf?ver=668201");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn early_non_gl_crash_relaunches_with_opengl_once() {
        let dir = scratch("early");
        let log = dir.join("args");
        let exe = write_script(
            &dir,
            &format!(
                "printf '%s\\n' \"$*\" >> '{}'\n\
             case \" $* \" in\n\
               *' --graphics gl '*) sleep 60 ;;\n\
               *) echo \"thread 'main' panicked at wgpu error: Out of Memory\" >&2; exit 101 ;;\n\
             esac",
                log.display()
            ),
        );
        let players = Players::default();
        let seen = record(&players);
        let _stop = Stop(players.clone());
        let msg = players
            .launch_at(&exe, Engine::Ruffle, catalog::Cli::Stock, "movie.swf", &automatic_low(), None)
            .unwrap();
        assert!(msg.contains("relaunched with OpenGL"), "{msg}");
        assert!(wait_until(|| seen
            .lock()
            .unwrap()
            .contains(&Presence::Running)));
        assert!(
            !seen.lock().unwrap().contains(&Presence::Idle),
            "{:?}",
            seen.lock().unwrap()
        );
        let lines = log_lines(&log);
        assert_eq!(lines.len(), 2, "{lines:?}");
        assert!(lines[0].contains("--graphics default"), "{lines:?}");
        assert!(lines[0].contains("--quality low"), "{lines:?}");
        assert!(lines[0].ends_with("movie.swf"), "{lines:?}");
        assert!(lines[1].contains("--graphics gl"), "{lines:?}");
        assert!(lines[1].contains("--quality low"), "{lines:?}");
        assert_eq!(players.children.lock().unwrap().len(), 1);
        drop(_stop);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_second_crash_does_not_launch_again() {
        let dir = scratch("noloop");
        let log = dir.join("args");
        let exe = write_script(
            &dir,
            &format!(
                "printf '%s\\n' \"$*\" >> '{}'\n\
                 case \" $* \" in\n\
                   *' --graphics gl '*) exit 101 ;;\n\
                   *) echo 'panicked at' >&2; exit 101 ;;\n\
                 esac",
                log.display()
            ),
        );
        let players = Players::default();
        let seen = record(&players);
        let err = players
            .launch_at(&exe, Engine::Ruffle, catalog::Cli::Stock, "movie.swf", &automatic_low(), None)
            .unwrap_err();
        assert!(err.contains("OpenGL"), "{err}");
        assert!(
            seen.lock().unwrap().is_empty(),
            "{:?}",
            seen.lock().unwrap()
        );
        let lines = log_lines(&log);
        assert_eq!(lines.len(), 2, "{lines:?}");
        assert!(lines[1].contains("--graphics gl"), "{lines:?}");
        assert!(players.children.lock().unwrap().is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_clean_early_exit_is_not_relaunched() {
        let dir = scratch("clean");
        let log = dir.join("args");
        let exe = write_script(
            &dir,
            &format!("printf '%s\\n' \"$*\" >> '{}'\nexit 0", log.display()),
        );
        let players = Players::default();
        let seen = record(&players);
        let err = players
            .launch_at(&exe, Engine::Ruffle, catalog::Cli::Stock, "movie.swf", &automatic_low(), None)
            .unwrap_err();
        assert!(err.contains("exited immediately"), "{err}");
        assert!(
            seen.lock().unwrap().is_empty(),
            "{:?}",
            seen.lock().unwrap()
        );
        assert!(!err.contains("OpenGL"), "{err}");
        assert_eq!(log_lines(&log).len(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_crash_after_startup_relaunches_with_opengl_once() {
        let dir = scratch("later");
        let log = dir.join("args");
        let exe = write_script(
            &dir,
            &format!(
                "printf '%s\\n' \"$*\" >> '{}'\n\
             case \" $* \" in\n\
               *' --graphics gl '*) sleep 60 ;;\n\
               *) sleep 1.2; echo 'wgpu error: Out of Memory' >&2; exit 101 ;;\n\
             esac",
                log.display()
            ),
        );
        let players = Players::default();
        let seen = record(&players);
        let _stop = Stop(players.clone());
        let msg = players
            .launch_at(&exe, Engine::Ruffle, catalog::Cli::Stock, "movie.swf", &automatic_low(), None)
            .unwrap();
        assert!(msg.contains("started"), "{msg}");
        let ready = wait_until(|| {
            log_lines(&log).len() >= 2
                && players.children.lock().unwrap().len() == 1
                && log_lines(&log).iter().any(|l| l.contains("--graphics gl"))
        });
        assert!(
            ready,
            "lines={:?} children={}",
            log_lines(&log),
            players.children.lock().unwrap().len()
        );
        std::thread::sleep(Duration::from_millis(400));
        assert_eq!(
            log_lines(&log).len(),
            2,
            "fallback looped: {:?}",
            log_lines(&log)
        );
        assert_eq!(*seen.lock().unwrap(), vec![Presence::Running]);
        drop(_stop);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_flash_crash_is_not_relaunched_as_ruffle() {
        let dir = scratch("flash");
        let log = dir.join("args");
        let exe = write_script(
            &dir,
            &format!("printf '%s\\n' \"$*\" >> '{}'\nexit 101", log.display()),
        );
        let players = Players::default();
        let seen = record(&players);
        let err = players
            .launch_at(&exe, Engine::Flash, catalog::Cli::Projector, "movie.swf", &automatic_low(), None)
            .unwrap_err();
        assert!(err.contains("Flash"), "{err}");
        assert!(
            seen.lock().unwrap().is_empty(),
            "{:?}",
            seen.lock().unwrap()
        );
        assert!(!err.contains("OpenGL"), "{err}");
        assert_eq!(log_lines(&log), ["movie.swf"]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn closing_the_launcher_does_not_relaunch() {
        let dir = scratch("killed");
        let log = dir.join("args");
        let exe = write_script(
            &dir,
            &format!("printf '%s\\n' \"$*\" >> '{}'\nsleep 60", log.display()),
        );
        let players = Players::default();
        let seen = record(&players);
        players
            .launch_at(&exe, Engine::Ruffle, catalog::Cli::Stock, "movie.swf", &automatic_low(), None)
            .unwrap();
        players.kill_all();
        std::thread::sleep(Duration::from_millis(500));
        assert_eq!(log_lines(&log).len(), 1, "{:?}", log_lines(&log));
        assert!(
            !seen.lock().unwrap().contains(&Presence::Idle),
            "{:?}",
            seen.lock().unwrap()
        );
        assert!(players.children.lock().unwrap().is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_second_click_does_not_start_another_player() {
        let dir = scratch("once");
        let log = dir.join("args");
        let exe = write_script(
            &dir,
            &format!("printf '%s\\n' \"$*\" >> '{}'\nsleep 60", log.display()),
        );
        let players = Players::default();
        let _stop = Stop(players.clone());
        players
            .launch_at(
                &exe,
                Engine::Flash,
                catalog::Cli::Projector,
                "movie.swf",
                &RuffleSettings::default(),
                None,
            )
            .unwrap();
        let msg = players
            .launch_at(
                &exe,
                Engine::Flash,
                catalog::Cli::Projector,
                "again.swf",
                &RuffleSettings::default(),
                None,
            )
            .unwrap();
        assert!(msg.contains("already"), "{msg}");
        assert_eq!(log_lines(&log), ["movie.swf"]);
        assert_eq!(players.children.lock().unwrap().len(), 1);
        drop(_stop);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn switching_engines_replaces_the_running_player() {
        let dir = scratch("switch");
        let log = dir.join("args");
        let exe = write_script(
            &dir,
            &format!("printf '%s\\n' \"$*\" >> '{}'\nsleep 60", log.display()),
        );
        let players = Players::default();
        let _stop = Stop(players.clone());
        players
            .launch_at(
                &exe,
                Engine::Ruffle,
                catalog::Cli::Stock,
                "ruffle.swf",
                &RuffleSettings::default(),
                None,
            )
            .unwrap();
        let msg = players
            .launch_at(
                &exe,
                Engine::Flash,
                catalog::Cli::Projector,
                "flash.swf",
                &RuffleSettings::default(),
                None,
            )
            .unwrap();
        assert!(msg.contains("Flash"), "{msg}");
        assert!(!msg.contains("already"), "{msg}");
        let kids = players.children.lock().unwrap();
        assert_eq!(kids.len(), 1);
        assert_eq!(kids[0].engine, Engine::Flash);
        drop(kids);
        assert_eq!(log_lines(&log).len(), 2);
        assert!(
            log_lines(&log)[0].contains("ruffle.swf"),
            "{:?}",
            log_lines(&log)
        );
        assert_eq!(log_lines(&log)[1], "flash.swf");
        drop(_stop);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_real_exit_returns_the_launcher() {
        let dir = scratch("exit");
        let exe = write_script(&dir, "sleep 1.2\nexit 0");
        let players = Players::default();
        let seen = record(&players);
        let settings = RuffleSettings {
            quality: RuffleQuality::Low,
            graphics: RuffleGraphics::Gl,
        };
        let msg = players
            .launch_at(&exe, Engine::Ruffle, catalog::Cli::Stock, "movie.swf", &settings, None)
            .unwrap();
        assert!(msg.contains("started"), "{msg}");
        assert!(wait_until(|| {
            seen.lock().unwrap().as_slice() == [Presence::Running, Presence::Idle]
        }));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn opengl_relaunch_keeps_the_portable_save_directory() {
        let dir = scratch("saves");
        let log = dir.join("args");
        let saves = dir.join("ruffle-saves");
        let exe = write_script(
            &dir,
            &format!(
                "printf '%s\\n' \"$*\" >> '{}'\n\
             case \" $* \" in\n\
               *' --graphics gl '*) sleep 60 ;;\n\
               *) echo \"thread 'main' panicked at wgpu error: Out of Memory\" >&2; exit 101 ;;\n\
             esac",
                log.display()
            ),
        );
        let players = Players::default();
        let _stop = Stop(players.clone());
        let msg = players
            .launch_at(
                &exe,
                Engine::Ruffle,
                catalog::Cli::Stock,
                "movie.swf",
                &automatic_low(),
                Some(&saves),
            )
            .unwrap();
        assert!(msg.contains("relaunched with OpenGL"), "{msg}");
        let lines = log_lines(&log);
        assert_eq!(lines.len(), 2, "{lines:?}");
        let save = saves.to_string_lossy();
        for line in &lines {
            assert!(line.contains("--save-directory"), "{line}");
            assert!(line.contains(save.as_ref()), "{line}");
            assert!(line.ends_with("movie.swf"), "{line}");
        }
        assert!(lines[1].contains("--graphics gl"), "{lines:?}");
        drop(_stop);
        let _ = fs::remove_dir_all(&dir);
    }

    fn wait_until(mut pred: impl FnMut() -> bool) -> bool {
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(8) {
            if pred() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        pred()
    }
}

#[cfg(test)]
mod save_directory_tests {
    use super::*;
    use crate::ruffle::{RuffleGraphics, RuffleQuality, RuffleSettings};

    const SWF: &str = "https://game.aq.com/game/gamefiles/Loader4.swf?ver=b";
    const SAVE: &str = r"C:\Games\AquaStar\data\ruffle-saves";

    fn low_automatic() -> RuffleSettings {
        RuffleSettings {
            quality: RuffleQuality::Low,
            graphics: RuffleGraphics::Automatic,
        }
    }

    fn primary_movie() -> movie::Movie {
        movie::Movie::https(SWF)
    }

    fn omits_companion(args: &[String]) {
        for flag in ["--title", "--companion", "--companion-name"] {
            assert!(!args.iter().any(|arg| arg == flag), "{flag} in {args:?}");
        }
    }

    #[test]
    fn stock_argv_omits_title_and_companion() {
        let settings = low_automatic();
        let movie = primary_movie();
        let stock = argv(
            &catalog::Cli::Stock,
            &movie,
            &settings,
            Some(Path::new(SAVE)),
        );
        assert!(stock.windows(2).any(|pair| pair == ["--save-directory", SAVE]));
        assert_eq!(stock.last().map(String::as_str), Some(SWF));
        omits_companion(&stock);
        let artix = argv(&catalog::Cli::Artix, &movie, &settings, Some(Path::new(SAVE)));
        assert!(artix.windows(2).any(|pair| pair == ["--save-directory", SAVE]));
        let title_at = artix
            .windows(2)
            .position(|pair| pair == ["--title", "AquaStar"])
            .expect("artix title");
        assert_eq!(artix.get(title_at + 2).map(String::as_str), Some(SWF));
        assert!(!artix.iter().any(|arg| arg == "--companion"));
        assert!(!artix.iter().any(|arg| arg == "--companion-name"));
        assert_eq!(
            argv(&catalog::Cli::Projector, &movie, &settings, Some(Path::new(SAVE))),
            vec![SWF.to_string()]
        );
    }

    #[test]
    fn ruffle_adds_save_directory_before_the_swf_only_when_set() {
        let settings = low_automatic();
        let movie = primary_movie();
        assert_eq!(
            argv(&catalog::Cli::Stock, &movie, &settings, None),
            vec![
                "--tcp-connections".to_string(),
                "allow".to_string(),
                "--storage".to_string(),
                "disk".to_string(),
                "--letterbox".to_string(),
                "on".to_string(),
                "--quality".to_string(),
                "low".to_string(),
                "--graphics".to_string(),
                "default".to_string(),
                "--no-gui".to_string(),
                SWF.to_string(),
            ]
        );
        assert_eq!(
            argv(
                &catalog::Cli::Stock,
                &movie,
                &settings,
                Some(Path::new(SAVE))
            ),
            vec![
                "--tcp-connections".to_string(),
                "allow".to_string(),
                "--storage".to_string(),
                "disk".to_string(),
                "--letterbox".to_string(),
                "on".to_string(),
                "--quality".to_string(),
                "low".to_string(),
                "--graphics".to_string(),
                "default".to_string(),
                "--no-gui".to_string(),
                "--save-directory".to_string(),
                SAVE.to_string(),
                SWF.to_string(),
            ]
        );
    }

    #[test]
    fn appimage_library_paths_do_not_reach_the_player() {
        let appdir = "/tmp/AquaStar.AppDir";
        let joined = |suffix: &str| format!("{appdir}{suffix}");
        let vars = scrub_player_env(vec![
            ("APPDIR".into(), appdir.into()),
            ("DISPLAY".into(), ":0".into()),
            ("HOME".into(), "/home/player".into()),
            (
                "LD_LIBRARY_PATH".into(),
                format!("{appdir}/usr/lib:/usr/lib"),
            ),
            (
                "XDG_DATA_DIRS".into(),
                format!("{appdir}/usr/share:/usr/share"),
            ),
            (
                "GDK_PIXBUF_MODULE_FILE".into(),
                joined("/usr/lib/loaders.cache"),
            ),
            ("GTK_PATH".into(), joined("/usr/lib/gtk-3.0")),
            ("GIO_MODULE_DIR".into(), joined("/usr/lib/gio/modules")),
            (
                "GSETTINGS_SCHEMA_DIR".into(),
                joined("/usr/share/glib-2.0/schemas"),
            ),
            ("GTK_EXE_PREFIX".into(), joined("/usr")),
            ("PYTHONHOME".into(), joined("/usr")),
            (
                "LD_PRELOAD".into(),
                format!("{appdir}/usr/lib/preload.so:/usr/lib/keep.so"),
            ),
        ]);
        let get = |key: &str| {
            vars.iter()
                .find(|(name, _)| name == key)
                .map(|(_, value)| value.as_str())
        };
        assert_eq!(get("DISPLAY"), Some(":0"));
        assert_eq!(get("HOME"), Some("/home/player"));
        assert_eq!(get("LD_LIBRARY_PATH"), Some("/usr/lib"));
        assert_eq!(get("XDG_DATA_DIRS"), Some("/usr/share"));
        assert_eq!(get("LD_PRELOAD"), Some("/usr/lib/keep.so"));
        for key in [
            "GDK_PIXBUF_MODULE_FILE",
            "GTK_PATH",
            "GIO_MODULE_DIR",
            "GSETTINGS_SCHEMA_DIR",
            "GTK_EXE_PREFIX",
            "PYTHONHOME",
        ] {
            assert_eq!(get(key), None, "{key}");
        }
    }

    #[test]
    fn a_normal_environment_is_left_alone() {
        let vars = scrub_player_env(vec![
            ("DISPLAY".into(), ":0".into()),
            ("LD_LIBRARY_PATH".into(), "/usr/local/lib".into()),
            ("GTK_PATH".into(), "/usr/lib/gtk-2.0".into()),
        ]);
        let get = |key: &str| {
            vars.iter()
                .find(|(name, _)| name == key)
                .map(|(_, value)| value.as_str())
        };
        assert_eq!(get("LD_LIBRARY_PATH"), Some("/usr/local/lib"));
        assert_eq!(get("GTK_PATH"), Some("/usr/lib/gtk-2.0"));
        assert_eq!(get("DISPLAY"), Some(":0"));
    }

    #[test]
    fn flash_appimage_library_path_is_only_the_gtk2_dir_plus_host() {
        let root = std::env::temp_dir().join(format!("aqlite-flash-libs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let appdir = root.join("AppDir");
        let libs = appdir.join("usr/lib/aquastar-lite/flash-gtk2");
        fs::create_dir_all(&libs).unwrap();
        fs::write(libs.join("libgtk-x11-2.0.so.0"), b"not-really").unwrap();
        assert!(flash_runtime_libs(&appdir).is_some());
        assert!(flash_runtime_libs(&root.join("empty")).is_none());

        let scrubbed = scrub_player_env(vec![
            ("APPDIR".into(), appdir.to_string_lossy().into_owned()),
            (
                "LD_LIBRARY_PATH".into(),
                format!("{}/usr/lib:/usr/local/lib", appdir.display()),
            ),
            (
                "GTK_PATH".into(),
                format!("{}/usr/lib/gtk-3.0", appdir.display()),
            ),
        ]);
        let path = flash_library_path(&libs, &scrubbed);
        assert_eq!(path, format!("{}:/usr/local/lib", libs.display()));
        assert!(!path.contains("gtk-3.0"));
        assert!(!path.contains(&format!("{}/usr/lib:", appdir.display())));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn flash_exit_127_names_the_missing_library_and_ruffle() {
        let gtk = flash_missing_library(
            "flashplayer: error while loading shared libraries: libgtk-x11-2.0.so.0: cannot open shared object file: No such file or directory\n",
        );
        assert!(gtk.contains("libgtk-x11-2.0.so.0"));
        assert!(gtk.contains("libgtk2.0-0t64 or libgtk2.0-0"));
        assert!(gtk.contains("Use Ruffle"));
        let nss = flash_missing_library(
            "error while loading shared libraries: libnss3.so: cannot open shared object file",
        );
        assert!(nss.contains("libnss3.so"));
        assert!(nss.contains("libnss3"));
        assert!(nss.contains("Use Ruffle"));
        let unknown = flash_missing_library("exited 127");
        assert!(unknown.contains("exit 127"));
        assert!(unknown.contains("Use Ruffle"));
        assert_eq!(missing_shared_library("no marker"), None);
    }

    #[test]
    fn flash_args_ignore_the_save_directory() {
        let settings = RuffleSettings::default();
        let movie = movie::Movie::https(SWF);
        assert_eq!(
            argv(
                &catalog::Cli::Projector,
                &movie,
                &settings,
                None
            ),
            vec![SWF.to_string()]
        );
        assert_eq!(
            argv(
                &catalog::Cli::Projector,
                &movie,
                &settings,
                Some(Path::new(SAVE))
            ),
            vec![SWF.to_string()]
        );
    }
}
