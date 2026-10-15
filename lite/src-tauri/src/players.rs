//! Game players run outside the webview, as child processes of the launcher.
//! Ruffle quality and graphics come from [`crate::ruffle`].

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::ruffle::{self, ExitReport, RuffleGraphics, RuffleQuality, RuffleSettings};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    Ruffle,
    Flash,
}

/// One pinned download: where to get it, its SHA-256, and the executable inside.
struct Artifact {
    dir: &'static str,
    url: &'static str,
    sha256: &'static str,
    exe: &'static str,
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const RUFFLE: Option<Artifact> = Some(Artifact {
    dir: "ruffle-0.7.1",
    url: "https://github.com/ruffle-rs/ruffle/releases/download/v0.7.1/ruffle-0.7.1-linux-x86_64.tar.gz",
    sha256: "67950dfdde643f9087ae478eb3637fe52e0deefc79bdb55fe43cd69dab9fdd99",
    exe: "ruffle",
});
#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
const RUFFLE: Option<Artifact> = Some(Artifact {
    dir: "ruffle-0.7.1",
    url: "https://github.com/ruffle-rs/ruffle/releases/download/v0.7.1/ruffle-0.7.1-windows-x86_64.zip",
    sha256: "a5f6df9881771226e330e08a1fa7666f4caff50ddf9f2f993cdd95293edca627",
    exe: "ruffle.exe",
});
#[cfg(target_os = "macos")]
const RUFFLE: Option<Artifact> = Some(Artifact {
    dir: "ruffle-0.7.1",
    url: "https://github.com/ruffle-rs/ruffle/releases/download/v0.7.1/ruffle-0.7.1-macos-universal.tar.gz",
    sha256: "7a86a09b0ca1d5756abcbb093108265019d77edad79e91c98689126c940bea4e",
    exe: "Ruffle.app/Contents/MacOS/ruffle",
});
#[cfg(not(any(
    all(target_os = "linux", target_arch = "x86_64"),
    all(target_os = "windows", target_arch = "x86_64"),
    target_os = "macos"
)))]
const RUFFLE: Option<Artifact> = None;

// Adobe's own Linux standalone projector 32.0.0.465 (still served by Adobe's CDN).
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const FLASH: Option<Artifact> = Some(Artifact {
    dir: "flashplayer-32.0.0.465",
    url: "https://fpdownload.macromedia.com/pub/flashplayer/updaters/32/flash_player_sa_linux.x86_64.tar.gz",
    sha256: "883f7aa23301fc80de879501157533a4acdbfee0721ed7c57676dc032fdf96c3",
    exe: "flashplayer",
});
// Windows and macOS: no Flash player is shipped yet, so those builds are Ruffle only.
#[cfg(not(all(target_os = "linux", target_arch = "x86_64")))]
const FLASH: Option<Artifact> = None;

impl Engine {
    pub const ALL: [Engine; 2] = [Engine::Ruffle, Engine::Flash];

    pub fn supported(&self) -> bool {
        match self {
            Engine::Ruffle => RUFFLE.is_some(),
            Engine::Flash => FLASH.is_some(),
        }
    }

    fn args(&self, swf: &str, settings: &RuffleSettings) -> Vec<String> {
        match self {
            Engine::Ruffle => ruffle::ruffle_args(swf, settings, std::env::consts::OS),
            Engine::Flash => vec![swf.to_string()],
        }
    }
}

struct Tracked {
    child: Child,
    killed: Arc<AtomicBool>,
}

