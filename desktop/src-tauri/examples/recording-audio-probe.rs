//! Exercise production audio fallback with the real video encoder, without a portal.
#[path = "../src/capture/audio.rs"] mod audio;
#[path = "../src/capture/encoder.rs"] mod encoder;
#[path = "../src/capture/recording_audio.rs"] mod recording_audio;
fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args().collect();
    let binary = std::path::Path::new(args.get(1).ok_or("Expected encoder")?);
    let out = std::path::Path::new(args.get(2).ok_or("Expected output folder")?);
    std::fs::create_dir_all(out).map_err(|e| e.to_string())?;
    for requested in [true, false] {
        let name = if requested { "missing-game-audio" } else { "audio-disabled" };
        let mut track = recording_audio::Track::start(requested, u32::MAX, binary, &out.join(format!("{name}.m4a")));
        assert!(!track.active());
        assert_eq!(track.warning.is_some(), requested);
        let raw = out.join(format!("{name}.raw.mp4"));
        let mut video = encoder::Video::new(binary, &raw, (320, 240), 30)?;
        for i in 0..60 {
            let frame = xcap::image::RgbaImage::from_pixel(320,240,xcap::image::Rgba([i * 4, 100, 180, 255]));
            track.poll(); video.write(&frame)?;
        }
        assert!(!track.finish());
        video.finish()?;
        encoder::seal(binary, &raw, &out.join(format!("{name}.mp4")))?;
        std::fs::remove_file(raw).map_err(|e|e.to_string())?;
        println!("{name}: saved 60 video frames; warning={:?}", track.warning);
    }
    if let Some(pid) = args.get(3) {
        let pid = pid.parse::<u32>().map_err(|e|e.to_string())?;
        let mut track = recording_audio::Track::start(true, pid, binary, &out.join("disconnect.m4a"));
        assert!(track.active(), "fixture audio must start successfully");
        println!("Fixture audio connected; ready for disconnect");
        use std::io::Write;
        std::io::stdout().flush().unwrap();
        let raw = out.join("disconnect.raw.mp4");
        let mut video = encoder::Video::new(binary, &raw, (320,240),30)?;
        for _ in 0..120 {
            track.poll();
            video.write(&xcap::image::RgbaImage::new(320,240))?;
            std::thread::sleep(std::time::Duration::from_millis(34));
        }
        assert!(!track.active(), "disconnect must disable audio while video continues");
        assert!(track.warning.is_some());
        assert!(!track.finish()); video.finish()?;
        encoder::seal(binary, &raw, &out.join("disconnect.mp4"))?;
        println!("Disconnected audio: saved 120 video frames");
    }
    Ok(())
}
