#[cfg(target_os = "linux")]
#[path = "../src/portal_identity.rs"]
mod portal_identity;
#[path = "../src/capture/backend.rs"]
mod backend;
#[path = "../src/capture/encoder.rs"]
mod encoder;
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

#[cfg(target_os = "linux")]
fn log_linux_window_diagnostics(pid: u32) {
    use std::process::Command;

    let root_clients = Command::new("xprop")
        .args(["-root", "_NET_CLIENT_LIST_STACKING"])
        .output();
    let client_list = match root_clients {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
            eprintln!(
                "X11 root _NET_CLIENT_LIST_STACKING (status {:?}): {}{}",
                output.status,
                stdout,
                String::from_utf8_lossy(&output.stderr)
            );
            stdout
        }
        Err(error) => {
            eprintln!("Could not query X11 root client list with xprop: {error}");
            String::new()
        }
    };
    if !client_list.contains("0x") {
        match Command::new("xwininfo").args(["-root", "-tree"]).output() {
            Ok(output) => {
                let tree = String::from_utf8_lossy(&output.stdout);
                eprintln!(
                    "X11 root tree (status {:?}): {}{}",
                    output.status,
                    tree,
                    String::from_utf8_lossy(&output.stderr)
                );
                for xid in tree.lines().filter_map(|line| {
                    let xid = line.trim().split_whitespace().next()?;
                    xid.starts_with("0x").then_some(xid)
                }) {
                    match Command::new("xprop")
                        .args(["-id", xid, "_NET_WM_PID"])
                        .output()
                    {
                        Ok(output) => eprintln!(
                            "X11 root child {xid} _NET_WM_PID (status {:?}): {}{}",
                            output.status,
                            String::from_utf8_lossy(&output.stdout),
                            String::from_utf8_lossy(&output.stderr)
                        ),
                        Err(error) => eprintln!("Could not query _NET_WM_PID for {xid}: {error}"),
                    }
                }
            }
            Err(error) => eprintln!("Could not query X11 root tree with xwininfo: {error}"),
        }
    }

    match xcap::Window::all() {
        Ok(windows) => {
            eprintln!("xcap windows while looking for fixture PID {pid}:");
            for window in windows {
                eprintln!("  XID {:?}, PID {:?}", window.id(), window.pid());
            }
        }
        Err(error) => eprintln!("xcap window enumeration failed: {error}"),
    }
}

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
    // A fixture's GTK idle callback can run before the X11 window manager has
    // published its owned client. Wait for that condition, not a fixed delay.
    let deadline = Instant::now() + Duration::from_secs(10);
    let target = loop {
        let targets = match backend::targets(&[pid]) {
            Ok(targets) => targets,
            Err(error) => {
                #[cfg(target_os = "linux")]
                log_linux_window_diagnostics(pid);
                return Err(error);
            }
        };
        if !targets.is_empty() {
            break backend::select(targets, None)?;
        }
        if Instant::now() >= deadline {
            #[cfg(target_os = "linux")]
            log_linux_window_diagnostics(pid);
            return Err("No owned fixture window appeared within 10 seconds.".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    };
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
