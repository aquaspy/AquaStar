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

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct Generation(u64);

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
const STROKE: i32 = 3;
const RADIUS: f32 = 7.0;
const FLASH_MS: u64 = 650;
const TICK: Duration = Duration::from_millis(50);

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct Rect {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

impl Rect {
    fn is_empty(self) -> bool {
        self.width == 0 || self.height == 0
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Kind {
    Flash,
    Recording,
}

/// Where this process is allowed to draw. The env read lives in `current_host`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Host {
    Win32,
    X11,
    Hyprland,
    Other,
}

/// Who the border follows. `Window.id` is the `Target.id` capture already uses
/// (HWND bits or an X11 XID). `Hyprland` deliberately drops `Target.id`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Identity {
    Window { pid: Pid, id: NativeId },
    Hyprland { pid: Pid },
    Unsupported,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum HideReason {
    NotFrontmost,
    Missing,
    Unsupported,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Phase {
    Following(Rect),
    Hidden(HideReason),
}

struct Live {
    generation: Generation,
    identity: Identity,
    deadline_ms: Option<u64>,
    phase: Phase,
}

#[derive(Default)]
struct Board {
    flash: Option<Live>,
    recording: Option<Live>,
}

/// One observed top-level window. `id` is `None` for Hyprland, which has a pid
/// and a rectangle and no XID.
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

enum Visibility {
    Show(Rect),
    Hide(HideReason),
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

enum Command {
    Show {
        kind: Kind,
        generation: Generation,
        identity: Identity,
    },
    Hide {
        kind: Kind,
        generation: Generation,
    },
    Tick {
        observation: Observation,
    },
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

fn identity_from(host: Host, pid: u32, target_id: u32) -> Identity {
    match host {
        Host::Win32 | Host::X11 => Identity::Window {
            pid: Pid(pid),
            id: NativeId(target_id),
        },
        Host::Hyprland => Identity::Hyprland { pid: Pid(pid) },
        Host::Other => Identity::Unsupported,
    }
}

fn pid_of(identity: &Identity) -> Option<Pid> {
    match identity {
        Identity::Window { pid, .. } | Identity::Hyprland { pid } => Some(*pid),
        Identity::Unsupported => None,
    }
}

fn decide(identity: &Identity, observation: &Observation) -> Visibility {
    let Some(pid) = pid_of(identity) else {
        return Visibility::Hide(HideReason::Unsupported);
    };
    if observation.front_pid != Some(pid) {
        return Visibility::Hide(HideReason::NotFrontmost);
    }
    match candidate(identity, observation) {
        Some(rect) => Visibility::Show(rect),
        None => Visibility::Hide(HideReason::Missing),
    }
}

fn candidate(identity: &Identity, observation: &Observation) -> Option<Rect> {
    let mut found: Vec<Rect> = observation
        .windows
        .iter()
        .filter(|window| {
            window.mapped && !window.bounds.is_empty() && matches_identity(identity, window)
        })
        .map(|window| window.bounds)
        .collect();
    found.sort_by_key(|rect| (rect.width as u64).saturating_mul(rect.height as u64));
    found.pop()
}

fn matches_identity(identity: &Identity, window: &Seen) -> bool {
    match identity {
        Identity::Window { pid, id } => window.pid == *pid && window.id == Some(*id),
        Identity::Hyprland { pid } => window.pid == *pid,
        Identity::Unsupported => false,
    }
}

fn desired(board: &Board) -> Desired {
    Desired {
        recording: paint_of(board.recording.as_ref(), RECORD_COLOR),
        flash: paint_of(board.flash.as_ref(), FLASH_COLOR),
    }
}

fn paint_of(live: Option<&Live>, color: Srgb) -> Option<Paint> {
    match live.map(|live| &live.phase) {
        Some(Phase::Following(rect)) if !rect.is_empty() => Some(Paint { rect: *rect, color }),
        _ => None,
    }
}

fn reduce(board: &mut Board, now_ms: u64, command: Command) {
    match command {
        Command::Show {
            kind,
            generation,
            identity,
        } => {
            if matches!(identity, Identity::Unsupported) {
                return;
            }
            let deadline_ms = match kind {
                Kind::Flash => Some(now_ms.saturating_add(FLASH_MS)),
                Kind::Recording => None,
            };
            *slot_mut(board, kind) = Some(Live {
                generation,
                identity,
                deadline_ms,
                phase: Phase::Hidden(HideReason::Missing),
            });
        }
        Command::Hide { kind, generation } => {
            let slot = slot_mut(board, kind);
            if slot
                .as_ref()
                .is_some_and(|live| live.generation == generation)
            {
                *slot = None;
            }
        }
        Command::Tick { observation } => {
            for kind in [Kind::Flash, Kind::Recording] {
                let slot = slot_mut(board, kind);
                let expired = slot.as_ref().is_some_and(|live| {
                    live.deadline_ms.is_some_and(|deadline| now_ms >= deadline)
                });
                if expired {
                    *slot = None;
                    continue;
                }
                if let Some(live) = slot.as_mut() {
                    live.phase = match decide(&live.identity, &observation) {
                        Visibility::Show(rect) => Phase::Following(rect),
                        Visibility::Hide(reason) => Phase::Hidden(reason),
                    };
                }
            }
        }
    }
}

fn slot_mut(board: &mut Board, kind: Kind) -> &mut Option<Live> {
    match kind {
        Kind::Flash => &mut board.flash,
        Kind::Recording => &mut board.recording,
    }
}

fn plan(applied: &Applied, goal: &Desired) -> Vec<NativeOp> {
    let mut ops = Vec::new();
    push_slot(
        &mut ops,
        Kind::Recording,
        applied.recording.as_ref(),
        goal.recording.as_ref(),
    );
    push_slot(
        &mut ops,
        Kind::Flash,
        applied.flash.as_ref(),
        goal.flash.as_ref(),
    );
    ops
}

fn push_slot(ops: &mut Vec<NativeOp>, kind: Kind, applied: Option<&Paint>, goal: Option<&Paint>) {
    match (applied, goal) {
        (None, None) => {}
        (Some(_), None) => ops.push(NativeOp::Destroy { kind }),
        (None, Some(paint)) => ops.push(NativeOp::Create {
            kind,
            paint: *paint,
        }),
        (Some(current), Some(paint)) if same_paint(current, paint) => {}
        (Some(_), Some(paint)) => ops.push(NativeOp::Move {
            kind,
            paint: *paint,
        }),
    }
}

fn same_paint(left: &Paint, right: &Paint) -> bool {
    left.rect == right.rect && channels(left.color) == channels(right.color)
}

fn commit(applied: &mut Applied, op: &NativeOp) {
    match op {
        NativeOp::Create { kind, paint } | NativeOp::Move { kind, paint } => match kind {
            Kind::Flash => applied.flash = Some(*paint),
            Kind::Recording => applied.recording = Some(*paint),
        },
        NativeOp::Destroy { kind } => match kind {
            Kind::Flash => applied.flash = None,
            Kind::Recording => applied.recording = None,
        },
    }
}

struct SampleHint {
    windows: Vec<(Pid, NativeId)>,
    hyprland: Vec<Pid>,
}

fn sample_hint(board: &Board) -> SampleHint {
    let mut hint = SampleHint {
        windows: Vec::new(),
        hyprland: Vec::new(),
    };
    for live in board.flash.iter().chain(board.recording.iter()) {
        match live.identity {
            Identity::Window { pid, id } => hint.windows.push((pid, id)),
            Identity::Hyprland { pid } => hint.hyprland.push(pid),
            Identity::Unsupported => {}
        }
    }
    hint
}

fn channels(color: Srgb) -> (u8, u8, u8) {
    (channel(color.r), channel(color.g), channel(color.b))
}

fn channel(value: f32) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn premultiply(r: u8, g: u8, b: u8, a: u8) -> (u8, u8, u8, u8) {
    let scale = |c: u8| ((u16::from(c) * u16::from(a) + 127) / 255) as u8;
    (scale(r), scale(g), scale(b), a)
}

#[derive(Clone, Copy)]
enum ByteOrder {
    /// Little-endian ARGB word. Memory order is B, G, R, A.
    Lsb,
    /// Big-endian ARGB word. Memory order is A, R, G, B.
    Msb,
}

fn pack_pixel(r: u8, g: u8, b: u8, a: u8, order: ByteOrder) -> [u8; 4] {
    let (r, g, b, a) = premultiply(r, g, b, a);
    match order {
        ByteOrder::Lsb => [b, g, r, a],
        ByteOrder::Msb => [a, r, g, b],
    }
}

fn rounded_distance(x: f32, y: f32, width: f32, height: f32, radius: f32) -> f32 {
    let radius = if width <= 0.0 || height <= 0.0 {
        0.0
    } else {
        radius.clamp(0.0, width.min(height) / 2.0)
    };
    let qx = (x - width / 2.0).abs() - (width / 2.0 - radius);
    let qy = (y - height / 2.0).abs() - (height / 2.0 - radius);
    qx.max(0.0).hypot(qy.max(0.0)) + qx.max(qy).min(0.0) - radius
}

/// `px` and `py` are integer pixel coordinates in the same space as `Rect`.
/// Coverage uses the pixel center. The stroke is the outer rounded rect
/// minus the rect inset by `STROKE`.
fn covers(px: i32, py: i32, width: u32, height: u32) -> bool {
    let x = px as f32 + 0.5;
    let y = py as f32 + 0.5;
    let w = width as f32;
    let h = height as f32;
    if rounded_distance(x, y, w, h, RADIUS) > 0.0 {
        return false;
    }
    let inner_w = w - (STROKE as f32) * 2.0;
    let inner_h = h - (STROKE as f32) * 2.0;
    if inner_w <= 0.0 || inner_h <= 0.0 {
        return true;
    }
    let inner = rounded_distance(
        x - STROKE as f32,
        y - STROKE as f32,
        inner_w,
        inner_h,
        RADIUS - STROKE as f32,
    );
    inner > 0.0
}

#[derive(Clone, Copy)]
struct Output {
    id: i64,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

struct OutputPlace {
    output_id: i64,
    margin_left: i32,
    margin_top: i32,
    width: u32,
    height: u32,
}

/// Clip `window` onto one monitor and return layer-shell margins in that
/// monitor's local coordinates. Margins are never negative. `None` means
/// the border hides, because a layer surface cannot be placed safely.
fn output_place(window: Rect, monitor_id: Option<i64>, outputs: &[Output]) -> Option<OutputPlace> {
    if window.is_empty() {
        return None;
    }
    let named = monitor_id
        .and_then(|id| outputs.iter().find(|output| output.id == id))
        .filter(|output| intersects(window, output));
    let output = named.or_else(|| output_containing_center(window, outputs))?;
    let left = window.x.max(output.x);
    let top = window.y.max(output.y);
    let right = (window.x.saturating_add(window.width as i32))
        .min(output.x.saturating_add(output.width as i32));
    let bottom = (window.y.saturating_add(window.height as i32))
        .min(output.y.saturating_add(output.height as i32));
    if right <= left || bottom <= top {
        return None;
    }
    Some(OutputPlace {
        output_id: output.id,
        margin_left: left - output.x,
        margin_top: top - output.y,
        width: (right - left) as u32,
        height: (bottom - top) as u32,
    })
}

fn intersects(window: Rect, output: &Output) -> bool {
    let right = window.x.saturating_add(window.width as i32);
    let bottom = window.y.saturating_add(window.height as i32);
    let output_right = output.x.saturating_add(output.width as i32);
    let output_bottom = output.y.saturating_add(output.height as i32);
    window.x < output_right && right > output.x && window.y < output_bottom && bottom > output.y
}

fn output_containing_center(window: Rect, outputs: &[Output]) -> Option<&Output> {
    let cx = window.x.saturating_add((window.width / 2) as i32);
    let cy = window.y.saturating_add((window.height / 2) as i32);
    outputs.iter().find(|output| {
        cx >= output.x
            && cy >= output.y
            && cx < output.x.saturating_add(output.width as i32)
            && cy < output.y.saturating_add(output.height as i32)
    })
}

/// Hyprland `j/activewindow` JSON. Extra fields are ignored. Bad JSON is `None`.
#[derive(serde::Deserialize)]
struct ActiveWindowJson {
    pid: i64,
    at: [i32; 2],
    size: [i32; 2],
    monitor: i64,
    #[serde(default = "mapped_by_default")]
    mapped: bool,
    #[serde(default)]
    hidden: bool,
}

fn mapped_by_default() -> bool {
    true
}

#[derive(serde::Deserialize)]
struct MonitorJson {
    id: i64,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

struct ActiveWindow {
    pid: Pid,
    bounds: Rect,
    monitor_id: i64,
}

fn parse_active(json: &str) -> Option<ActiveWindow> {
    let parsed: ActiveWindowJson = serde_json::from_str(json).ok()?;
    if parsed.pid < 0
        || parsed.size[0] <= 0
        || parsed.size[1] <= 0
        || !parsed.mapped
        || parsed.hidden
    {
        return None;
    }
    Some(ActiveWindow {
        pid: Pid(parsed.pid as u32),
        bounds: Rect {
            x: parsed.at[0],
            y: parsed.at[1],
            width: parsed.size[0] as u32,
            height: parsed.size[1] as u32,
        },
        monitor_id: parsed.monitor,
    })
}

fn parse_monitors(json: &str) -> Vec<Output> {
    let parsed: Vec<MonitorJson> = match serde_json::from_str(json) {
        Ok(parsed) => parsed,
        Err(_) => return Vec::new(),
    };
    parsed
        .into_iter()
        .filter(|monitor| monitor.width > 0 && monitor.height > 0)
        .map(|monitor| Output {
            id: monitor.id,
            x: monitor.x,
            y: monitor.y,
            width: monitor.width as u32,
            height: monitor.height as u32,
        })
        .collect()
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
        return ["XDG_CURRENT_DESKTOP", "XDG_SESSION_DESKTOP"]
            .into_iter()
            .filter_map(|name| std::env::var(name).ok())
            .any(|value| desktop_identifies_hyprland(&value));
    }
    #[cfg(not(target_os = "linux"))]
    false
}

pub(super) fn flash(target: &super::super::backend::Target) {
    let host = current_host();
    if matches!(host, Host::Other) {
        return;
    }
    submit(Command::Show {
        kind: Kind::Flash,
        generation: next_generation(),
        identity: identity_from(host, target.pid, target.id),
    });
}

pub(super) fn show_recording(target: &super::super::backend::Target) -> u64 {
    let host = current_host();
    if matches!(host, Host::Other) {
        return 0;
    }
    let generation = next_generation();
    submit(Command::Show {
        kind: Kind::Recording,
        generation,
        identity: identity_from(host, target.pid, target.id),
    });
    generation.0
}

pub(super) fn hide_recording(generation: u64) {
    // A host that never showed a border has no actor. Drop must not be the
    // call that starts one.
    let Some(sender) = SENDER.get() else {
        return;
    };
    let _ = sender.send(Command::Hide {
        kind: Kind::Recording,
        generation: Generation(generation),
    });
}

fn next_generation() -> Generation {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    Generation(NEXT.fetch_add(1, Ordering::Relaxed))
}

fn current_host() -> Host {
    host_of(
        cfg!(windows),
        cfg!(target_os = "linux"),
        super::super::backend::is_wayland(),
        hyprland_session(),
    )
}

fn submit(command: Command) {
    let _ = sender().send(command);
}

static SENDER: OnceLock<Sender<Command>> = OnceLock::new();

fn sender() -> &'static Sender<Command> {
    SENDER.get_or_init(|| {
        let (tx, rx) = mpsc::channel();
        let _ = std::thread::Builder::new()
            .name("aquastar-border".into())
            .spawn(|| serve(rx));
        tx
    })
}

fn idle(board: &Board) -> bool {
    board.flash.is_none() && board.recording.is_none()
}

fn serve(rx: Receiver<Command>) {
    let mut board = Board::default();
    let mut drawer = draw::Drawer::open(current_host());
    let origin = Instant::now();
    loop {
        let incoming = if idle(&board) {
            match rx.recv() {
                Ok(command) => Some(command),
                Err(_) => break,
            }
        } else {
            match rx.recv_timeout(TICK) {
                Ok(command) => Some(command),
                Err(RecvTimeoutError::Timeout) => None,
                Err(RecvTimeoutError::Disconnected) => break,
            }
        };
        let mut batch = Vec::new();
        if let Some(command) = incoming {
            batch.push(command);
            while let Ok(command) = rx.try_recv() {
                batch.push(command);
            }
        }
        let now_ms = origin.elapsed().as_millis() as u64;
        for command in batch {
            reduce(&mut board, now_ms, command);
        }
        if !idle(&board) {
            let observation = drawer.sample(&sample_hint(&board));
            reduce(&mut board, now_ms, Command::Tick { observation });
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

    fn window_seen(pid: u32, id: u32, bounds: Rect, mapped: bool) -> Seen {
        Seen {
            pid: Pid(pid),
            id: Some(NativeId(id)),
            bounds,
            mapped,
        }
    }

    fn show(kind: Kind, generation: u64) -> Command {
        Command::Show {
            kind,
            generation: Generation(generation),
            identity: Identity::Window {
                pid: Pid(1),
                id: NativeId(2),
            },
        }
    }

    fn flash_paint(x: i32) -> Paint {
        Paint {
            rect: rect(x, 0, 10, 10),
            color: FLASH_COLOR,
        }
    }

    fn record_paint() -> Paint {
        Paint {
            rect: rect(0, 0, 12, 12),
            color: RECORD_COLOR,
        }
    }

    #[test]
    fn channels_match_the_srgb_bytes_the_panels_paint() {
        assert_eq!(channels(FLASH_COLOR), (26, 133, 255));
        assert_eq!(channels(RECORD_COLOR), (255, 46, 56));
        assert_eq!(premultiply(10, 20, 30, 255), (10, 20, 30, 255));
        assert_eq!(premultiply(10, 20, 30, 0), (0, 0, 0, 0));
        assert_eq!(
            pack_pixel(10, 20, 30, 255, ByteOrder::Lsb),
            [30, 20, 10, 255]
        );
        assert_eq!(
            pack_pixel(10, 20, 30, 255, ByteOrder::Msb),
            [255, 10, 20, 30]
        );
        assert_eq!(pack_pixel(10, 20, 30, 0, ByteOrder::Lsb), [0, 0, 0, 0]);
    }

    #[test]
    fn covers_keeps_the_stroke_inside_the_rounded_rect() {
        assert!(!covers(0, 0, 200, 200));
        assert!(covers(1, 100, 200, 200));
        assert!(!covers(4, 100, 200, 200));
        assert!(!covers(100, 100, 200, 200));
    }

    #[test]
    fn decide_hides_when_the_player_is_not_the_front_window() {
        let identity = Identity::Window {
            pid: Pid(4),
            id: NativeId(8),
        };
        let observation = Observation {
            front_pid: Some(Pid(9)),
            windows: vec![window_seen(4, 8, rect(0, 0, 100, 80), true)],
        };
        assert!(matches!(
            decide(&identity, &observation),
            Visibility::Hide(HideReason::NotFrontmost)
        ));
    }

    #[test]
    fn decide_shows_the_mapped_rect_of_the_front_player() {
        let identity = Identity::Window {
            pid: Pid(4),
            id: NativeId(8),
        };
        let observation = Observation {
            front_pid: Some(Pid(4)),
            windows: vec![window_seen(4, 8, rect(3, 4, 100, 80), true)],
        };
        assert!(matches!(
            decide(&identity, &observation),
            Visibility::Show(bounds) if bounds == rect(3, 4, 100, 80)
        ));
    }

    #[test]
    fn decide_hides_an_unmapped_or_empty_window() {
        let identity = Identity::Window {
            pid: Pid(4),
            id: NativeId(8),
        };
        let iconic = Observation {
            front_pid: Some(Pid(4)),
            windows: vec![window_seen(4, 8, rect(0, 0, 100, 80), false)],
        };
        let empty = Observation {
            front_pid: Some(Pid(4)),
            windows: vec![window_seen(4, 8, rect(0, 0, 0, 80), true)],
        };
        assert!(matches!(
            decide(&identity, &iconic),
            Visibility::Hide(HideReason::Missing)
        ));
        assert!(matches!(
            decide(&identity, &empty),
            Visibility::Hide(HideReason::Missing)
        ));
    }

    #[test]
    fn decide_hides_an_unsupported_identity() {
        let observation = Observation::default();
        assert!(matches!(
            decide(&Identity::Unsupported, &observation),
            Visibility::Hide(HideReason::Unsupported)
        ));
    }

    #[test]
    fn decide_picks_the_larger_hyprland_window_of_one_pid() {
        let identity = Identity::Hyprland { pid: Pid(5) };
        let observation = Observation {
            front_pid: Some(Pid(5)),
            windows: vec![
                Seen {
                    pid: Pid(5),
                    id: None,
                    bounds: rect(0, 0, 10, 10),
                    mapped: true,
                },
                Seen {
                    pid: Pid(5),
                    id: None,
                    bounds: rect(1, 2, 50, 40),
                    mapped: true,
                },
            ],
        };
        assert!(matches!(
            decide(&identity, &observation),
            Visibility::Show(bounds) if bounds == rect(1, 2, 50, 40)
        ));
    }

    #[test]
    fn host_of_keeps_an_x11_session_even_when_hyprland_is_named() {
        assert_eq!(host_of(false, true, false, true), Host::X11);
        assert_eq!(host_of(false, true, true, true), Host::Hyprland);
        assert_eq!(host_of(false, true, true, false), Host::Other);
    }

    #[test]
    fn hyprland_identity_keeps_the_pid_and_drops_the_target_id() {
        match identity_from(Host::Hyprland, 9, 9) {
            Identity::Hyprland { pid } => assert_eq!(pid, Pid(9)),
            other => panic!("expected a hyprland identity, got {other:?}"),
        }
    }

    #[test]
    fn desktop_token_identifies_hyprland_without_a_substring_match() {
        assert!(desktop_identifies_hyprland("omarchy:Hyprland"));
        assert!(!desktop_identifies_hyprland("GNOME"));
        assert!(!desktop_identifies_hyprland("NotHyprland"));
    }

    #[test]
    fn reduce_keeps_a_newer_recording_when_an_older_hide_arrives() {
        let mut board = Board::default();
        reduce(&mut board, 0, show(Kind::Recording, 1));
        reduce(&mut board, 0, show(Kind::Recording, 2));
        reduce(
            &mut board,
            0,
            Command::Hide {
                kind: Kind::Recording,
                generation: Generation(1),
            },
        );
        assert_eq!(board.recording.as_ref().unwrap().generation, Generation(2));
        reduce(
            &mut board,
            0,
            Command::Hide {
                kind: Kind::Recording,
                generation: Generation(2),
            },
        );
        assert!(board.recording.is_none());
        reduce(
            &mut board,
            0,
            Command::Hide {
                kind: Kind::Recording,
                generation: Generation(2),
            },
        );
        assert!(board.recording.is_none());
    }

    #[test]
    fn reduce_flash_does_not_replace_the_recording_generation() {
        let mut board = Board::default();
        reduce(&mut board, 0, show(Kind::Recording, 3));
        reduce(&mut board, 0, show(Kind::Flash, 4));
        assert_eq!(board.recording.as_ref().unwrap().generation, Generation(3));
        assert_eq!(board.flash.as_ref().unwrap().generation, Generation(4));
    }

    #[test]
    fn reduce_clears_a_flash_at_its_deadline_and_leaves_the_recording() {
        let mut board = Board::default();
        reduce(&mut board, 0, show(Kind::Recording, 3));
        reduce(&mut board, 1_000, show(Kind::Flash, 5));
        let observation = Observation {
            front_pid: Some(Pid(1)),
            windows: vec![window_seen(1, 2, rect(0, 0, 20, 20), true)],
        };
        reduce(
            &mut board,
            1_649,
            Command::Tick {
                observation: observation.clone(),
            },
        );
        assert!(board.flash.is_some());
        reduce(&mut board, 1_650, Command::Tick { observation });
        assert!(board.flash.is_none());
        assert_eq!(board.recording.as_ref().unwrap().generation, Generation(3));
    }

    #[test]
    fn reduce_ignores_an_unsupported_show() {
        let mut board = Board::default();
        for kind in [Kind::Flash, Kind::Recording] {
            reduce(
                &mut board,
                0,
                Command::Show {
                    kind,
                    generation: Generation(1),
                    identity: Identity::Unsupported,
                },
            );
        }
        assert!(board.flash.is_none());
        assert!(board.recording.is_none());
    }

    #[test]
    fn plan_creates_a_flash_once_and_moves_or_destroys_it_later() {
        let paint = flash_paint(0);
        let goal = Desired {
            recording: None,
            flash: Some(paint),
        };
        let created = plan(&Applied::default(), &goal);
        assert!(matches!(
            created.as_slice(),
            [NativeOp::Create {
                kind: Kind::Flash,
                ..
            }]
        ));
        let mut applied = Applied::default();
        commit(&mut applied, &created[0]);
        assert!(plan(&applied, &goal).is_empty());

        let moved = Desired {
            recording: None,
            flash: Some(flash_paint(4)),
        };
        let ops = plan(&applied, &moved);
        assert!(matches!(
            ops.as_slice(),
            [NativeOp::Move {
                kind: Kind::Flash,
                ..
            }]
        ));

        let cleared = plan(&applied, &Desired::default());
        assert!(matches!(
            cleared.as_slice(),
            [NativeOp::Destroy { kind: Kind::Flash }]
        ));
    }

    #[test]
    fn plan_creates_the_recording_before_the_flash() {
        let goal = Desired {
            recording: Some(record_paint()),
            flash: Some(flash_paint(0)),
        };
        let ops = plan(&Applied::default(), &goal);
        assert!(matches!(
            ops.as_slice(),
            [
                NativeOp::Create {
                    kind: Kind::Recording,
                    ..
                },
                NativeOp::Create {
                    kind: Kind::Flash,
                    ..
                }
            ]
        ));

        let applied = Applied {
            recording: None,
            flash: Some(flash_paint(0)),
        };
        let ops = plan(&applied, &goal);
        assert!(matches!(
            ops.as_slice(),
            [NativeOp::Create {
                kind: Kind::Recording,
                ..
            }]
        ));
    }

    #[test]
    fn output_place_uses_monitor_local_margins_and_never_goes_negative() {
        let window = rect(100, 200, 800, 600);
        let origin = [Output {
            id: 1,
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        }];
        let placed = output_place(window, Some(1), &origin).unwrap();
        assert_eq!(placed.margin_left, 100);
        assert_eq!(placed.margin_top, 200);
        assert_eq!((placed.width, placed.height), (800, 600));

        let elsewhere = [Output {
            id: 2,
            x: 1920,
            y: 0,
            width: 1920,
            height: 1080,
        }];
        assert!(output_place(window, Some(2), &elsewhere).is_none());

        let clipped = output_place(
            rect(1900, 10, 200, 100),
            Some(3),
            &[Output {
                id: 3,
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080,
            }],
        )
        .unwrap();
        assert_eq!(clipped.margin_left, 0);
        assert_eq!(clipped.margin_top, 10);
        assert_eq!((clipped.width, clipped.height), (180, 100));
    }

    #[test]
    fn output_place_uses_the_output_that_contains_the_center() {
        let window = rect(100, 100, 40, 40);
        let outputs = [
            Output {
                id: 9,
                x: 5000,
                y: 5000,
                width: 100,
                height: 100,
            },
            Output {
                id: 1,
                x: 0,
                y: 0,
                width: 200,
                height: 200,
            },
        ];
        let placed = output_place(window, Some(9), &outputs).unwrap();
        assert_eq!(placed.output_id, 1);
        assert!(output_place(rect(0, 0, 10, 10), None, &outputs[..1]).is_none());
    }

    #[test]
    fn parse_active_reads_a_mapped_window_and_rejects_a_partial_payload() {
        let parsed =
            parse_active(r#"{"pid":42,"at":[10,20],"size":[30,40],"monitor":7,"mapped":true}"#)
                .unwrap();
        assert_eq!(parsed.pid, Pid(42));
        assert_eq!(parsed.bounds, rect(10, 20, 30, 40));
        assert_eq!(parsed.monitor_id, 7);
        assert!(parse_active(r#"{"pid":1}"#).is_none());
        assert!(parse_monitors("nope").is_empty());
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
