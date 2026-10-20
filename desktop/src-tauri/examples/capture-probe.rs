#[path = "../src/capture/backend.rs"]
mod backend;
#[path = "../src/capture/encoder.rs"]
mod encoder;
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};
fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args().collect();
    let pid = args
        .get(1)
        .ok_or("Expected fixture PID")?
        .parse::<u32>()
        .map_err(|e| e.to_string())?;
    let binary = PathBuf::from(args.get(2).ok_or("Expected encoder path")?);
    let directory = PathBuf::from(args.get(3).ok_or("Expected output directory")?);
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let target = backend::select(backend::targets(&[pid])?, None)?;
    let mut source = backend::Source::new(
        &target,
        None,
        std::env::var_os("AQUASTAR_PROBE_AUTHORIZATION").map(PathBuf::from),
    )?;
    let first = source.frame()?;
    first
        .save(directory.join("screenshot.png"))
        .map_err(|e| e.to_string())?;
    let dimensions = encoder::dimensions(first.width(), first.height())?;
    let mut video = encoder::Video::new(&binary, &directory.join("video.mp4"), dimensions, 30)?;
    let started = Instant::now();
    let seconds = std::env::var("AQUASTAR_PROBE_SECONDS")
        .ok()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(3)
        .clamp(1, 3600);
    let count = seconds * 30;
    let mut index = 0u32;
    while index < count {
        let due = ((started.elapsed().as_secs_f64() * 30.0).floor() as u32).min(count - 1);
        if index <= due {
            let frame = source.frame()?;
            while index <= due {
                video.write(&frame)?;
                index += 1;
            }
        } else {
            std::thread::sleep(Duration::from_millis(2));
        }
    }
    video.finish()?;
    println!(
        "{}",
        serde_json::json!({"pid":pid,"width":first.width(),"height":first.height(),"frames":count,"seconds":started.elapsed().as_secs_f64()})
    );
    Ok(())
}
