use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::Manager;

pub fn binary(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    if let Some(path) = std::env::var_os("AQUASTAR_CAPTURE_FFMPEG") {
        return verify(PathBuf::from(path));
    }
    let name = format!(
        "ffmpeg-{}-{}{}",
        std::env::consts::OS,
        std::env::consts::ARCH,
        std::env::consts::EXE_SUFFIX
    );
    let mut candidates = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("media").join(&name));
        }
    }
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join("media").join(&name));
    }
    #[cfg(debug_assertions)]
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("media")
            .join(&name),
    );
    let path = candidates.into_iter().find(|p| p.is_file()).ok_or("The bundled recording component is missing. Reinstall AquaStar or prepare the local media build.".to_string())?;
    verify(path)
}
fn verify(path: PathBuf) -> Result<PathBuf, String> {
    use std::{collections::HashMap, sync::OnceLock};
    static VERIFIED: OnceLock<Mutex<HashMap<PathBuf, (u64, std::time::SystemTime)>>> =
        OnceLock::new();
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let fingerprint = (
        metadata.len(),
        metadata.modified().map_err(|e| e.to_string())?,
    );
    let cache = VERIFIED.get_or_init(|| Mutex::new(HashMap::new()));
    if cache.lock().unwrap().get(&path) == Some(&fingerprint) {
        return Ok(path);
    }

    let output = command(&path)
        .args(["-hide_banner", "-encoders"])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() || !String::from_utf8_lossy(&output.stdout).contains("libopenh264")
    {
        return Err(
            "The recording component does not contain the required OpenH264 encoder.".into(),
        );
    }
    cache.lock().unwrap().insert(path.clone(), fingerprint);
    Ok(path)
}
fn command(path: &Path) -> Command {
    let mut command = Command::new(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}
pub fn dimensions(width: u32, height: u32) -> Result<(u32, u32), String> {
    if width < 2 || height < 2 || width > 16384 || height > 16384 {
        return Err("Unsupported game window dimensions.".into());
    }
    let scale = (1920.0 / width as f64).min(1080.0 / height as f64).min(1.0);
    Ok((
        ((width as f64 * scale) as u32 / 2 * 2).max(2),
        ((height as f64 * scale) as u32 / 2 * 2).max(2),
    ))
}
struct Process {
    child: Arc<Mutex<Child>>,
    input: Option<ChildStdin>,
    tail: Arc<Mutex<String>>,
    done: Arc<AtomicBool>,
    writing: Arc<AtomicBool>,
    progress: Arc<Mutex<Instant>>,
}
impl Process {
    fn spawn(mut command: Command) -> Result<Self, String> {
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        let input = child.stdin.take();
        let mut stderr = child.stderr.take().unwrap();
        let tail = Arc::new(Mutex::new(String::new()));
        let errors = tail.clone();
        std::thread::spawn(move || {
            let mut buffer = [0; 2048];
            while let Ok(count) = stderr.read(&mut buffer) {
                if count == 0 {
                    break;
                }
                let mut text = errors.lock().unwrap();
                text.push_str(&String::from_utf8_lossy(&buffer[..count]));
                if text.len() > 16384 {
                    let cut = text
                        .char_indices()
                        .find(|(i, _)| *i >= text.len() - 8192)
                        .map(|(i, _)| i)
                        .unwrap_or(0);
                    text.drain(..cut);
                }
            }
        });
        let child = Arc::new(Mutex::new(child));
        let done = Arc::new(AtomicBool::new(false));
        let writing = Arc::new(AtomicBool::new(false));
        let progress = Arc::new(Mutex::new(Instant::now()));
        let watcher = (
            child.clone(),
            done.clone(),
            writing.clone(),
            progress.clone(),
        );
        std::thread::spawn(move || {
            while !watcher.1.load(Ordering::SeqCst) {
                if watcher.2.load(Ordering::SeqCst)
                    && watcher.3.lock().unwrap().elapsed() > Duration::from_secs(10)
                {
                    let mut child = watcher.0.lock().unwrap();
                    let _ = child.kill();
                    let _ = child.wait();
                    watcher.1.store(true, Ordering::SeqCst);
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        });
        Ok(Self {
            child,
            input,
            tail,
            done,
            writing,
            progress,
        })
    }
    fn write(&mut self, data: &[u8]) -> Result<(), String> {
        *self.progress.lock().unwrap() = Instant::now();
        self.writing.store(true, Ordering::SeqCst);
        let result = self
            .input
            .as_mut()
            .ok_or("Encoder already stopped")?
            .write_all(data)
            .map_err(|e| format!("Cannot write capture data: {e}"));
        self.writing.store(false, Ordering::SeqCst);
        result
    }

    fn finish(&mut self) -> Result<(), String> {
        self.input.take();
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let status = self
                .child
                .lock()
                .unwrap()
                .try_wait()
                .map_err(|e| e.to_string())?;
            if let Some(status) = status {
                self.done.store(true, Ordering::SeqCst);
                return if status.success() {
                    Ok(())
                } else {
                    Err(format!(
                        "Recording encoder failed: {}",
                        self.tail.lock().unwrap()
                    ))
                };
            }
            if Instant::now() > deadline {
                self.kill();
                return Err(
                    "Recording finalization timed out. The temporary recording was kept.".into(),
                );
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }
    fn kill(&self) {
        let mut child = self.child.lock().unwrap();
        let _ = child.kill();
        let _ = child.wait();
        self.done.store(true, Ordering::SeqCst);
    }
}
impl Drop for Process {
    fn drop(&mut self) {
        if !self.done.load(Ordering::SeqCst) {
            self.kill();
        }
    }
}
pub struct Video {
    process: Process,
    size: (u32, u32),
}
impl Video {
    pub fn new(binary: &Path, path: &Path, size: (u32, u32), fps: u32) -> Result<Self, String> {
        let mut cmd = command(binary);
        let gop = (fps * 2).to_string();
        let fps = fps.to_string();
        let dimensions = format!("{}x{}", size.0, size.1);
        let bitrate = ((size.0 as u64 * size.1 as u64 * 4).clamp(1_000_000, 8_000_000)).to_string();
        cmd.args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostats",
            "-n",
            "-f",
            "rawvideo",
            "-pixel_format",
            "rgba",
            "-video_size",
            &dimensions,
            "-framerate",
            &fps,
            "-i",
            "pipe:0",
            "-an",
            "-c:v",
            "libopenh264",
            "-threads",
            "2",
            "-g",
            &gop,
            "-b:v",
            &bitrate,
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+frag_keyframe+empty_moov",
        ])
        .arg(path);
        Ok(Self {
            process: Process::spawn(cmd)?,
            size,
        })
    }
    pub fn write(&mut self, image: &xcap::image::RgbaImage) -> Result<(), String> {
        use xcap::image::{imageops, RgbaImage};
        if image.dimensions() == self.size {
            return self.process.write(image.as_raw());
        }
        let (width, height) = image.dimensions();
        let factor = (self.size.0 as f64 / width as f64)
            .min(self.size.1 as f64 / height as f64)
            .min(1.0);
        let scaled = imageops::resize(
            image,
            (width as f64 * factor).max(1.0) as u32,
            (height as f64 * factor).max(1.0) as u32,
            imageops::FilterType::Triangle,
        );
        let mut frame = RgbaImage::new(self.size.0, self.size.1);
        imageops::overlay(
            &mut frame,
            &scaled,
            ((self.size.0 - scaled.width()) / 2) as i64,
            ((self.size.1 - scaled.height()) / 2) as i64,
        );
        self.process.write(frame.as_raw())
    }
    pub fn finish(&mut self) -> Result<(), String> {
        self.process.finish()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn output_is_even_bounded_and_never_upscaled() {
        assert_eq!(dimensions(715, 455).unwrap(), (714, 454));
        assert_eq!(dimensions(3840, 2160).unwrap(), (1920, 1080));
        assert_eq!(dimensions(1280, 720).unwrap(), (1280, 720));
        assert!(dimensions(0, 1).is_err());
    }
}

pub fn seal(binary: &Path, video: &Path, dest: &Path) -> Result<(), String> {
    let staging = dest.with_extension("finalizing.mp4");
    let mut cmd = command(binary);
    cmd.args(["-hide_banner", "-loglevel", "error", "-n", "-i"])
        .arg(video)
        .args(["-map", "0:v:0", "-c", "copy", "-movflags", "+faststart"])
        .arg(&staging);
    Process::spawn(cmd)?.finish()?;
    std::fs::rename(&staging, dest).map_err(|e| e.to_string())
}
