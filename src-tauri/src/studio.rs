//! Char Page Studio. It loads a public Char Page, then renders the character with one of two
//! bundled SWFs in a separate Ruffle window (the Electron app embedded Flash in the page):
//!
//! * `characterB-studio.swf` is the Char Page itself, modified to hide parts of its interface;
//! * `characterB-empty-scene.swf` is a compositor with a solid background and no interface.
//!
//! The SWFs read their data from FlashVars (`-P key=value`). The Char Page SWF calls
//! `ExternalInterface.addCallback` before it reads them, which fails outside a browser, so Ruffle
//! runs it with `--dummy-external-interface`. PNG and GIF capture opens a second, larger Ruffle
//! window, parks it off-screen and reads its pixels with `PrintWindow` (Windows only for now).

use std::io::{BufWriter, Read};
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::Manager;

const CHARPAGE_SWF: &[u8] =
    include_bytes!("../../plugins/adventure-quest-worlds/features/charpage/characterB-studio.swf");
const EMPTY_SCENE_SWF: &[u8] =
    include_bytes!("../../plugins/adventure-quest-worlds/features/charpage/characterB-empty-scene.swf");
const MOVIE_WIDTH: u32 = 715;
const MOVIE_HEIGHT: u32 = 455;
const CHARPAGE_ASSETS: &str = "https://game.aq.com/game/gamefiles/etc/chardetail/";
const EMPTY_SCENE_ASSETS: &str = "https://game.aq.com/game/gamefiles";
const MAX_PAGE_BYTES: u64 = 2 * 1024 * 1024;
/// The SWFs load their equipment from the network; there is no event for "finished".
const SETTLE: Duration = Duration::from_secs(5);
const GIF_SECONDS: u64 = 8;
const PNG_SCALE: u32 = 3;

#[derive(Default)]
pub struct StudioState {
    preview: Mutex<Option<Child>>,
    busy: AtomicBool,
}

impl StudioState {
    pub fn stop_preview(&self) {
        if let Some(mut child) = self.preview.lock().unwrap_or_else(|e| e.into_inner()).take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Renderer {
    CharPage,
    EmptyScene,
}

impl Renderer {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "charpage" => Ok(Self::CharPage),
            "empty-scene" => Ok(Self::EmptyScene),
            _ => Err("Unknown scene mode".into()),
        }
    }
    fn file(self) -> (&'static str, &'static [u8]) {
        match self {
            Self::CharPage => ("characterB-studio.swf", CHARPAGE_SWF),
            Self::EmptyScene => ("characterB-empty-scene.swf", EMPTY_SCENE_SWF),
        }
    }
    /// Where the SWF finds the equipment files. The two movies resolve paths differently.
    fn asset_base(self) -> &'static str {
        match self {
            Self::CharPage => CHARPAGE_ASSETS,
            Self::EmptyScene => EMPTY_SCENE_ASSETS,
        }
    }
}

// ---------------------------------------------------------------- Char Page

fn tag_attribute(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0;
    while let Some(found) = lower[from..].find(name) {
        let start = from + found;
        let before_ok = start == 0 || !lower.as_bytes()[start - 1].is_ascii_alphanumeric();
        let rest = tag[start + name.len()..].trim_start();
        if before_ok && rest.starts_with('=') {
            let value = rest[1..].trim_start();
            let quote = value.chars().next()?;
            if quote == '"' || quote == '\'' {
                let end = value[1..].find(quote)?;
                return Some(value[1..1 + end].to_string());
            }
        }
        from = start + name.len();
    }
    None
}

/// The `flashvars` of the Flash `<param>` tags on a public Char Page.
pub fn parse_char_page(html: &str) -> Result<String, String> {
    let lower = html.to_ascii_lowercase();
    let mut movie = None;
    let mut flashvars = None;
    let mut from = 0;
    while let Some(found) = lower[from..].find("<param") {
        let start = from + found;
        let end = lower[start..].find('>').map_or(html.len(), |e| start + e);
        let tag = &html[start..end];
        if let (Some(name), Some(value)) = (tag_attribute(tag, "name"), tag_attribute(tag, "value")) {
            match name.to_ascii_lowercase().as_str() {
                "movie" => movie = Some(value),
                "flashvars" => flashvars = Some(value),
                _ => {}
            }
        }
        from = end;
    }
    let (Some(movie), Some(flashvars)) = (movie, flashvars) else {
        return Err("This Char Page did not contain its SWF and FlashVars. Is the character name right?".into());
    };
    let movie = movie.replace("&amp;", "&");
    let host = tauri::Url::parse(&movie).ok().and_then(|url| url.host_str().map(str::to_string));
    if host.as_deref() != Some("game.aq.com") {
        return Err("The Char Page returned an unexpected SWF host.".into());
    }
    Ok(flashvars.replace("&amp;", "&"))
}

