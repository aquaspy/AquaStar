//! The AquaStar icon for player windows.
//!
//! The launcher cannot edit a pinned player's executable, because its SHA-256 is
//! checked. It sets the icon on the player's window from outside the process
//! instead, the same way `flash_menu` sets the title. That covers Windows (both
//! engines) and X11 Ruffle. The Linux Flash projector gets its icon from the GTK
//! helper. A native Wayland window takes its icon from the app id, and macOS
//! takes it from the signed `.app`, so neither can be changed from here.

#[cfg(windows)]
pub const PNG_16: &[u8] = include_bytes!("../../icons/16x16.png");
#[cfg(any(target_os = "linux", test))]
pub const PNG_32: &[u8] = include_bytes!("../../icons/32x32.png");
#[cfg(any(windows, target_os = "linux", test))]
pub const PNG_64: &[u8] = include_bytes!("../../icons/64x64.png");
#[cfg(any(target_os = "linux", test))]
pub const PNG_128: &[u8] = include_bytes!("../../icons/128x128.png");

/// One `_NET_WM_ICON` block: width, height, then one `0xAARRGGBB` value per pixel.
/// X11 stores each value in a C `long`.
#[cfg(any(target_os = "linux", test))]
fn argb_block(width: u32, height: u32, rgba: &[u8]) -> Vec<i64> {
    let mut block = Vec::with_capacity(2 + rgba.len() / 4);
    block.push(i64::from(width));
    block.push(i64::from(height));
    for px in rgba.chunks_exact(4) {
        let (r, g, b, a) = (px[0], px[1], px[2], px[3]);
        block.push(i64::from(u32::from_be_bytes([a, r, g, b])));
    }
    block
}

/// All icon sizes as consecutive `_NET_WM_ICON` blocks. Empty when a PNG does not decode.
#[cfg(any(target_os = "linux", test))]
pub fn net_wm_icon() -> &'static [i64] {
    use std::sync::OnceLock;
    static DATA: OnceLock<Vec<i64>> = OnceLock::new();
    DATA.get_or_init(|| {
        let mut data = Vec::new();
        for png in [PNG_32, PNG_64, PNG_128] {
            match tauri::image::Image::from_bytes(png) {
                Ok(image) => data.extend(argb_block(image.width(), image.height(), image.rgba())),
                Err(err) => {
                    eprintln!("aquastar-lite: window icon was not decoded ({err})");
                    return Vec::new();
                }
            }
        }
        data
    })
}

#[cfg(windows)]
pub fn apply(hwnd: isize) {
    use std::sync::OnceLock;
    const WM_GETICON: u32 = 0x007F;
    const WM_SETICON: u32 = 0x0080;
    const ICON_SMALL: usize = 0;
    const ICON_BIG: usize = 1;
    const SMTO_ABORTIFHUNG: u32 = 0x0002;
    const TIMEOUT_MS: u32 = 200;
    // Windows accepts the PNG payload of an .ico entry (Vista and later).
    const ICON_VERSION: u32 = 0x0003_0000;

    static ICONS: OnceLock<(isize, isize)> = OnceLock::new();
    let make = |png: &[u8], size: i32| unsafe {
        CreateIconFromResourceEx(png.as_ptr(), png.len() as u32, 1, ICON_VERSION, size, size, 0)
    };
    let (small, big) = *ICONS.get_or_init(|| (make(PNG_16, 16), make(PNG_64, 64)));
    for (which, icon) in [(ICON_SMALL, small), (ICON_BIG, big)] {
        if icon == 0 {
            continue;
        }
        let mut current = 0usize;
        let answered = unsafe {
            SendMessageTimeoutW(hwnd, WM_GETICON, which, 0, SMTO_ABORTIFHUNG, TIMEOUT_MS, &mut current)
        };
        if answered == 0 || current as isize == icon {
            continue;
        }
        let mut ignored = 0usize;
        unsafe {
            SendMessageTimeoutW(
                hwnd,
                WM_SETICON,
                which,
                icon,
                SMTO_ABORTIFHUNG,
                TIMEOUT_MS,
                &mut ignored,
            );
        }
    }
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn CreateIconFromResourceEx(
        bits: *const u8,
        size: u32,
        icon: i32,
        version: u32,
        cx: i32,
        cy: i32,
        flags: u32,
    ) -> isize;
    fn SendMessageTimeoutW(
        hwnd: isize,
        msg: u32,
        wparam: usize,
        lparam: isize,
        flags: u32,
        timeout: u32,
        result: *mut usize,
    ) -> isize;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn argb_blocks_pack_size_then_pixels() {
        let block = argb_block(2, 1, &[0x11, 0x22, 0x33, 0x44, 0xff, 0x00, 0x80, 0x00]);
        assert_eq!(block, vec![2, 1, 0x4411_2233, 0x00ff_0080]);
    }

    #[test]
    fn the_shipped_icon_decodes_at_every_size() {
        let data = net_wm_icon();
        let mut at = 0;
        let mut sizes = Vec::new();
        while at < data.len() {
            let (w, h) = (data[at] as usize, data[at + 1] as usize);
            sizes.push(w);
            assert_eq!(w, h);
            at += 2 + w * h;
        }
        assert_eq!(at, data.len());
        assert_eq!(sizes, vec![32, 64, 128]);
    }
}
