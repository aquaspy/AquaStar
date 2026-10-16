use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

pub const PLAYER_TITLE: &str = "AquaStar Lite";

/// Whether a window title should be replaced.
///
/// Flash is matched by window class on Windows. This title check covers the
/// titles that player still writes after the window exists. Ruffle 0.7.1 has
/// no command-line title, and its window starts as `Ruffle - <movie>`.
pub fn replacement_title(current: &str, flash: bool) -> Option<&'static str> {
    let replace = if flash {
        current.is_empty() || current.starts_with("Adobe Flash Player") || current == PLAYER_TITLE
    } else {
        current.starts_with("Ruffle") || current == PLAYER_TITLE
    };
    replace.then_some(PLAYER_TITLE)
}

/// Keep the player's window title, and on Windows also drop the Flash menu.
///
/// The watch runs until the process exits so a title the player writes when
/// the movie opens is replaced again. On Linux the Flash projector is handled
/// by the GTK helper instead. A native Wayland Ruffle window is left alone,
/// because another process cannot set its title. macOS has no supported way
/// to retitle the signed projector from outside.
pub fn watch(engine: super::Engine, pid: u32, stop: Arc<AtomicBool>) {
    #[cfg(any(windows, target_os = "linux"))]
    {
        #[cfg(target_os = "linux")]
        if matches!(engine, super::Engine::Flash) {
            let _ = (pid, stop);
            return;
        }
        std::thread::spawn(move || loop_until_dead(engine, pid, stop));
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    {
        let _ = (engine, pid, stop);
    }
}

#[cfg(any(windows, target_os = "linux"))]
fn loop_until_dead(engine: super::Engine, pid: u32, stop: Arc<AtomicBool>) {
    let mut misses = 0u32;
    while !stop.load(Ordering::SeqCst) {
        apply(engine, pid);
        if process_running(pid) {
            misses = 0;
        } else {
            misses += 1;
            // Two misses in a row means the process has exited. One miss can be
            // a process that has not appeared in the table yet.
            if misses >= 2 {
                break;
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

#[cfg(windows)]
fn apply(engine: super::Engine, pid: u32) {
    let flash = matches!(engine, super::Engine::Flash);
    let visit = Visit { pid, flash };
    unsafe {
        EnumWindows(visit_window, &visit as *const Visit as isize);
    }
}

#[cfg(windows)]
struct Visit {
    pid: u32,
    flash: bool,
}

#[cfg(windows)]
extern "system" fn visit_window(hwnd: isize, lp: isize) -> i32 {
    unsafe {
        let visit = &*(lp as *const Visit);
        let mut window_pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut window_pid);
        if window_pid != visit.pid || IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let class = window_class(hwnd);
        let title = window_title(hwnd);
        let flash_window = visit.flash && is_flash_window_class(&class);
        if flash_window {
            SetMenu(hwnd, 0);
        }
        if flash_window || replacement_title(&title, false).is_some() {
            set_title(hwnd);
        }
    }
    1
}

#[cfg(any(windows, test))]
fn is_flash_window_class(name: &str) -> bool {
    matches!(name, "ShockwaveFlash" | "SAFlashPlayer")
}

#[cfg(windows)]
fn window_class(hwnd: isize) -> String {
    let mut buf = [0i8; 64];
    let n = unsafe { GetClassNameA(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
    if n <= 0 {
        return String::new();
    }
    let n = n as usize;
    let mut bytes = [0u8; 64];
    for (slot, byte) in bytes.iter_mut().zip(buf.iter()).take(n) {
        *slot = *byte as u8;
    }
    String::from_utf8_lossy(&bytes[..n]).into_owned()
}

#[cfg(windows)]
fn window_title(hwnd: isize) -> String {
    let mut buf = [0u16; 256];
    let n = unsafe { GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
    if n <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buf[..n as usize])
}

#[cfg(windows)]
fn set_title(hwnd: isize) {
    let wide: Vec<u16> = PLAYER_TITLE
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        SetWindowTextW(hwnd, wide.as_ptr());
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
#[link(name = "user32")]
extern "system" {
    fn EnumWindows(cb: extern "system" fn(hwnd: isize, lparam: isize) -> i32, lparam: isize)
        -> i32;
    fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
    fn IsWindowVisible(hwnd: isize) -> i32;
    fn GetClassNameA(hwnd: isize, buf: *mut i8, max: i32) -> i32;
    fn GetWindowTextW(hwnd: isize, buf: *mut u16, max: i32) -> i32;
    fn SetWindowTextW(hwnd: isize, text: *const u16) -> i32;
    fn SetMenu(hwnd: isize, menu: isize) -> i32;
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
    fn GetExitCodeProcess(process: isize, code: *mut u32) -> i32;
    fn CloseHandle(handle: isize) -> i32;
}

#[cfg(target_os = "linux")]
fn process_running(pid: u32) -> bool {
    std::path::Path::new(&format!("/proc/{pid}")).exists()
}

#[cfg(target_os = "linux")]
fn apply(_engine: super::Engine, pid: u32) {
    unsafe {
        let display = XOpenDisplay(std::ptr::null());
        if display.is_null() {
            return;
        }
        retitle_pid(display, pid);
        XFlush(display);
        XCloseDisplay(display);
    }
}

#[cfg(target_os = "linux")]
fn retitle_pid(display: *mut std::ffi::c_void, pid: u32) {
    unsafe {
        let root = XDefaultRootWindow(display);
        let mut stack = vec![root];
        while let Some(window) = stack.pop() {
            if window != root {
                if window_pid(display, window) == Some(pid) {
                    let title = window_title(display, window);
                    if replacement_title(&title, false).is_some() {
                        set_window_title(display, window);
                    }
                }
            }
            let mut root_return = 0;
            let mut parent = 0;
            let mut children: *mut u64 = std::ptr::null_mut();
            let mut count = 0u32;
            if XQueryTree(
                display,
                window,
                &mut root_return,
                &mut parent,
                &mut children,
                &mut count,
            ) != 0
                && !children.is_null()
            {
                let list = std::slice::from_raw_parts(children, count as usize);
                stack.extend_from_slice(list);
                XFree(children as *mut std::ffi::c_void);
            }
        }
    }
}

#[cfg(target_os = "linux")]
fn window_pid(display: *mut std::ffi::c_void, window: u64) -> Option<u32> {
    let pid_atom = intern(display, "_NET_WM_PID");
    let cardinal = intern(display, "CARDINAL");
    let mut actual_type = 0u64;
    let mut actual_format = 0i32;
    let mut nitems = 0u64;
    let mut bytes_after = 0u64;
    let mut prop: *mut u8 = std::ptr::null_mut();
    let status = unsafe {
        XGetWindowProperty(
            display,
            window,
            pid_atom,
            0,
            1,
            0,
            cardinal,
            &mut actual_type,
            &mut actual_format,
            &mut nitems,
            &mut bytes_after,
            &mut prop,
        )
    };
    if status != 0 || prop.is_null() || nitems == 0 || actual_format != 32 {
        if !prop.is_null() {
            unsafe { XFree(prop as *mut std::ffi::c_void) };
        }
        return None;
    }
    let value = unsafe { *(prop as *const i64) } as u32;
    unsafe { XFree(prop as *mut std::ffi::c_void) };
    Some(value)
}

#[cfg(target_os = "linux")]
fn window_title(display: *mut std::ffi::c_void, window: u64) -> String {
    if let Some(title) = window_property(display, window, "_NET_WM_NAME", "UTF8_STRING") {
        if !title.is_empty() {
            return title;
        }
    }
    window_property(display, window, "WM_NAME", "STRING").unwrap_or_default()
}

#[cfg(target_os = "linux")]
fn window_property(
    display: *mut std::ffi::c_void,
    window: u64,
    property: &str,
    kind: &str,
) -> Option<String> {
    let mut actual_type = 0u64;
    let mut actual_format = 0i32;
    let mut nitems = 0u64;
    let mut bytes_after = 0u64;
    let mut prop: *mut u8 = std::ptr::null_mut();
    let status = unsafe {
        XGetWindowProperty(
            display,
            window,
            intern(display, property),
            0,
            1024,
            0,
            intern(display, kind),
            &mut actual_type,
            &mut actual_format,
            &mut nitems,
            &mut bytes_after,
            &mut prop,
        )
    };
    if status != 0 || prop.is_null() || nitems == 0 {
        if !prop.is_null() {
            unsafe { XFree(prop as *mut std::ffi::c_void) };
        }
        return None;
    }
    let bytes = unsafe { std::slice::from_raw_parts(prop, nitems as usize) };
    let title = String::from_utf8_lossy(bytes)
        .trim_end_matches('\u{0}')
        .to_string();
    unsafe { XFree(prop as *mut std::ffi::c_void) };
    Some(title)
}

#[cfg(target_os = "linux")]
fn set_window_title(display: *mut std::ffi::c_void, window: u64) {
    let c_title = std::ffi::CString::new(PLAYER_TITLE).expect("title");
    unsafe {
        XStoreName(display, window, c_title.as_ptr());
        XChangeProperty(
            display,
            window,
            intern(display, "_NET_WM_NAME"),
            intern(display, "UTF8_STRING"),
            8,
            0,
            c_title.as_ptr() as *const u8,
            PLAYER_TITLE.len() as i32,
        );
    }
}

#[cfg(target_os = "linux")]
fn intern(display: *mut std::ffi::c_void, name: &str) -> u64 {
    let c_name = std::ffi::CString::new(name).expect("atom");
    unsafe { XInternAtom(display, c_name.as_ptr(), 0) }
}

#[cfg(target_os = "linux")]
#[link(name = "X11")]
extern "C" {
    fn XOpenDisplay(name: *const i8) -> *mut std::ffi::c_void;
    fn XCloseDisplay(display: *mut std::ffi::c_void) -> i32;
    fn XDefaultRootWindow(display: *mut std::ffi::c_void) -> u64;
    fn XQueryTree(
        display: *mut std::ffi::c_void,
        window: u64,
        root: *mut u64,
        parent: *mut u64,
        children: *mut *mut u64,
        count: *mut u32,
    ) -> i32;
    fn XFree(data: *mut std::ffi::c_void) -> i32;
    fn XInternAtom(display: *mut std::ffi::c_void, name: *const i8, only_if_exists: i32) -> u64;
    fn XGetWindowProperty(
        display: *mut std::ffi::c_void,
        window: u64,
        property: u64,
        offset: i64,
        length: i64,
        delete: i32,
        req_type: u64,
        actual_type: *mut u64,
        actual_format: *mut i32,
        nitems: *mut u64,
        bytes_after: *mut u64,
        prop: *mut *mut u8,
    ) -> i32;
    fn XChangeProperty(
        display: *mut std::ffi::c_void,
        window: u64,
        property: u64,
        kind: u64,
        format: i32,
        mode: i32,
        data: *const u8,
        nelements: i32,
    ) -> i32;
    fn XStoreName(display: *mut std::ffi::c_void, window: u64, name: *const i8) -> i32;
    fn XFlush(display: *mut std::ffi::c_void) -> i32;
    fn XCreateSimpleWindow(
        display: *mut std::ffi::c_void,
        parent: u64,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
        border: u32,
        border_color: u64,
        background: u64,
    ) -> u64;
    fn XMapWindow(display: *mut std::ffi::c_void, window: u64) -> i32;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn player_titles_are_replaced_and_other_windows_are_not() {
        assert_eq!(
            replacement_title("Adobe Flash Player 32", true),
            Some(PLAYER_TITLE)
        );
        assert_eq!(replacement_title("", true), Some(PLAYER_TITLE));
        assert_eq!(replacement_title(PLAYER_TITLE, true), Some(PLAYER_TITLE));
        assert_eq!(replacement_title("Notepad", true), None);
        assert_eq!(
            replacement_title("Ruffle - Loader4.swf", false),
            Some(PLAYER_TITLE)
        );
        assert_eq!(replacement_title("Ruffle", false), Some(PLAYER_TITLE));
        assert_eq!(replacement_title(PLAYER_TITLE, false), Some(PLAYER_TITLE));
        assert_eq!(replacement_title("Adobe Flash Player 32", false), None);
        assert!(is_flash_window_class("ShockwaveFlash"));
        assert!(is_flash_window_class("SAFlashPlayer"));
        assert!(!is_flash_window_class("Ruffle"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn x11_window_title_becomes_aquastar_lite() {
        if std::env::var_os("DISPLAY").is_none() {
            return;
        }
        unsafe {
            let display = XOpenDisplay(std::ptr::null());
            if display.is_null() {
                return;
            }
            let root = XDefaultRootWindow(display);
            let window = XCreateSimpleWindow(display, root, 0, 0, 200, 100, 0, 0, 0);
            let initial = std::ffi::CString::new("Ruffle - Loader4.swf").unwrap();
            XStoreName(display, window, initial.as_ptr());
            XChangeProperty(
                display,
                window,
                intern(display, "_NET_WM_NAME"),
                intern(display, "UTF8_STRING"),
                8,
                0,
                initial.as_ptr() as *const u8,
                initial.as_bytes().len() as i32,
            );
            let pid = std::process::id();
            let pid_long = pid as i64;
            XChangeProperty(
                display,
                window,
                intern(display, "_NET_WM_PID"),
                intern(display, "CARDINAL"),
                32,
                0,
                &pid_long as *const i64 as *const u8,
                1,
            );
            XMapWindow(display, window);
            XFlush(display);
            retitle_pid(display, pid);
            XFlush(display);
            let title = window_title(display, window);
            XCloseDisplay(display);
            assert_eq!(title, PLAYER_TITLE);
        }
    }
}