#[derive(Clone, Default)]
pub struct Players {
    children: Arc<Mutex<Vec<Tracked>>>,
    shutting_down: Arc<AtomicBool>,
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
        data: &Path,
        engine: Engine,
        swf: &str,
        settings: &RuffleSettings,
    ) -> Result<String, String> {
        let exe = resolve(data, engine)?;
        self.launch_at(&exe, engine, swf, settings)
    }

    fn launch_at(
        &self,
        exe: &Path,
        engine: Engine,
        swf: &str,
        settings: &RuffleSettings,
    ) -> Result<String, String> {
        let settings = settings.for_platform(std::env::consts::OS);
        let graphics = settings.graphics;
        // Only a non-OpenGL Ruffle is watched. The relaunch is always OpenGL and is not watched,
        // so a second crash cannot start another copy.
        let capture = engine == Engine::Ruffle && graphics != RuffleGraphics::Gl;
        let mut child = spawn_player(exe, &engine.args(swf, &settings), capture)?;
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
                    return self.relaunch_gl(exe, swf, settings.quality, graphics);
                }
                Err(format!(
                    "{engine:?} exited immediately ({status}); see the terminal log"
                ))
            }
            Ok(None) => {
                let pid = child.id();
                self.adopt(child, killed.clone())?;
                if capture {
                    self.arm_fallback(
                        pid,
                        graphics,
                        started,
                        panicked,
                        killed,
                        stderr_done.unwrap(),
                        tail,
                        exe.to_path_buf(),
                        swf.to_string(),
                        settings.quality,
                    );
                }
                Ok(format!("{engine:?} started (pid {pid})"))
            }
            Err(e) => Err(format!("could not check {engine:?}: {e}")),
        }
    }

    fn adopt(&self, mut child: Child, killed: Arc<AtomicBool>) -> Result<(), String> {
        let mut list = self.children.lock().unwrap();
        list.retain_mut(|t| matches!(t.child.try_wait(), Ok(None)));
        if self.shutting_down.load(Ordering::SeqCst) {
            drop(list);
            let _ = child.kill();
            let _ = child.wait();
            return Err("AquaStar Lite is closing".into());
        }
        list.push(Tracked { child, killed });
        Ok(())
    }

    fn relaunch_gl(
        &self,
        exe: &Path,
        swf: &str,
        quality: RuffleQuality,
        from: RuffleGraphics,
    ) -> Result<String, String> {
        if self.shutting_down.load(Ordering::SeqCst) {
            return Err("AquaStar Lite is closing".into());
        }
        let settings = RuffleSettings {
            quality,
            graphics: RuffleGraphics::Gl,
        };
        let mut child = spawn_player(exe, &Engine::Ruffle.args(swf, &settings), false)?;
        std::thread::sleep(Duration::from_millis(800));
        if self.shutting_down.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("AquaStar Lite is closing".into());
        }
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!(
                "Ruffle exited immediately with OpenGL ({status}); see the terminal log"
            ));
        }
        let pid = child.id();
        self.adopt(child, Arc::new(AtomicBool::new(false)))?;
        Ok(format!(
            "Ruffle ({}) crashed; relaunched with OpenGL (pid {pid})",
            from.as_str()
        ))
    }

    fn arm_fallback(
        &self,
        pid: u32,
        graphics: RuffleGraphics,
        started: Instant,
        panicked: Arc<AtomicBool>,
        killed: Arc<AtomicBool>,
        stderr_done: mpsc::Receiver<()>,
        tail: Arc<Mutex<String>>,
        exe: PathBuf,
        swf: String,
        quality: RuffleQuality,
    ) {
        let players = self.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(200));
            if players.shutting_down.load(Ordering::SeqCst) {
                return;
            }
            let status = {
                let mut list = players.children.lock().unwrap();
                let Some(pos) = list.iter().position(|t| t.child.id() == pid) else {
                    return;
                };
                match list[pos].child.try_wait() {
                    Ok(None) => continue,
                    Ok(Some(status)) => {
                        list.remove(pos);
                        status
                    }
                    Err(_) => return,
                }
            };
            let _ = stderr_done.recv_timeout(Duration::from_millis(500));
            let report = exit_report(graphics, status, started, &panicked, &killed);
            if !ruffle::should_fallback(&report) || players.shutting_down.load(Ordering::SeqCst) {
                return;
            }
            let tail_text = tail.lock().map(|t| t.clone()).unwrap_or_default();
            log_fallback(&report, &tail_text);
            if let Err(e) = players.relaunch_gl(&exe, &swf, quality, graphics) {
                eprintln!("aquastar-lite: OpenGL relaunch failed: {e}");
            }
            return;
        });
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

