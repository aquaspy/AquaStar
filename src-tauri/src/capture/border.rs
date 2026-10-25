#[path = "border_draw.rs"]
mod draw;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct Pid(u32);

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct NativeId(u32);

#[derive(Clone, Copy, PartialEq, Debug)]
struct Srgb {
    r: f32,
    g: f32,
    b: f32,
}

const FLASH_COLOR: Srgb = Srgb {
    r: 0.10,
    g: 0.52,
    b: 1.0,
};
const RECORD_COLOR: Srgb = Srgb {
    r: 1.0,
    g: 0.18,
    b: 0.22,
};
const FLASH_MS: u64 = 650;
const TICK: Duration = Duration::from_millis(50);

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct Rect {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Kind {
    Flash,
    Recording,
}

/// Where this process is allowed to draw.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Host {
    Win32,
    X11,
    Hyprland,
    Other,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct Seen {
    pid: Pid,
    id: Option<NativeId>,
    bounds: Rect,
    mapped: bool,
}

#[derive(Clone, PartialEq, Eq, Debug, Default)]
struct Observation {
    front_pid: Option<Pid>,
    windows: Vec<Seen>,
}

#[derive(Clone, Copy, PartialEq, Debug)]
struct Paint {
    rect: Rect,
    color: Srgb,
}

/// Recording is listed first because it is painted underneath the flash.
#[derive(Clone, Copy, PartialEq, Debug, Default)]
struct Desired {
    recording: Option<Paint>,
    flash: Option<Paint>,
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum NativeOp {
    Create { kind: Kind, paint: Paint },
    Move { kind: Kind, paint: Paint },
    Destroy { kind: Kind },
}

#[derive(Clone, Copy, PartialEq, Debug, Default)]
struct Applied {
    recording: Option<Paint>,
    flash: Option<Paint>,
}

struct SampleHint {
    windows: Vec<(Pid, NativeId)>,
}

/// `window` is the capture id on Win32 and X11. Hyprland follows the pid only.
struct Follow {
    generation: u64,
    pid: u32,
    window: Option<u32>,
    until: Option<u64>,
    rect: Option<Rect>,
}

#[derive(Default)]
struct Board {
    flash: Option<Follow>,
    recording: Option<Follow>,
}

enum Note {
    Flash {
        generation: u64,
        pid: u32,
        window: Option<u32>,
    },
    Record {
        generation: u64,
        pid: u32,
        window: Option<u32>,
    },
    HideRecord {
        generation: u64,
    },
}

fn host_of(windows_os: bool, linux_os: bool, session_type_wayland: bool, hyprland: bool) -> Host {
    if windows_os {
        return Host::Win32;
    }
    if linux_os && session_type_wayland && hyprland {
        return Host::Hyprland;
    }
    if linux_os && session_type_wayland {
        return Host::Other;
    }
    if linux_os {
        return Host::X11;
    }
    Host::Other
}

/// `None` on a host that must not draw. Hyprland's inner `None` drops the window id.
fn tracked(host: Host, pid: u32, window: u32) -> Option<(u32, Option<u32>)> {
    match host {
        Host::Win32 | Host::X11 => Some((pid, Some(window))),
        Host::Hyprland => Some((pid, None)),
        Host::Other => None,
    }
}

fn place(pid: u32, window: Option<u32>, observation: &Observation) -> Option<Rect> {
    if observation.front_pid != Some(Pid(pid)) {
        return None;
    }
    observation
        .windows
        .iter()
        .filter(|seen| {
            seen.mapped
                && seen.bounds.width > 0
                && seen.bounds.height > 0
                && seen.pid == Pid(pid)
                && window.is_none_or(|id| seen.id == Some(NativeId(id)))
        })
        .map(|seen| seen.bounds)
        .max_by_key(|rect| u64::from(rect.width).saturating_mul(u64::from(rect.height)))
}

fn hold(
    slot: &mut Option<Follow>,
    generation: u64,
    pid: u32,
    window: Option<u32>,
    until: Option<u64>,
) {
    *slot = Some(Follow {
        generation,
        pid,
        window,
        until,
        rect: None,
    });
}

fn apply(board: &mut Board, now: u64, note: Note) {
    match note {
        Note::Flash {
            generation,
            pid,
            window,
        } => hold(
            &mut board.flash,
            generation,
            pid,
            window,
            Some(now.saturating_add(FLASH_MS)),
        ),
        Note::Record {
            generation,
            pid,
            window,
        } => hold(&mut board.recording, generation, pid, window, None),
        Note::HideRecord { generation } => {
            if board
                .recording
                .as_ref()
                .is_some_and(|live| live.generation == generation)
            {
                board.recording = None;
            }
        }
    }
}

fn tick(slot: &mut Option<Follow>, now: u64, observation: &Observation) {
    let expired = slot
        .as_ref()
        .is_some_and(|live| live.until.is_some_and(|until| now >= until));
    if expired {
        *slot = None;
        return;
    }
    if let Some(live) = slot {
        live.rect = place(live.pid, live.window, observation);
    }
}

fn paint(live: Option<&Follow>, color: Srgb) -> Option<Paint> {
    let rect = live?.rect?;
    if rect.width == 0 || rect.height == 0 {
        return None;
    }
    Some(Paint { rect, color })
}

fn desired(board: &Board) -> Desired {
    Desired {
        recording: paint(board.recording.as_ref(), RECORD_COLOR),
        flash: paint(board.flash.as_ref(), FLASH_COLOR),
    }
}

fn hint(board: &Board) -> SampleHint {
    let mut windows = Vec::new();
    for live in board.flash.iter().chain(board.recording.iter()) {
        if let Some(id) = live.window {
            windows.push((Pid(live.pid), NativeId(id)));
        }
    }
    SampleHint { windows }
}

fn desktop_identifies_hyprland(value: &str) -> bool {
    value
        .split(|character: char| character == ':' || character == ';' || character.is_whitespace())
        .any(|desktop| desktop.eq_ignore_ascii_case("hyprland"))
}

fn hyprland_session() -> bool {
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("HYPRLAND_INSTANCE_SIGNATURE").is_some_and(|value| !value.is_empty()) {
            return true;
        }
        ["XDG_CURRENT_DESKTOP", "XDG_SESSION_DESKTOP"]
            .into_iter()
            .filter_map(|name| std::env::var(name).ok())
            .any(|value| desktop_identifies_hyprland(&value))
    }
    #[cfg(not(target_os = "linux"))]
    false
}

fn session_is_wayland() -> bool {
    cfg!(target_os = "linux")
        && std::env::var("XDG_SESSION_TYPE").is_ok_and(|value| value == "wayland")
}

fn current_host() -> Host {
    host_of(
        cfg!(windows),
        cfg!(target_os = "linux"),
        session_is_wayland(),
        hyprland_session(),
    )
}

pub(super) fn flash(pid: u32, id: u32) {
    let Some((pid, window)) = tracked(current_host(), pid, id) else {
        return;
    };
    let _ = sender().send(Note::Flash {
        generation: next_generation(),
        pid,
        window,
    });
}

pub(super) fn show_recording(pid: u32, id: u32) -> u64 {
    let Some((pid, window)) = tracked(current_host(), pid, id) else {
        return 0;
    };
    let generation = next_generation();
    let _ = sender().send(Note::Record {
        generation,
        pid,
        window,
    });
    generation
}

pub(super) fn hide_recording(generation: u64) {
    // A host that never showed a border has no actor. Drop must not be the
    // call that starts one.
    let Some(sender) = SENDER.get() else {
        return;
    };
    let _ = sender.send(Note::HideRecord { generation });
}

fn next_generation() -> u64 {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    NEXT.fetch_add(1, Ordering::Relaxed)
}

static SENDER: OnceLock<Sender<Note>> = OnceLock::new();

fn sender() -> &'static Sender<Note> {
    SENDER.get_or_init(|| {
        let (tx, rx) = mpsc::channel();
        let _ = std::thread::Builder::new()
            .name("aquastar-border".into())
            .spawn(|| serve(rx));
        tx
    })
}

