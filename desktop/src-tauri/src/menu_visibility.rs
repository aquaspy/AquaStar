use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

#[derive(Default)]
pub struct Visibility(AtomicBool);

impl Visibility {
    pub fn get(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
    pub fn set(&self, show: bool) {
        self.0.store(show, Ordering::SeqCst);
    }
}

pub fn apply(app: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    {
        if app.state::<Visibility>().get() {
            app.show_menu()
        } else {
            app.hide_menu()
        }
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn apply_to_window(webview: &tauri::Webview) {
    #[cfg(not(target_os = "macos"))]
    {
        if !webview.app_handle().state::<Visibility>().get() {
            let _ = webview.window().hide_menu();
        }
    }
}