fn spawn_player(exe: &Path, args: &[String], capture_stderr: bool) -> Result<Child, String> {
    let mut cmd = Command::new(exe);
    cmd.args(args);
    if capture_stderr {
        cmd.stderr(Stdio::piped());
    }
    without_launcher_fontconfig(&mut cmd);
    cmd.spawn()
        .map_err(|e| format!("could not start {}: {e}", exe.display()))
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
        "aquastar-lite: Ruffle desktop ({}) exited abnormally (code {code}, signal {signal}, {} ms{}); relaunching with OpenGL. stderr tail: {}",
        report.graphics.as_str(),
        report.elapsed.as_millis(),
        if report.panicked { ", panic" } else { "" },
        ruffle::log_tail(tail),
    );
}

fn resolve(data: &Path, engine: Engine) -> Result<PathBuf, String> {
    let artifact = match engine {
        Engine::Ruffle => RUFFLE,
        Engine::Flash => FLASH,
    };
    if let Some(a) = artifact {
        return install(data, &a);
    }
    Err(format!("{engine:?} is not available on this platform"))
}

/// Idempotent: reuses an existing install, otherwise downloads, checks SHA-256 and unpacks.
fn install(data: &Path, a: &Artifact) -> Result<PathBuf, String> {
    let dir = data.join("players").join(a.dir);
    let exe = dir.join(a.exe);
    if exe.exists() {
        return Ok(exe);
    }
    let mut bytes = Vec::new();
    ureq::get(a.url)
        .call()
        .map_err(|e| format!("download failed: {e}"))?
        .into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let got = format!("{:x}", Sha256::digest(&bytes));
    if got != a.sha256 {
        return Err(format!("checksum mismatch for {}: {got}", a.url));
    }
    let tmp = dir.with_extension("partial");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    if a.url.ends_with(".zip") {
        zip::ZipArchive::new(std::io::Cursor::new(bytes))
            .and_then(|mut z| z.extract(&tmp))
            .map_err(|e| e.to_string())?;
    } else {
        tar::Archive::new(flate2::read::GzDecoder::new(&bytes[..]))
            .unpack(&tmp)
            .map_err(|e| e.to_string())?;
    }
    let _ = fs::remove_dir_all(&dir);
    fs::rename(&tmp, &dir).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&exe, fs::Permissions::from_mode(0o755));
    }
    Ok(exe)
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

    /// Automatic is a non-GL backend on every OS, so these tests do not depend on Vulkan.
    fn automatic_low() -> RuffleSettings {
        RuffleSettings {
            quality: RuffleQuality::Low,
            graphics: RuffleGraphics::Automatic,
        }
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
        let _stop = Stop(players.clone());
        let msg = players
            .launch_at(&exe, Engine::Ruffle, "movie.swf", &automatic_low())
            .unwrap();
        assert!(msg.contains("relaunched with OpenGL"), "{msg}");
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
        let err = players
            .launch_at(&exe, Engine::Ruffle, "movie.swf", &automatic_low())
            .unwrap_err();
        assert!(err.contains("OpenGL"), "{err}");
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
        let err = players
            .launch_at(&exe, Engine::Ruffle, "movie.swf", &automatic_low())
            .unwrap_err();
        assert!(err.contains("exited immediately"), "{err}");
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
        let _stop = Stop(players.clone());
        let msg = players
            .launch_at(&exe, Engine::Ruffle, "movie.swf", &automatic_low())
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
        let err = players
            .launch_at(&exe, Engine::Flash, "movie.swf", &automatic_low())
            .unwrap_err();
        assert!(err.contains("Flash"), "{err}");
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
        players
            .launch_at(&exe, Engine::Ruffle, "movie.swf", &automatic_low())
            .unwrap();
        players.kill_all();
        std::thread::sleep(Duration::from_millis(500));
        assert_eq!(log_lines(&log).len(), 1, "{:?}", log_lines(&log));
        assert!(players.children.lock().unwrap().is_empty());
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
