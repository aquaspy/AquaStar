use x11rb::{
    connection::Connection,
    protocol::{
        composite::ConnectionExt as _,
        xproto::{ConnectionExt as _, ImageFormat},
    },
};
pub fn grab(window: u32) -> Result<xcap::image::RgbaImage, String> {
    let (connection, _) = x11rb::connect(None).map_err(|e| e.to_string())?;
    let geometry = connection
        .get_geometry(window)
        .map_err(|e| e.to_string())?
        .reply()
        .map_err(|e| e.to_string())?;
    let pixmap = connection.generate_id().map_err(|e| e.to_string())?;
    connection
        .composite_name_window_pixmap(window, pixmap)
        .map_err(|e| e.to_string())?
        .check()
        .map_err(|e| e.to_string())?;
    let reply = connection
        .get_image(
            ImageFormat::Z_PIXMAP,
            pixmap,
            0,
            0,
            geometry.width,
            geometry.height,
            u32::MAX,
        )
        .map_err(|e| e.to_string())?
        .reply()
        .map_err(|e| e.to_string());
    let _ = connection.free_pixmap(pixmap);
    let reply = reply?;
    if !matches!(reply.depth, 24 | 32) {
        return Err("Unsupported X11 pixel depth.".into());
    }
    let width = geometry.width as u32;
    let height = geometry.height as u32;
    let expected = width as usize * height as usize * 4;
    if reply.data.len() != expected {
        return Err("Unsupported X11 pixel layout.".into());
    }
    let mut rgba = reply.data;
    let little =
        connection.setup().image_byte_order == x11rb::protocol::xproto::ImageOrder::LSB_FIRST;
    for pixel in rgba.chunks_exact_mut(4) {
        if little {
            pixel.swap(0, 2);
            pixel[3] = 255;
        } else {
            let r = pixel[1];
            let g = pixel[2];
            let b = pixel[3];
            pixel.copy_from_slice(&[r, g, b, 255]);
        }
    }
    xcap::image::RgbaImage::from_raw(width, height, rgba).ok_or("Invalid X11 frame.".into())
}
