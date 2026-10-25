use super::Frames;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use windows_capture::{
    capture::{Context, GraphicsCaptureApiHandler},
    frame::Frame,
    graphics_capture_api::{GraphicsCaptureApi, InternalCaptureControl},
    settings::{
        ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
        MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
    },
    window::Window,
};
type Flags = (
    Arc<Mutex<Option<xcap::image::RgbaImage>>>,
    Arc<Mutex<Option<String>>>,
    Arc<AtomicBool>,
);
struct Handler {
    flags: Flags,
    last_frame: std::time::Instant,
}
impl GraphicsCaptureApiHandler for Handler {
    type Flags = Flags;
    type Error = Box<dyn std::error::Error + Send + Sync>;
    fn new(context: Context<Flags>) -> Result<Self, Self::Error> {
        Ok(Self {
            flags: context.flags,
            last_frame: std::time::Instant::now() - std::time::Duration::from_secs(1),
        })
    }
    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        if self.flags.2.load(Ordering::SeqCst) {
            control.stop();
            return Ok(());
        }
        if self.last_frame.elapsed() < std::time::Duration::from_millis(33) {
            return Ok(());
        }
        self.last_frame = std::time::Instant::now();
        let mut buffer = frame.buffer_without_title_bar()?;
        let width = buffer.width();
        let height = buffer.height();
        if width as u64 * height as u64 > 16_777_216 {
            return Err("The game window is too large to capture.".into());
        }
        let data = buffer.as_nopadding_buffer()?.to_vec();
        *self.flags.0.lock().unwrap() = xcap::image::RgbaImage::from_raw(width, height, data);
        Ok(())
    }
    fn on_closed(&mut self) -> Result<(), Self::Error> {
        *self.flags.1.lock().unwrap() = Some("The game window has closed.".into());
        Ok(())
    }
}
pub fn start(id: u32) -> Result<Frames, String> {
    let frames = Frames::new();
    let flags = (
        frames.latest.clone(),
        frames.error.clone(),
        frames.stop.clone(),
    );
    let cursor = if GraphicsCaptureApi::is_cursor_settings_supported().unwrap_or(false) {
        CursorCaptureSettings::WithoutCursor
    } else {
        CursorCaptureSettings::Default
    };
    let interval = if GraphicsCaptureApi::is_minimum_update_interval_supported().unwrap_or(false) {
        MinimumUpdateIntervalSettings::Custom(std::time::Duration::from_millis(33))
    } else {
        MinimumUpdateIntervalSettings::Default
    };
    // Default leaves the yellow Graphics Capture border on for the whole session.
    // WithoutBorder needs the IsBorderRequired property. Older Windows 10 builds
    // reject that setting, so a failed start is retried with Default.
    let hide_system_border = GraphicsCaptureApi::is_border_settings_supported().unwrap_or(false);
    let border = if hide_system_border {
        DrawBorderSettings::WithoutBorder
    } else {
        DrawBorderSettings::Default
    };
    let open_session = |flags, border| {
        let settings = Settings::new(
            Window::from_raw_hwnd(id as usize as *mut _),
            cursor,
            border,
            SecondaryWindowSettings::Default,
            interval,
            DirtyRegionSettings::Default,
            ColorFormat::Rgba8,
            flags,
        );
        Handler::start_free_threaded(settings).map_err(|e| e.to_string())
    };
    let control = match open_session(flags.clone(), border) {
        Ok(control) => control,
        Err(_) if hide_system_border => open_session(flags, DrawBorderSettings::Default)?,
        Err(error) => return Err(error),
    };
    let flag = frames.stop.clone();
    let error = frames.error.clone();
    std::thread::spawn(move || {
        while !flag.load(Ordering::SeqCst) {
            if control.is_finished() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        if let Err(e) = control.stop() {
            *error.lock().unwrap() = Some(e.to_string());
        }
    });
    Ok(frames)
}