fn clean_name(raw: &str) -> String {
    raw.chars().filter(char::is_ascii_alphanumeric).collect()
}

fn fetch_char_page(name: &str) -> Result<String, String> {
    let url = format!("https://account.aq.com/CharPage?id={name}");
    let response = ureq::get(&url)
        .timeout(Duration::from_secs(20))
        .set("User-Agent", "AquaStar NEO Char Page Studio")
        .call()
        .map_err(|error| match error {
            ureq::Error::Status(code, _) => format!("AQW returned HTTP {code}."),
            ureq::Error::Transport(_) => "Could not reach account.aq.com. Check your connection.".to_string(),
        })?;
    let mut body = String::new();
    response
        .into_reader()
        .take(MAX_PAGE_BYTES)
        .read_to_string(&mut body)
        .map_err(|_| "The Char Page could not be read.".to_string())?;
    Ok(body)
}

fn flash_pairs(raw: &str) -> Result<Vec<(String, String)>, String> {
    let url = tauri::Url::parse(&format!("http://studio.invalid/?{raw}")).map_err(|_| "Invalid FlashVars")?;
    let pairs: Vec<(String, String)> = url.query_pairs().map(|(k, v)| (k.into_owned(), v.into_owned())).collect();
    if pairs.len() > 256 {
        return Err("Too many FlashVars".into());
    }
    for (key, value) in &pairs {
        let valid_key = key.len() <= 64
            && key.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
            && key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_');
        if !valid_key || value.len() > 4096 || value.contains('\0') {
            return Err(format!("Invalid FlashVar \"{key}\""));
        }
    }
    Ok(pairs)
}

/// FlashVars with the asset root the chosen movie needs.
fn pairs_for(renderer: Renderer, raw: &str) -> Result<Vec<(String, String)>, String> {
    let mut pairs = flash_pairs(raw)?;
    pairs.retain(|(key, _)| key != "studioAssetBaseUrl");
    pairs.push(("studioAssetBaseUrl".into(), renderer.asset_base().into()));
    Ok(pairs)
}

// ------------------------------------------------------------------- player

fn materialize(app: &tauri::AppHandle, renderer: Renderer) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("studio");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let (name, bytes) = renderer.file();
    let target = dir.join(name);
    if std::fs::read(&target).ok().as_deref() != Some(bytes) {
        std::fs::write(&target, bytes).map_err(|e| e.to_string())?;
    }
    Ok(target)
}

fn player_arguments(
    _artix: bool,
    pairs: &[(String, String)],
    swf: &Path,
    width: u32,
    height: u32,
    settings: &crate::ruffle::RuffleSettings,
) -> Vec<String> {
    let settings = settings.for_platform(std::env::consts::OS);
    let mut args: Vec<String> = pairs.iter().map(|(key, value)| format!("-P{key}={value}")).collect();
    args.extend(
        [
            "--dummy-external-interface",
            "--width",
            &width.to_string(),
            "--height",
            &height.to_string(),
            "--quality",
            settings.quality.as_str(),
            "--graphics",
            settings.graphics.as_str(),
            "--letterbox",
            "on",
            "--storage",
            "memory",
            "--no-gui",
        ]
        .map(str::to_string),
    );
    args.extend(["--title".to_string(), "AquaStar NEO Char Page Studio".to_string()]);
    args.push(swf.display().to_string());
    args
}

fn start_player(
    app: &tauri::AppHandle,
    renderer: Renderer,
    raw_vars: &str,
    width: u32,
    height: u32,
) -> Result<Child, String> {
    let pairs = pairs_for(renderer, raw_vars)?;
    let swf = materialize(app, renderer)?;
    let roots = crate::player_roots(app)?;
    let settings = crate::load_ruffle_settings(app);
    crate::players::start_ruffle(&roots, |artix| player_arguments(artix, &pairs, &swf, width, height, &settings))
}

