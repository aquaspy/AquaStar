use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc::{self, Receiver, SyncSender},
    Arc, Mutex,
};
use std::time::Duration;
#[cfg(target_os = "linux")]
#[path = "audio_linux.rs"]
mod platform;
#[cfg(windows)]
#[path = "audio_windows.rs"]
mod platform;
#[cfg(target_os = "macos")]
#[path = "audio_macos.rs"]
mod platform;
pub struct Session {
    pub receiver: Arc<Mutex<Receiver<Vec<u8>>>>,
    pub stop: Arc<AtomicBool>,
    worker: Option<std::thread::JoinHandle<Result<(), String>>>,
}
impl Session {
    pub fn failed(&self) -> bool {
        self.worker.as_ref().is_some_and(|w| w.is_finished())
    }
    pub fn finish(&mut self) -> Result<(), String> {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(worker) = self.worker.take() {
            worker
                .join()
                .map_err(|_| "Game audio capture stopped unexpectedly")??;
        }
        Ok(())
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
    }
}
pub fn available(pid: u32) -> bool {
    platform::available(pid)
}
pub fn start(pid: u32) -> Result<Session, String> {
    let (tx, rx) = mpsc::sync_channel(16);
    let (ready, wait) = mpsc::sync_channel(1);
    let stop = Arc::new(AtomicBool::new(false));
    let flag = stop.clone();
    let worker = std::thread::spawn(move || platform::run(pid, tx, flag, ready));
    match wait.recv_timeout(Duration::from_secs(60)) {
        Ok(Ok(())) => Ok(Session {
            receiver: Arc::new(Mutex::new(rx)),
            stop,
            worker: Some(worker),
        }),
        Ok(Err(error)) => {
            stop.store(true, Ordering::SeqCst);
            Err(error)
        }
        Err(_) => {
            stop.store(true, Ordering::SeqCst);
            Err("Game audio did not initialize in time.".into())
        }
    }
}
pub(super) fn send(tx: &SyncSender<Vec<u8>>, data: Vec<u8>) -> Result<(), String> {
    tx.try_send(data).map_err(|_| {
        "Audio encoder could not keep up. Recording stopped to avoid losing synchronization.".into()
    })
}
