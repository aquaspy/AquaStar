use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// The standalone projector's top-level window. Wine and the player binary
/// both name this class `ShockwaveFlash`. `SAFlashPlayer` is the other class
/// string in that binary.
pub fn is_flash_window_class(name: &str) -> bool {
    matches!(name, "ShockwaveFlash" | "SAFlashPlayer")
}

/// Remove the File/View/Control/Help bar from the player's window.
///
/// The Windows projector draws that bar as a Win32 menu. `SetMenu(hwnd, NULL)`
/// drops it, including when a 64-bit process calls it on this 32-bit player.
/// The player can build the menu again when the movie opens, so this retries
/// until the process exits or the watch window ends.
pub fn hide_until_gone(pid: u32, stop: Arc<AtomicBool>) {
    #[cfg(windows)]
    {
        std::thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(45);
            let mut seen = false;
            while !stop.load(Ordering::SeqCst) && Instant::now() < deadline {
                clear_flash_menus(pid);
                let running = process_running(pid);
                if running {
                    seen = true;
                }
                if seen && !running {
                    break;
                }
                std::thread::sleep(Duration::from_millis(250));
            }
        });
    }
    #[cfg(not(windows))]
    {
        let _ = (pid, stop);
    }
}

#[cfg(windows)]
const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
#[cfg(windows)]
const STILL_ACTIVE: u32 = 259;

#[cfg(windows)]
fn process_running(pid: u32) -> bool {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle == 0 {
            return false;
        }
        let mut code = 0u32;
        let ok = GetExitCodeProcess(handle, &mut code);
        CloseHandle(handle);
        ok != 0 && code == STILL_ACTIVE
    }
}

#[cfg(windows)]
fn clear_flash_menus(pid: u32) {
    unsafe {
        EnumWindows(visit, pid as isize);
    }
}

#[cfg(windows)]
extern "system" fn visit(hwnd: isize, pid: isize) -> i32 {
    unsafe {
        let mut window_pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut window_pid);
        if window_pid != pid as u32 || IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let mut buf = [0i8; 64];
        let n = GetClassNameA(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if n <= 0 {
            return 1;
        }
        let n = n as usize;
        let mut bytes = [0u8; 64];
        for (slot, byte) in bytes.iter_mut().zip(buf.iter()).take(n) {
            *slot = *byte as u8;
        }
        let name = std::str::from_utf8(&bytes[..n]).unwrap_or("");
        if is_flash_window_class(name) {
            SetMenu(hwnd, 0);
        }
    }
    1
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn EnumWindows(cb: extern "system" fn(hwnd: isize, lparam: isize) -> i32, lparam: isize)
        -> i32;
    fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
    fn IsWindowVisible(hwnd: isize) -> i32;
    fn GetClassNameA(hwnd: isize, buf: *mut i8, max: i32) -> i32;
    fn SetMenu(hwnd: isize, menu: isize) -> i32;
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
    fn GetExitCodeProcess(process: isize, code: *mut u32) -> i32;
    fn CloseHandle(handle: isize) -> i32;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_projector_window_class_is_recognized() {
        assert!(is_flash_window_class("ShockwaveFlash"));
        assert!(is_flash_window_class("SAFlashPlayer"));
        assert!(!is_flash_window_class("MozillaWindowClass"));
        assert!(!is_flash_window_class(""));
    }
}