fn serve(rx: Receiver<Note>) {
    let mut board = Board::default();
    let mut drawer = draw::Drawer::open(current_host());
    let origin = Instant::now();
    loop {
        let incoming = if board.flash.is_none() && board.recording.is_none() {
            match rx.recv() {
                Ok(note) => Some(note),
                Err(_) => break,
            }
        } else {
            match rx.recv_timeout(TICK) {
                Ok(note) => Some(note),
                Err(RecvTimeoutError::Timeout) => None,
                Err(RecvTimeoutError::Disconnected) => break,
            }
        };
        let mut batch = Vec::new();
        if let Some(note) = incoming {
            batch.push(note);
            while let Ok(note) = rx.try_recv() {
                batch.push(note);
            }
        }
        let now = origin.elapsed().as_millis() as u64;
        for note in batch {
            apply(&mut board, now, note);
        }
        if board.flash.is_some() || board.recording.is_some() {
            let seen = drawer.sample(&hint(&board));
            tick(&mut board.flash, now, &seen);
            tick(&mut board.recording, now, &seen);
        }
        drawer.sync(&desired(&board));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: i32, y: i32, width: u32, height: u32) -> Rect {
        Rect {
            x,
            y,
            width,
            height,
        }
    }

    fn seen(pid: u32, id: Option<u32>, bounds: Rect, mapped: bool) -> Seen {
        Seen {
            pid: Pid(pid),
            id: id.map(NativeId),
            bounds,
            mapped,
        }
    }

    fn watching(pid: u32, windows: Vec<Seen>) -> Observation {
        Observation {
            front_pid: Some(Pid(pid)),
            windows,
        }
    }

    #[test]
    fn hides_when_the_player_is_not_frontmost() {
        let observation = Observation {
            front_pid: Some(Pid(9)),
            windows: vec![seen(4, Some(8), rect(0, 0, 100, 80), true)],
        };
        assert!(place(4, Some(8), &observation).is_none());
    }

    #[test]
    fn shows_the_mapped_rect_of_the_front_player() {
        let observation = watching(4, vec![seen(4, Some(8), rect(3, 4, 100, 80), true)]);
        assert_eq!(place(4, Some(8), &observation), Some(rect(3, 4, 100, 80)));
    }

    #[test]
    fn hides_an_unmapped_or_empty_window() {
        let iconic = watching(4, vec![seen(4, Some(8), rect(0, 0, 100, 80), false)]);
        let empty = watching(4, vec![seen(4, Some(8), rect(0, 0, 0, 80), true)]);
        assert!(place(4, Some(8), &iconic).is_none());
        assert!(place(4, Some(8), &empty).is_none());
    }

    #[test]
    fn picks_the_larger_window_of_one_hyprland_pid() {
        let observation = watching(
            5,
            vec![
                seen(5, None, rect(0, 0, 10, 10), true),
                seen(5, None, rect(1, 2, 50, 40), true),
            ],
        );
        assert_eq!(place(5, None, &observation), Some(rect(1, 2, 50, 40)));
    }

    #[test]
    fn host_of_keeps_an_x11_session_even_when_hyprland_is_named() {
        assert_eq!(host_of(false, true, false, true), Host::X11);
        assert_eq!(host_of(false, true, true, true), Host::Hyprland);
        assert_eq!(host_of(false, true, true, false), Host::Other);
        assert!(tracked(Host::Other, 9, 4).is_none());
    }

    #[test]
    fn hyprland_tracks_the_pid_and_drops_the_window_id() {
        assert_eq!(tracked(Host::Hyprland, 9, 9), Some((9, None)));
        assert_eq!(tracked(Host::X11, 9, 4), Some((9, Some(4))));
    }

    #[test]
    fn desktop_token_identifies_hyprland_without_a_substring_match() {
        assert!(desktop_identifies_hyprland("omarchy:Hyprland"));
        assert!(!desktop_identifies_hyprland("GNOME"));
        assert!(!desktop_identifies_hyprland("NotHyprland"));
    }

    #[test]
    fn an_older_hide_does_not_clear_a_newer_recording() {
        let mut board = Board::default();
        apply(
            &mut board,
            0,
            Note::Record {
                generation: 1,
                pid: 1,
                window: Some(2),
            },
        );
        apply(
            &mut board,
            0,
            Note::Record {
                generation: 2,
                pid: 1,
                window: Some(2),
            },
        );
        apply(&mut board, 0, Note::HideRecord { generation: 1 });
        assert_eq!(board.recording.as_ref().unwrap().generation, 2);
        apply(&mut board, 0, Note::HideRecord { generation: 2 });
        assert!(board.recording.is_none());
        apply(&mut board, 0, Note::HideRecord { generation: 2 });
        assert!(board.recording.is_none());
    }

    #[test]
    fn a_flash_does_not_replace_the_recording() {
        let mut board = Board::default();
        apply(
            &mut board,
            0,
            Note::Record {
                generation: 3,
                pid: 1,
                window: Some(2),
            },
        );
        apply(
            &mut board,
            0,
            Note::Flash {
                generation: 4,
                pid: 1,
                window: Some(2),
            },
        );
        assert_eq!(board.recording.as_ref().unwrap().generation, 3);
        assert_eq!(board.flash.as_ref().unwrap().generation, 4);
    }

    #[test]
    fn a_flash_clears_at_its_deadline_and_leaves_the_recording() {
        let mut board = Board::default();
        apply(
            &mut board,
            0,
            Note::Record {
                generation: 3,
                pid: 1,
                window: Some(2),
            },
        );
        apply(
            &mut board,
            1_000,
            Note::Flash {
                generation: 5,
                pid: 1,
                window: Some(2),
            },
        );
        let observation = watching(1, vec![seen(1, Some(2), rect(0, 0, 20, 20), true)]);
        tick(&mut board.flash, 1_649, &observation);
        tick(&mut board.recording, 1_649, &observation);
        assert!(board.flash.is_some());
        tick(&mut board.flash, 1_650, &observation);
        tick(&mut board.recording, 1_650, &observation);
        assert!(board.flash.is_none());
        assert_eq!(board.recording.as_ref().unwrap().generation, 3);
        assert_eq!(
            board.recording.as_ref().unwrap().rect,
            Some(rect(0, 0, 20, 20))
        );
    }

    #[test]
    fn macos_source_locks_the_same_stroke_numbers() {
        let source = include_str!("feedback_macos.m");
        for needle in [
            "colorWithSRGBRed:0.10 green:0.52 blue:1.0",
            "colorWithSRGBRed:1.0 green:0.18 blue:0.22",
            "borderWidth = 3.0",
            "cornerRadius = 7.0",
            "timerWithTimeInterval:0.05",
            "650 * NSEC_PER_MSEC",
        ] {
            assert!(source.contains(needle), "{needle}");
        }
    }
}
