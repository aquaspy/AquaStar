//! Audio is optional: losing it must never terminate the video track.
use std::path::Path;
use super::{audio, encoder};
pub struct Track {
    sound: Option<encoder::Audio>,
    pub warning: Option<String>,
}
impl Track {
    pub fn start(requested: bool, pid: u32, binary: &Path, path: &Path) -> Self {
        let mut track = Self { sound: None, warning: None };
        if requested {
            match audio::start(pid).and_then(|session| encoder::Audio::new(binary, path, session)) {
                Ok(sound) => track.sound = Some(sound),
                Err(error) => track.warning = Some(format!("Recording without audio: {error}")),
            }
        }
        track
    }
    pub fn active(&self) -> bool { self.sound.is_some() }
    pub fn poll(&mut self) {
        if self.sound.as_ref().is_some_and(|sound| !sound.healthy()) {
            if let Some(mut sound) = self.sound.take() { let _ = sound.finish(); }
            self.warning = Some("Game audio became unavailable. Recording continues without audio.".into());
        }
    }
    pub fn finish(&mut self) -> bool {
        match self.sound.take() {
            Some(mut sound) => match sound.finish() {
                Ok(()) => true,
                Err(error) => { self.warning = Some(format!("Video saved without audio: {error}")); false }
            },
            None => false,
        }
    }
}
