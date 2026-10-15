//! Game players run outside the webview, as child processes of the launcher.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};

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

    fn args(&self, swf: &str, save_directory: Option<&Path>) -> Vec<String> {
        match self {
            Engine::Ruffle => {
                let mut args: Vec<String> = [
                    "--tcp-connections",
                    "allow",
                    "--storage",
                    "disk",
                    "--letterbox",
                    "on",
                    "--no-gui",
                ]
                .iter()
                .map(|s| s.to_string())
                .collect();
                if let Some(dir) = save_directory {
                    args.push("--save-directory".to_string());
                    args.push(dir.to_string_lossy().into_owned());
                }
                args.push(swf.to_string());
                args
            }
            Engine::Flash => vec![swf.to_string()],
        }
    }
}

#[derive(Default, Clone)]
pub struct Players {
    children: Arc<Mutex<Vec<Child>>>,
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
        save_directory: Option<&Path>,
    ) -> Result<String, String> {
        let exe = resolve(data, engine)?;
        let mut cmd = Command::new(&exe);
        cmd.args(engine.args(swf, save_directory));
        without_launcher_fontconfig(&mut cmd);
        let mut child = cmd.spawn()
            .map_err(|e| format!("could not start {}: {e}", exe.display()))?;
        let pid = child.id();
        std::thread::sleep(std::time::Duration::from_millis(800));
        if let Ok(Some(code)) = child.try_wait() {
            return Err(format!("{engine:?} exited immediately ({code}); see the terminal log"));
        }
        let mut list = self.children.lock().unwrap();
        list.retain_mut(|c| matches!(c.try_wait(), Ok(None)));
        list.push(child);
        Ok(format!("{engine:?} started (pid {pid})"))
    }

    pub fn kill_all(&self) {
        for mut c in self.children.lock().unwrap().drain(..) {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    const SWF: &str = "https://game.aq.com/game/gamefiles/Loader4.swf?ver=b";
    const SAVE: &str = r"C:\Games\AquaStar\data\ruffle-saves";

    #[test]
    fn ruffle_adds_save_directory_before_the_swf_only_when_set() {
        assert_eq!(
            Engine::Ruffle.args(SWF, None),
            vec![
                "--tcp-connections".to_string(),
                "allow".to_string(),
                "--storage".to_string(),
                "disk".to_string(),
                "--letterbox".to_string(),
                "on".to_string(),
                "--no-gui".to_string(),
                SWF.to_string(),
            ]
        );
        assert_eq!(
            Engine::Ruffle.args(SWF, Some(Path::new(SAVE))),
            vec![
                "--tcp-connections".to_string(),
                "allow".to_string(),
                "--storage".to_string(),
                "disk".to_string(),
                "--letterbox".to_string(),
                "on".to_string(),
                "--no-gui".to_string(),
                "--save-directory".to_string(),
                SAVE.to_string(),
                SWF.to_string(),
            ]
        );
    }

    #[test]
    fn flash_args_stay_the_swf() {
        assert_eq!(Engine::Flash.args(SWF, None), vec![SWF.to_string()]);
        assert_eq!(
            Engine::Flash.args(SWF, Some(Path::new(SAVE))),
            vec![SWF.to_string()]
        );
    }
}
