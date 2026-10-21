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
    #[cfg(target_os = "linux")]
    for window in app.webview_windows().into_values() {
        preserve_gtk_visibility(&window.as_ref().window(), app.state::<Visibility>().get());
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn preserve_gtk_visibility(window: &tauri::Window, show: bool) {
    let window = window.clone();
    let handle = window.clone();
    let _ = handle.run_on_main_thread(move || {
        use gtk::prelude::*;
        if let Ok(container) = window.default_vbox() {
            for widget in container.children() {
                if widget.is::<gtk::MenuBar>() {
                    // Tao's Window::show calls GTK show_all, which otherwise unhides the menu.
                    widget.set_no_show_all(!show);
                    widget.set_visible(show);
                }
            }
        }
    });
}

pub fn apply_to_window(webview: &tauri::Webview) {
    #[cfg(target_os = "linux")]
    preserve_gtk_visibility(&webview.window(), webview.app_handle().state::<Visibility>().get());
    #[cfg(not(target_os = "macos"))]
    {
        if !webview.app_handle().state::<Visibility>().get() {
            let _ = webview.window().hide_menu();
        }
    }
}
