mod catalog;

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

    pub fn preferred() -> Engine {
        Self::preferred_for(std::env::consts::OS, std::env::consts::ARCH)
    }

    pub fn preferred_for(os: &str, arch: &str) -> Engine {
        if catalog::Catalog::pinned()
            .select(Engine::Ruffle, os, arch)
            .is_some()
        {
            Engine::Ruffle
        } else {
            Engine::Flash
        }
    }

    pub fn supported(&self) -> bool {
        self.supported_on(std::env::consts::OS, std::env::consts::ARCH)
    }

    pub fn supported_on(&self, os: &str, arch: &str) -> bool {
        catalog::Catalog::pinned().select(*self, os, arch).is_some()
    }

    fn args(
        &self,
        swf: &str,
        settings: &RuffleSettings,
        save_directory: Option<&Path>,
    ) -> Vec<String> {
        match self {
            Engine::Ruffle => {
                let mut args = ruffle::ruffle_args(swf, settings, std::env::consts::OS);
                if let Some(dir) = save_directory {
                    let swf_arg = args.pop().expect("ruffle args end with the swf");
                    args.push("--save-directory".to_string());
                    args.push(dir.to_string_lossy().into_owned());
                    args.push(swf_arg);
                }
                args
            }
            Engine::Flash => vec![swf.to_string()],
        }
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

impl Players {
    pub fn launch(
        &self,
        roots: &PlayerRoots,
        engine: Engine,
        swf: &str,
        settings: &RuffleSettings,
        save_directory: Option<&Path>,
    ) -> Result<String, String> {
        let pin = catalog::Catalog::pinned()
            .select(engine, std::env::consts::OS, std::env::consts::ARCH)
            .ok_or_else(|| format!("{engine:?} is not available on this platform"))?;
        let exe = match locate(&pin, roots) {
            Some(source) => source.path().to_path_buf(),
            None => catalog::publish(&pin, roots.app_data())?,
        };
        self.launch_at(&exe, engine, swf, settings, save_directory)
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
        swf: &str,
        settings: &RuffleSettings,
        save_directory: Option<&Path>,
    ) -> Result<String, String> {
        self.launch_hold.store(true, Ordering::SeqCst);
        let _hold = LaunchHold(&self.launch_hold);
        let _gate = self.launch_gate.lock().unwrap();
        if let Some(msg) = self.prepare(engine) {
            return Ok(msg);
        }
        let save_directory = save_directory.map(Path::to_path_buf);
        let settings = settings.for_platform(std::env::consts::OS);
        let graphics = settings.graphics;
        let capture = engine == Engine::Ruffle && graphics != RuffleGraphics::Gl;
        let mut child = spawn_player(
            exe,
            &engine.args(swf, &settings, save_directory.as_deref()),
            capture,
        )?;
        let started = Instant::now();
        let panicked = Arc::new(AtomicBool::new(false));
        let killed = Arc::new(AtomicBool::new(false));
        let tail = Arc::new(Mutex::new(String::new()));
        let stderr_done =
            capture.then(|| watch_stderr(child.stderr.take(), panicked.clone(), tail.clone()));

        std::thread::sleep(Duration::from_millis(800));
        match child.try_wait() {
            Ok(Some(status)) => {
                finish_stderr(stderr_done);
                let report = exit_report(graphics, status, started, &panicked, &killed);
                // `capture` is only set for a non-OpenGL Ruffle. Flash (and OpenGL) must not
                // be relaunched just because the saved graphics backend is not OpenGL.
                if capture && ruffle::should_fallback(&report) {
                    log_fallback(&report, &tail.lock().unwrap());
                    return self.relaunch_gl(
                        exe,
                        swf,
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
                let watch = capture.then(|| FallbackWatch {
                    graphics,
                    started,
                    panicked,
                    stderr_done: stderr_done.expect("stderr watch"),
                    tail,
                    exe: exe.to_path_buf(),
                    swf: swf.to_string(),
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
            return Err("AquaStar Lite is closing".into());
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
        quality: RuffleQuality,
        from: RuffleGraphics,
        save_directory: Option<&Path>,
    ) -> Result<String, String> {
        if self.shutting_down.load(Ordering::SeqCst) {
            return Err("AquaStar Lite is closing".into());
        }
        let settings = RuffleSettings {
            quality,
            graphics: ruffle::safe_graphics(std::env::consts::OS),
        };
        let mut child = spawn_player(
            exe,
            &Engine::Ruffle.args(swf, &settings, save_directory),
            false,
        )?;
        std::thread::sleep(Duration::from_millis(800));
        if self.shutting_down.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("AquaStar Lite is closing".into());
        }
        let backend = safe_backend_name();
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!(
                "Ruffle exited immediately with {backend} ({status}); see the terminal log"
            ));
        }
        let pid = child.id();
        self.adopt(
            Engine::Ruffle,
            child,
            Arc::new(AtomicBool::new(false)),
            None,
        )?;
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
                watch.quality,
                watch.graphics,
                watch.save_directory.as_deref(),
            ) {
                eprintln!("aquastar-lite: OpenGL relaunch failed: {err}");
            }
        }
        self.launch_hold.store(false, Ordering::SeqCst);
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

/// Nearest `Something.app` that contains this executable. That is `Ruffle.app` or
/// `Flash Player.app`, not an outer launcher that also ends in `.app`.
#[cfg(target_os = "macos")]
fn containing_app(exe: &Path) -> Option<&Path> {
    exe.ancestors()
        .find(|path| path.extension().and_then(|ext| ext.to_str()) == Some("app"))
}

#[cfg(target_os = "macos")]
fn clear_quarantine(exe: &Path) {
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

fn spawn_failure(exe: &Path, err: std::io::Error) -> String {
    // errno 86 is EBADARCH. The Intel projector dies this way under arm64 without Rosetta.
    if err.raw_os_error() == Some(86) {
        return format!(
            "could not start {}: bad CPU type (errno 86). The Flash projector is Intel-only. Use Ruffle, or install Rosetta and the x64 app.",
            exe.display()
        );
    }
    format!("could not start {}: {err}", exe.display())
}

fn spawn_player(exe: &Path, args: &[String], capture_stderr: bool) -> Result<Child, String> {
    clear_quarantine(exe);
    let mut cmd = Command::new(exe);
    cmd.args(args);
    if capture_stderr {
        cmd.stderr(Stdio::piped());
    }
    without_launcher_fontconfig(&mut cmd);
    cmd.spawn().map_err(|err| spawn_failure(exe, err))
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

fn locate(pin: &catalog::Pinned, roots: &PlayerRoots) -> Option<catalog::Source> {
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
    fn ruffle_is_preferred_where_a_row_exists_and_flash_skips_apple_silicon() {
        assert_eq!(Engine::preferred_for("linux", "x86_64"), Engine::Ruffle);
        assert_eq!(Engine::preferred_for("windows", "x86_64"), Engine::Ruffle);
        assert_eq!(Engine::preferred_for("macos", "x86_64"), Engine::Ruffle);
        assert_eq!(Engine::preferred_for("macos", "aarch64"), Engine::Ruffle);
        assert!(!Engine::Flash.supported_on("macos", "aarch64"));
        assert!(Engine::Flash.supported_on("macos", "x86_64"));
        assert!(Engine::Ruffle.supported_on("linux", "x86_64"));
        assert!(Engine::Flash.supported_on("linux", "x86_64"));
        assert!(Engine::Flash.supported_on("windows", "x86_64"));
        assert_eq!(Engine::ALL, [Engine::Ruffle, Engine::Flash]);
        assert_eq!(
            Engine::preferred(),
            Engine::preferred_for(std::env::consts::OS, std::env::consts::ARCH)
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

    fn host_pin() -> catalog::Pinned {
        catalog::Catalog::pinned()
            .select(Engine::Ruffle, std::env::consts::OS, std::env::consts::ARCH)
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
            .select(Engine::Ruffle, std::env::consts::OS, std::env::consts::ARCH)
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
            .launch_at(&exe, Engine::Ruffle, "movie.swf", &automatic_low(), None)
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
            .launch_at(&exe, Engine::Ruffle, "movie.swf", &automatic_low(), None)
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
            .launch_at(&exe, Engine::Ruffle, "movie.swf", &automatic_low(), None)
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
            .launch_at(&exe, Engine::Ruffle, "movie.swf", &automatic_low(), None)
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
            .launch_at(&exe, Engine::Flash, "movie.swf", &automatic_low(), None)
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
            .launch_at(&exe, Engine::Ruffle, "movie.swf", &automatic_low(), None)
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
                "movie.swf",
                &RuffleSettings::default(),
                None,
            )
            .unwrap();
        let msg = players
            .launch_at(
                &exe,
                Engine::Flash,
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
                "ruffle.swf",
                &RuffleSettings::default(),
                None,
            )
            .unwrap();
        let msg = players
            .launch_at(
                &exe,
                Engine::Flash,
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
            .launch_at(&exe, Engine::Ruffle, "movie.swf", &settings, None)
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

    #[test]
    fn ruffle_adds_save_directory_before_the_swf_only_when_set() {
        let settings = low_automatic();
        assert_eq!(
            Engine::Ruffle.args(SWF, &settings, None),
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
            Engine::Ruffle.args(SWF, &settings, Some(Path::new(SAVE))),
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
    fn flash_args_ignore_the_save_directory() {
        let settings = RuffleSettings::default();
        assert_eq!(
            Engine::Flash.args(SWF, &settings, None),
            vec![SWF.to_string()]
        );
        assert_eq!(
            Engine::Flash.args(SWF, &settings, Some(Path::new(SAVE))),
            vec![SWF.to_string()]
        );
    }
}