// ----------------------------------------------------------------- commands

#[tauri::command]
pub fn studio_defaults() -> Value {
    let name = crate::profile::setting_str(&crate::profile::live_files(), "playerCharacter");
    json!({ "playerCharacter": clean_name(&name) })
}

#[tauri::command]
pub fn studio_messages() -> Value {
    crate::manifest::studio_messages(crate::current_language().as_str())
}

/// Step one: read the public Char Page and hand back its FlashVars.
#[tauri::command]
pub async fn studio_load_character(name: String) -> Result<Value, String> {
    let player = clean_name(&name);
    if player.is_empty() {
        return Err("Enter a valid AQW character name.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let html = fetch_char_page(&player)?;
        let flash_vars = parse_char_page(&html)?;
        Ok(json!({ "playerName": player, "flashVars": flash_vars }))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Step two: show the scene in its own Ruffle window, replacing the previous one.
#[tauri::command]
pub async fn studio_render(app: tauri::AppHandle, renderer: String, flash_vars: String) -> Result<(), String> {
    let renderer = Renderer::parse(&renderer)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<StudioState>();
        state.stop_preview();
        let child = start_player(&app, renderer, &flash_vars, MOVIE_WIDTH, MOVIE_HEIGHT)?;
        *state.preview.lock().unwrap_or_else(|e| e.into_inner()) = Some(child);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn studio_close_preview(app: tauri::AppHandle) {
    app.state::<StudioState>().stop_preview();
}

/// `kind` is `png` or `gif`. Asks where to save first, then renders in a hidden window.
#[tauri::command]
pub async fn studio_capture(
    app: tauri::AppHandle,
    kind: String,
    renderer: String,
    flash_vars: String,
    fps: Option<u32>,
    colors: Option<u32>,
) -> Result<Value, String> {
    let renderer = Renderer::parse(&renderer)?;
    let gif = match kind.as_str() {
        "png" => false,
        "gif" => true,
        _ => return Err("Unknown capture type".into()),
    };
    if !cfg!(windows) {
        return Err("Saving a PNG or GIF is only available on Windows for now. The preview works everywhere.".into());
    }
    pairs_for(renderer, &flash_vars)?;
    let state = app.state::<StudioState>();
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err("A capture is already running.".into());
    }
    let result = capture_with_dialog(&app, gif, renderer, flash_vars, fps, colors).await;
    app.state::<StudioState>().busy.store(false, Ordering::SeqCst);
    result
}

async fn capture_with_dialog(
    app: &tauri::AppHandle,
    gif: bool,
    renderer: Renderer,
    flash_vars: String,
    fps: Option<u32>,
    colors: Option<u32>,
) -> Result<Value, String> {
    let (title, name, extension) = if gif {
        ("Save GIF", "CharPage.gif", "gif")
    } else {
        ("Save PNG", "CharPage.png", "png")
    };
    // Smoke hook, like AQUASTAR_LITE_SMOKE: a folder here skips the dialog and saves there.
    if let Some(folder) = std::env::var_os("AQUASTAR_STUDIO_SAVE_DIR") {
        let path = PathBuf::from(folder).join(name);
        return run_capture(app, gif, renderer, flash_vars, fps, colors, path).await;
    }
    // The dialog belongs to the Studio window, or it can open behind it on Windows.
    let mut dialog = rfd::AsyncFileDialog::new()
        .set_title(title)
        .set_file_name(name)
        .add_filter(extension.to_ascii_uppercase(), &[extension]);
    let parent = app.get_webview_window("studio");
    if let Some(parent) = &parent {
        dialog = dialog.set_parent(parent);
    }
    let Some(file) = dialog.save_file().await else {
        return Ok(json!({ "canceled": true }));
    };
    run_capture(app, gif, renderer, flash_vars, fps, colors, file.path().to_path_buf()).await
}

async fn run_capture(
    app: &tauri::AppHandle,
    gif: bool,
    renderer: Renderer,
    flash_vars: String,
    fps: Option<u32>,
    colors: Option<u32>,
    path: PathBuf,
) -> Result<Value, String> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let outcome = if gif {
            let fps = fps.unwrap_or(10).clamp(1, 60);
            let colors = match colors {
                Some(64) => 64,
                Some(256) => 256,
                _ => 128,
            };
            capture_gif(&app, renderer, &flash_vars, fps, colors, &path)
        } else {
            capture_png(&app, renderer, &flash_vars, &path)
        };
        outcome.map(|(width, height, frames)| {
            json!({ "savedPath": path.display().to_string(), "width": width, "height": height, "frames": frames })
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ------------------------------------------------------------------ capture

struct Frame {
    rgba: Vec<u8>,
    width: u32,
    height: u32,
}

/// The 715:455 stage inside a window that may be letterboxed.
fn stage_rect(width: u32, height: u32) -> (u32, u32, u32, u32) {
    let ratio = MOVIE_WIDTH as f64 / MOVIE_HEIGHT as f64;
    if width as f64 / height as f64 > ratio {
        let w = (height as f64 * ratio).round() as u32;
        ((width - w) / 2, 0, w, height)
    } else {
        let h = (width as f64 / ratio).round() as u32;
        (0, (height - h) / 2, width, h)
    }
}

fn crop(frame: &Frame) -> Frame {
    let (x, y, w, h) = stage_rect(frame.width, frame.height);
    let mut rgba = Vec::with_capacity((w * h * 4) as usize);
    for row in y..y + h {
        let start = ((row * frame.width + x) * 4) as usize;
        rgba.extend_from_slice(&frame.rgba[start..start + (w * 4) as usize]);
    }
    Frame { rgba, width: w, height: h }
}

/// A capture window that is killed whatever happens.
struct CaptureWindow {
    child: Child,
    window: usize,
}

impl Drop for CaptureWindow {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn open_capture_window(app: &tauri::AppHandle, renderer: Renderer, flash_vars: &str, scale: u32) -> Result<CaptureWindow, String> {
    let child = start_player(app, renderer, flash_vars, MOVIE_WIDTH * scale, MOVIE_HEIGHT * scale)?;
    let mut capture = CaptureWindow { child, window: 0 };
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        if let Ok(Some(status)) = capture.child.try_wait() {
            return Err(format!("The player closed unexpectedly ({status})."));
        }
        if let Some(window) = capture::find_window(capture.child.id()) {
            capture.window = window;
            break;
        }
        if Instant::now() > deadline {
            return Err("The player window did not appear.".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    capture::park(capture.window);
    std::thread::sleep(SETTLE);
    Ok(capture)
}

fn grab(window: &CaptureWindow) -> Result<Frame, String> {
    let (rgba, width, height) = capture::grab(window.window)?;
    Ok(Frame { rgba, width, height })
}

fn capture_png(app: &tauri::AppHandle, renderer: Renderer, flash_vars: &str, path: &Path) -> Result<(u32, u32, u32), String> {
    let window = open_capture_window(app, renderer, flash_vars, PNG_SCALE)?;
    let frame = crop(&grab(&window)?);
    drop(window);
    write_png(path, &frame)?;
    Ok((frame.width, frame.height, 1))
}

fn write_png(path: &Path, frame: &Frame) -> Result<(), String> {
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut encoder = png::Encoder::new(BufWriter::new(file), frame.width, frame.height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(&frame.rgba).map_err(|e| e.to_string())
}

fn capture_gif(
    app: &tauri::AppHandle,
    renderer: Renderer,
    flash_vars: &str,
    fps: u32,
    colors: usize,
    path: &Path,
) -> Result<(u32, u32, u32), String> {
    let window = open_capture_window(app, renderer, flash_vars, 1)?;
    let frames = (GIF_SECONDS * u64::from(fps)).max(1);
    let interval = Duration::from_micros(1_000_000 / u64::from(fps));
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut encoder: Option<gif::Encoder<BufWriter<std::fs::File>>> = None;
    let mut size = (0, 0);
    let start = Instant::now();
    for index in 0..frames {
        let due = start + interval * index as u32;
        if let Some(wait) = due.checked_duration_since(Instant::now()) {
            std::thread::sleep(wait);
        }
        let frame = crop(&grab(&window)?);
        if encoder.is_none() {
            size = (frame.width, frame.height);
            let output = BufWriter::new(file.try_clone().map_err(|e| e.to_string())?);
            let mut created = gif::Encoder::new(output, frame.width as u16, frame.height as u16, &[])
                .map_err(|e| e.to_string())?;
            created.set_repeat(gif::Repeat::Infinite).map_err(|e| e.to_string())?;
            encoder = Some(created);
        }
        if (frame.width, frame.height) != size {
            continue;
        }
        let quantizer = color_quant::NeuQuant::new(30, colors, &frame.rgba);
        let indices: Vec<u8> = frame.rgba.chunks_exact(4).map(|pixel| quantizer.index_of(pixel) as u8).collect();
        let delay = ((100 / fps) as u16).max(2);
        let image = gif::Frame {
            width: frame.width as u16,
            height: frame.height as u16,
            buffer: std::borrow::Cow::Owned(indices),
            palette: Some(quantizer.color_map_rgb()),
            delay,
            ..gif::Frame::default()
        };
        encoder.as_mut().ok_or("no GIF encoder")?.write_frame(&image).map_err(|e| e.to_string())?;
    }
    drop(window);
    Ok((size.0, size.1, frames as u32))
}

#[cfg(windows)]
mod capture {
    use std::ffi::c_void;

    type Hwnd = *mut c_void;
    type Hdc = *mut c_void;

    #[repr(C)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }
    #[repr(C)]
    struct BitmapInfoHeader {
        size: u32,
        width: i32,
        height: i32,
        planes: u16,
        bit_count: u16,
        compression: u32,
        size_image: u32,
        x_pels: i32,
        y_pels: i32,
        clr_used: u32,
        clr_important: u32,
    }
    #[repr(C)]
    struct BitmapInfo {
        header: BitmapInfoHeader,
        colors: [u32; 1],
    }
    struct Search {
        pid: u32,
        best_area: i64,
        best: usize,
    }

    #[allow(clashing_extern_declarations)]
    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(callback: extern "system" fn(Hwnd, isize) -> i32, lparam: isize) -> i32;
        fn GetWindowThreadProcessId(window: Hwnd, pid: *mut u32) -> u32;
        fn IsWindowVisible(window: Hwnd) -> i32;
        fn GetClientRect(window: Hwnd, rect: *mut Rect) -> i32;
        fn PrintWindow(window: Hwnd, dc: Hdc, flags: u32) -> i32;
        fn SetWindowPos(window: Hwnd, after: Hwnd, x: i32, y: i32, cx: i32, cy: i32, flags: u32) -> i32;
        fn GetDC(window: Hwnd) -> Hdc;
        fn ReleaseDC(window: Hwnd, dc: Hdc) -> i32;
    }
    #[link(name = "gdi32")]
    extern "system" {
        fn CreateCompatibleDC(dc: Hdc) -> Hdc;
        fn CreateCompatibleBitmap(dc: Hdc, width: i32, height: i32) -> *mut c_void;
        fn SelectObject(dc: Hdc, object: *mut c_void) -> *mut c_void;
        fn DeleteObject(object: *mut c_void) -> i32;
        fn DeleteDC(dc: Hdc) -> i32;
        fn GetDIBits(dc: Hdc, bitmap: *mut c_void, start: u32, lines: u32, bits: *mut c_void, info: *mut BitmapInfo, usage: u32) -> i32;
    }

    const PW_CLIENTONLY: u32 = 1;
    const PW_RENDERFULLCONTENT: u32 = 2;
    const SWP_NOSIZE: u32 = 0x1;
    const SWP_NOZORDER: u32 = 0x4;
    const SWP_NOACTIVATE: u32 = 0x10;

    extern "system" fn visit(window: Hwnd, lparam: isize) -> i32 {
        // SAFETY: `lparam` is the address of the `Search` that `find_window` keeps alive for the call.
        let search = unsafe { &mut *(lparam as *mut Search) };
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(window, &mut pid) };
        if pid == search.pid && unsafe { IsWindowVisible(window) } != 0 {
            let mut rect = Rect { left: 0, top: 0, right: 0, bottom: 0 };
            if unsafe { GetClientRect(window, &mut rect) } != 0 {
                let area = i64::from(rect.right - rect.left) * i64::from(rect.bottom - rect.top);
                if area > search.best_area {
                    search.best_area = area;
                    search.best = window as usize;
                }
            }
        }
        1
    }

    /// The largest visible window of the process, once it has been created.
    pub fn find_window(pid: u32) -> Option<usize> {
        let mut search = Search { pid, best_area: 0, best: 0 };
        unsafe { EnumWindows(visit, &mut search as *mut Search as isize) };
        (search.best != 0).then_some(search.best)
    }

    /// Move the window out of sight. It keeps rendering, and `PrintWindow` still reads it.
    pub fn park(window: usize) {
        unsafe {
            SetWindowPos(window as Hwnd, std::ptr::null_mut(), -32000, -32000, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
        }
    }

    /// RGBA pixels of the window's client area.
    pub fn grab(window: usize) -> Result<(Vec<u8>, u32, u32), String> {
        let window = window as Hwnd;
        let mut rect = Rect { left: 0, top: 0, right: 0, bottom: 0 };
        if unsafe { GetClientRect(window, &mut rect) } == 0 {
            return Err("The player window is gone.".into());
        }
        let (width, height) = (rect.right - rect.left, rect.bottom - rect.top);
        if width < 1 || height < 1 {
            return Err("The player window has no size.".into());
        }
        unsafe {
            let screen = GetDC(std::ptr::null_mut());
            let memory = CreateCompatibleDC(screen);
            let bitmap = CreateCompatibleBitmap(screen, width, height);
            let previous = SelectObject(memory, bitmap);
            let printed = PrintWindow(window, memory, PW_CLIENTONLY | PW_RENDERFULLCONTENT);
            let mut pixels = vec![0u8; (width * height * 4) as usize];
            let mut info = BitmapInfo {
                header: BitmapInfoHeader {
                    size: std::mem::size_of::<BitmapInfoHeader>() as u32,
                    width,
                    height: -height, // top-down rows
                    planes: 1,
                    bit_count: 32,
                    compression: 0,
                    size_image: 0,
                    x_pels: 0,
                    y_pels: 0,
                    clr_used: 0,
                    clr_important: 0,
                },
                colors: [0],
            };
            let lines = GetDIBits(memory, bitmap, 0, height as u32, pixels.as_mut_ptr().cast(), &mut info, 0);
            SelectObject(memory, previous);
            DeleteObject(bitmap);
            DeleteDC(memory);
            ReleaseDC(std::ptr::null_mut(), screen);
            if printed == 0 || lines == 0 {
                return Err("Windows could not read the player window.".into());
            }
            for pixel in pixels.chunks_exact_mut(4) {
                pixel.swap(0, 2); // BGRA -> RGBA
                pixel[3] = 255;
            }
            Ok((pixels, width as u32, height as u32))
        }
    }
}

#[cfg(not(windows))]
mod capture {
    pub fn find_window(_pid: u32) -> Option<usize> {
        None
    }
    pub fn park(_window: usize) {}
    pub fn grab(_window: usize) -> Result<(Vec<u8>, u32, u32), String> {
        Err("Capture is not available on this platform yet.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAGE: &str = r#"<html><body>
        <object classid="clsid:d27cdb6e" width="715" height="455">
        <param name="movie" value="https://game.aq.com/game/gamefiles/etc/chardetail/characterB.swf?v=2">
        <param name='quality' value='high'>
        <PARAM NAME="FlashVars" VALUE="strName=SStar&amp;intLevel=100&amp;strWeaponName=Burning Sword&amp;intColorHair=6710988">
        </object></body></html>"#;

    #[test]
    fn the_char_page_flashvars_are_read_from_its_param_tags() {
        let vars = parse_char_page(PAGE).unwrap();
        assert_eq!(vars, "strName=SStar&intLevel=100&strWeaponName=Burning Sword&intColorHair=6710988");
        let pairs = flash_pairs(&vars).unwrap();
        assert_eq!(pairs[0], ("strName".to_string(), "SStar".to_string()));
        assert_eq!(pairs.len(), 4);
    }

    #[test]
    fn a_page_without_the_flash_params_or_from_another_host_is_refused() {
        assert!(parse_char_page("<html>Character not found</html>").is_err());
        let other = PAGE.replace("game.aq.com", "evil.example");
        assert!(parse_char_page(&other).unwrap_err().contains("unexpected SWF host"));
        assert!(parse_char_page(&PAGE.replace("FlashVars", "other")).is_err());
    }

    #[test]
    fn flashvars_are_validated_before_they_reach_a_command_line() {
        assert!(flash_pairs("strName=SStar&bgindex=3").is_ok());
        assert!(flash_pairs("").unwrap().is_empty());
        for bad in ["-evil=1", "a b=1", "=1", "key.with.dots=1", "1abc=1"] {
            assert!(flash_pairs(bad).is_err(), "{bad}");
        }
        assert!(flash_pairs(&format!("k={}", "x".repeat(5000))).is_err());
        let many: String = (0..300).map(|i| format!("k{i}=1&")).collect();
        assert!(flash_pairs(&many).is_err());
    }

    #[test]
    fn each_movie_gets_its_own_asset_root_and_the_callers_value_is_replaced() {
        let empty = pairs_for(Renderer::EmptyScene, "strName=A&studioAssetBaseUrl=https://evil.example/").unwrap();
        let roots: Vec<_> = empty.iter().filter(|(k, _)| k == "studioAssetBaseUrl").collect();
        assert_eq!(roots.len(), 1);
        assert_eq!(roots[0].1, "https://game.aq.com/game/gamefiles");
        let page = pairs_for(Renderer::CharPage, "strName=A").unwrap();
        assert!(page.iter().any(|(k, v)| k == "studioAssetBaseUrl" && v.ends_with("/etc/chardetail/")));
    }

    #[test]
    fn the_player_gets_flashvars_the_dummy_external_interface_and_the_swf_last() {
        let settings = crate::ruffle::RuffleSettings::default();
        let pairs = vec![("strName".to_string(), "A B&C".to_string())];
        let args = player_arguments(true, &pairs, Path::new("C:/x/scene.swf"), 715, 455, &settings);
        assert_eq!(args[0], "-PstrName=A B&C", "one argument per FlashVar, so no shell quoting is involved");
        assert!(args.contains(&"--dummy-external-interface".to_string()));
        assert!(args.windows(2).any(|w| w == ["--title", "AquaStar NEO Char Page Studio"]));
        assert_eq!(args.last().unwrap(), "C:/x/scene.swf");
        let also = player_arguments(false, &pairs, Path::new("s.swf"), 715, 455, &settings);
        assert!(also.windows(2).any(|w| w == ["--title", "AquaStar NEO Char Page Studio"]));
    }

    #[test]
    fn the_stage_is_cropped_out_of_a_letterboxed_window() {
        assert_eq!(stage_rect(715, 455), (0, 0, 715, 455));
        let (x, y, w, h) = stage_rect(2145, 1500);
        assert_eq!((x, w), (0, 2145));
        assert_eq!(h, 1365);
        assert_eq!(y, (1500 - 1365) / 2);
        let (x, _, w, h) = stage_rect(1600, 455);
        assert_eq!(h, 455);
        assert_eq!(w, 715);
        assert_eq!(x, (1600 - 715) / 2);
        let frame = Frame { rgba: vec![7; 800 * 500 * 4], width: 800, height: 500 };
        let cropped = crop(&frame);
        assert_eq!(cropped.rgba.len(), (cropped.width * cropped.height * 4) as usize);
    }

    #[test]
    fn png_files_are_written_and_names_are_cleaned() {
        let dir = std::env::temp_dir().join(format!("aquastar-studio-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("out.png");
        let frame = Frame { rgba: (0..16).flat_map(|i| [i as u8 * 10, 20, 30, 255]).collect(), width: 4, height: 4 };
        write_png(&path, &frame).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
        std::fs::remove_dir_all(dir).unwrap();
        assert_eq!(clean_name(" S-Star_01!"), "SStar01");
    }

    #[test]
    fn both_swfs_are_embedded_and_look_like_flash_movies() {
        for (_, bytes) in [Renderer::CharPage.file(), Renderer::EmptyScene.file()] {
            assert!([b"FWS", b"CWS", b"ZWS"].iter().any(|magic| bytes.starts_with(*magic)));
        }
    }
}
