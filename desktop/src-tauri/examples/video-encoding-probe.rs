//! Encode a synthetic silent clip with the production encoder, without desktop permissions.
#[path = "../src/capture/encoder.rs"]
mod encoder;
fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args().collect();
    let binary = std::path::Path::new(args.get(1).ok_or("Expected FFmpeg path")?);
    let directory = std::path::Path::new(args.get(2).ok_or("Expected output directory")?);
    std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let temporary = directory.join("clip.recording.mp4");
    let mut video = encoder::Video::new(binary, &temporary, (320, 240), 30)?;
    for index in 0..60 {
        video.write(&xcap::image::RgbaImage::from_pixel(320, 240, xcap::image::Rgba([index * 4, 100, 180, 255])))?;
    }
    video.finish()?;
    encoder::seal(binary, &temporary, &directory.join("clip.mp4"))?;
    println!("Saved 60 video frames without an audio capture service.");
    Ok(())
}
