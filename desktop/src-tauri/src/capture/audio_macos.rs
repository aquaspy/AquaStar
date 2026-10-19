use super::*;
use std::{
    io::Read,
    process::{Command, Stdio},
};
pub fn available(_pid: u32) -> bool {
    std::process::Command::new("/usr/bin/sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.split('.').next()?.parse::<u32>().ok())
        .is_some_and(|v| v >= 13)
}
pub fn run(
    pid: u32,
    tx: SyncSender<Vec<u8>>,
    stop: Arc<AtomicBool>,
    ready: SyncSender<Result<(), String>>,
) -> Result<(), String> {
    let result = (|| -> Result<(), String> {
        if !available(pid) {
            return Err("Game audio requires macOS 13 or later.".into());
        }
        let mut child = Command::new(super::super::backend::mac_helper()?)
            .args(["audio", &pid.to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
        let mut output = child.stdout.take().unwrap();
        let flag = stop.clone();
        let child = Arc::new(Mutex::new(child));
        let killer = child.clone();
        std::thread::spawn(move || {
            while !flag.load(Ordering::SeqCst) {
                if killer.lock().unwrap().try_wait().ok().flatten().is_some() {
                    return;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            let mut c = killer.lock().unwrap();
            let _ = c.kill();
            let _ = c.wait();
        });
        let mut marker = [0; 4];
        output.read_exact(&mut marker).map_err(|_| {
            "Screen/audio capture permission was denied or the game could not be captured."
        })?;
        if &marker != b"ASAU" {
            return Err("Invalid native audio stream.".into());
        }
        let _ = ready.send(Ok(()));
        let mut bytes = vec![0; 7680];
        while !stop.load(Ordering::SeqCst) {
            match output.read(&mut bytes) {
                Ok(0) => return Err("Native game audio ended unexpectedly.".into()),
                Ok(count) => super::send(&tx, bytes[..count].to_vec())?,
                Err(error) => return Err(error.to_string()),
            }
        }
        stop.store(true, Ordering::SeqCst);
        Ok(())
    })();
    if let Err(error) = &result {
        stop.store(true, Ordering::SeqCst);
        let _ = ready.try_send(Err(error.clone()));
    }
    result
}
