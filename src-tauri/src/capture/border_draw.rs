use super::{
    Applied, Desired, Host, Kind, NativeId, NativeOp, Observation, Paint, Pid, Rect, SampleHint,
    Seen, Srgb,
};

pub(super) struct Drawer {
    shell: Shell,
    applied: Applied,
}

enum Shell {
    Silent,
    #[cfg(windows)]
    Win32(win32::Win32State),
    #[cfg(target_os = "linux")]
    X11(x11::X11State),
    #[cfg(target_os = "linux")]
    Hyprland(hypr::HyprState),
}

impl Drawer {
    pub(super) fn open(host: Host) -> Self {
        let shell = match host {
            #[cfg(windows)]
            Host::Win32 => win32::Win32State::open()
                .map(Shell::Win32)
                .unwrap_or(Shell::Silent),
            #[cfg(target_os = "linux")]
            Host::X11 => x11::X11State::open()
                .map(Shell::X11)
                .unwrap_or(Shell::Silent),
            #[cfg(target_os = "linux")]
            Host::Hyprland => Shell::Hyprland(hypr::HyprState::new()),
            _ => Shell::Silent,
        };
        Self {
            shell,
            applied: Applied::default(),
        }
    }

    pub(super) fn sample(&mut self, hint: &SampleHint) -> Observation {
        match &mut self.shell {
            Shell::Silent => Observation::default(),
            #[cfg(windows)]
            Shell::Win32(state) => state.sample(hint),
            #[cfg(target_os = "linux")]
            Shell::X11(state) => state.sample(hint),
            #[cfg(target_os = "linux")]
            Shell::Hyprland(state) => state.sample(hint),
        }
    }

    pub(super) fn sync(&mut self, goal: &Desired) {
        for op in plan(&self.applied, goal) {
            if !self.perform(&op) {
                break;
            }
            commit(&mut self.applied, &op);
        }
        #[cfg(target_os = "linux")]
        if let Shell::X11(state) = &mut self.shell {
            state.restack();
        }
        #[cfg(target_os = "linux")]
        if let Shell::Hyprland(state) = &mut self.shell {
            state.repair(goal);
        }
        #[cfg(windows)]
        if let Shell::Win32(state) = &self.shell {
            state.raise_flash();
        }
    }

    fn perform(&mut self, op: &NativeOp) -> bool {
        match &mut self.shell {
            Shell::Silent => false,
            #[cfg(windows)]
            Shell::Win32(state) => state.perform(op),
            #[cfg(target_os = "linux")]
            Shell::X11(state) => state.perform(op),
            #[cfg(target_os = "linux")]
            Shell::Hyprland(state) => state.perform(op),
        }
    }
}

fn stroke_bytes(
    width: u32,
    height: u32,
    scale: u32,
    color: Srgb,
    order: ByteOrder,
) -> Option<Vec<u8>> {
    let scale = scale.max(1);
    let buf_w = u64::from(width).checked_mul(u64::from(scale))?;
    let buf_h = u64::from(height).checked_mul(u64::from(scale))?;
    let bytes = buf_w.checked_mul(buf_h)?.checked_mul(4)?;
    if bytes > 64 * 1024 * 1024 || buf_w > i32::MAX as u64 || buf_h > i32::MAX as u64 {
        return None;
    }
    let buf_w = buf_w as usize;
    let buf_h = buf_h as usize;
    let step = scale as usize;
    let (red, green, blue) = channels(color);
    let mut data = vec![0u8; bytes as usize];
    for y in 0..buf_h {
        for x in 0..buf_w {
            if covers((x / step) as i32, (y / step) as i32, width, height) {
                let pixel = pack_pixel(red, green, blue, 255, order);
                let index = (y * buf_w + x) * 4;
                data[index..index + 4].copy_from_slice(&pixel);
            }
        }
    }
    Some(data)
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

const STROKE: i32 = 3;
const RADIUS: f32 = 7.0;

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
    if window.width == 0 || window.height == 0 {
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

#[cfg(target_os = "linux")]
mod x11 {
    use super::{
        stroke_bytes, ByteOrder, Kind, NativeId, NativeOp, Observation, Paint, Pid, Rect,
        SampleHint, Seen,
    };
    use x11rb::connection::{Connection, RequestConnection};
    use x11rb::protocol::shape::{ConnectionExt as _, SK, SO};
    use x11rb::protocol::xproto::{
        ClipOrdering, ColormapAlloc, ConfigureWindowAux, ConnectionExt as _, CreateGCAux,
        CreateWindowAux, EventMask, ImageFormat, ImageOrder, MapState, PropMode, StackMode,
        VisualClass, WindowClass,
    };
    use x11rb::rust_connection::RustConnection;

    const BORDER_NAME: &[u8] = b"aquastar-neo-border";

    struct Atoms {
        net_wm_name: u32,
        utf8_string: u32,
        net_wm_pid: u32,
        net_active_window: u32,
    }

    struct XWindow {
        id: u32,
        gc: u32,
    }

    pub(super) struct X11State {
        connection: RustConnection,
        root: u32,
        depth: u8,
        visual: u32,
        colormap: u32,
        order: ByteOrder,
        atoms: Atoms,
        recording: Option<XWindow>,
        flash: Option<XWindow>,
        players: Vec<u32>,
    }

    impl X11State {
        pub(super) fn open() -> Option<Self> {
            let (connection, screen_num) = x11rb::connect(None).ok()?;
            let (root, visual, order) = {
                let setup = connection.setup();
                let screen = setup.roots.get(screen_num)?;
                let visual = argb_visual(screen)?;
                let order = if setup.image_byte_order == ImageOrder::LSB_FIRST {
                    ByteOrder::Lsb
                } else {
                    ByteOrder::Msb
                };
                (screen.root, visual, order)
            };
            if connection
                .extension_information(x11rb::protocol::shape::X11_EXTENSION_NAME)
                .ok()?
                .is_none()
            {
                return None;
            }
            let colormap = connection.generate_id().ok()?;
            connection
                .create_colormap(ColormapAlloc::NONE, colormap, root, visual)
                .ok()?
                .check()
                .ok()?;
            let atoms = Atoms {
                net_wm_name: intern(&connection, b"_NET_WM_NAME")?,
                utf8_string: intern(&connection, b"UTF8_STRING")?,
                net_wm_pid: intern(&connection, b"_NET_WM_PID")?,
                net_active_window: intern(&connection, b"_NET_ACTIVE_WINDOW")?,
            };
            Some(Self {
                connection,
                root,
                depth: 32,
                visual,
                colormap,
                order,
                atoms,
                recording: None,
                flash: None,
                players: Vec::new(),
            })
        }

        pub(super) fn sample(&mut self, hint: &SampleHint) -> Observation {
            self.players = hint.windows.iter().map(|(_, id)| id.0).collect();
            let mut windows = Vec::new();
            for (pid, id) in &hint.windows {
                if let Some(seen) = self.observe(*pid, *id) {
                    windows.push(seen);
                }
            }
            Observation {
                front_pid: self.front_pid(),
                windows,
            }
        }

        pub(super) fn perform(&mut self, op: &NativeOp) -> bool {
            match *op {
                NativeOp::Create { kind, paint } | NativeOp::Move { kind, paint } => {
                    if self.slot(kind).is_none() {
                        match self.create(&paint) {
                            Some(window) => {
                                *self.slot_mut(kind) = Some(window);
                                true
                            }
                            None => false,
                        }
                    } else {
                        let Some(window_id) = self.slot(kind).map(|window| window.id) else {
                            return false;
                        };
                        let Some(gc) = self.slot(kind).map(|window| window.gc) else {
                            return false;
                        };
                        self.retarget(window_id, gc, &paint)
                    }
                }
                NativeOp::Destroy { kind } => self.destroy(kind),
            }
        }

        pub(super) fn restack(&mut self) {
            let recording = self.recording.as_ref().map(|window| window.id);
            let flash = self.flash.as_ref().map(|window| window.id);
            for player in &self.players {
                if *player == 0 {
                    continue;
                }
                for window in [recording, flash].into_iter().flatten() {
                    void_ok(
                        self.connection.configure_window(
                            window,
                            &ConfigureWindowAux::new()
                                .sibling(*player)
                                .stack_mode(StackMode::ABOVE),
                        ),
                    );
                }
            }
            if let (Some(flash), Some(recording)) = (flash, recording) {
                void_ok(
                    self.connection.configure_window(
                        flash,
                        &ConfigureWindowAux::new()
                            .sibling(recording)
                            .stack_mode(StackMode::ABOVE),
                    ),
                );
            }
            let _ = self.connection.flush();
        }

        fn create(&mut self, paint: &Paint) -> Option<XWindow> {
            let width = u16::try_from(paint.rect.width).ok()?;
            let height = u16::try_from(paint.rect.height).ok()?;
            if width == 0 || height == 0 || height > i16::MAX as u16 {
                return None;
            }
            let id = self.connection.generate_id().ok()?;
            let values = CreateWindowAux::new()
                .background_pixel(0)
                .border_pixel(0)
                .colormap(self.colormap)
                .override_redirect(1u32)
                .event_mask(EventMask::NO_EVENT);
            // composite_name_window_pixmap of the player misses this sibling.
            // xcap's capture_image fallback can still include it, and there is
            // no second pixmap once Composite has failed.
            self.connection
                .create_window(
                    self.depth,
                    id,
                    self.root,
                    0,
                    0,
                    width,
                    height,
                    0,
                    WindowClass::INPUT_OUTPUT,
                    self.visual,
                    &values,
                )
                .ok()?
                .check()
                .ok()?;
            let mut guard = WindowGuard {
                connection: &self.connection,
                id,
                gc: None,
                armed: true,
            };
            self.connection
                .change_property(
                    PropMode::REPLACE,
                    id,
                    self.atoms.net_wm_name,
                    self.atoms.utf8_string,
                    8,
                    BORDER_NAME.len() as u32,
                    BORDER_NAME,
                )
                .ok()?
                .check()
                .ok()?;
            let none: &[x11rb::protocol::xproto::Rectangle] = &[];
            self.connection
                .shape_rectangles(SO::SET, SK::INPUT, ClipOrdering::UNSORTED, id, 0, 0, none)
                .ok()?
                .check()
                .ok()?;
            let gc = self.connection.generate_id().ok()?;
            self.connection
                .create_gc(gc, id, &CreateGCAux::new())
                .ok()?
                .check()
                .ok()?;
            guard.gc = Some(gc);
            let pixels = stroke_bytes(
                paint.rect.width,
                paint.rect.height,
                1,
                paint.color,
                self.order,
            )?;
            if !put_image(&self.connection, id, gc, width, height, self.depth, &pixels) {
                return None;
            }
            self.connection
                .configure_window(
                    id,
                    &ConfigureWindowAux::new()
                        .x(paint.rect.x)
                        .y(paint.rect.y)
                        .width(u32::from(width))
                        .height(u32::from(height)),
                )
                .ok()?
                .check()
                .ok()?;
            self.connection.map_window(id).ok()?.check().ok()?;
            self.connection.flush().ok()?;
            guard.armed = false;
            Some(XWindow { id, gc })
        }

        fn retarget(&mut self, id: u32, gc: u32, paint: &Paint) -> bool {
            let Ok(width) = u16::try_from(paint.rect.width) else {
                return false;
            };
            let Ok(height) = u16::try_from(paint.rect.height) else {
                return false;
            };
            if width == 0 || height == 0 || height > i16::MAX as u16 {
                return false;
            }
            if !void_ok(
                self.connection.configure_window(
                    id,
                    &ConfigureWindowAux::new()
                        .x(paint.rect.x)
                        .y(paint.rect.y)
                        .width(u32::from(width))
                        .height(u32::from(height)),
                ),
            ) {
                return false;
            }
            let Some(pixels) = stroke_bytes(
                paint.rect.width,
                paint.rect.height,
                1,
                paint.color,
                self.order,
            ) else {
                return false;
            };
            put_image(&self.connection, id, gc, width, height, self.depth, &pixels)
                && self.connection.flush().is_ok()
        }

        fn destroy(&mut self, kind: Kind) -> bool {
            let Some(window) = self.slot_mut(kind).take() else {
                return true;
            };
            let gc = void_ok(self.connection.free_gc(window.gc));
            let destroyed = void_ok(self.connection.destroy_window(window.id));
            let flushed = self.connection.flush().is_ok();
            if gc && destroyed && flushed {
                true
            } else {
                *self.slot_mut(kind) = Some(window);
                false
            }
        }

        fn observe(&self, pid: Pid, id: NativeId) -> Option<Seen> {
            let geometry = self.connection.get_geometry(id.0).ok()?.reply().ok()?;
            let translated = self
                .connection
                .translate_coordinates(id.0, self.root, 0, 0)
                .ok()?
                .reply()
                .ok()?;
            let attributes = self
                .connection
                .get_window_attributes(id.0)
                .ok()?
                .reply()
                .ok()?;
            Some(Seen {
                pid,
                id: Some(id),
                bounds: Rect {
                    x: i32::from(translated.dst_x),
                    y: i32::from(translated.dst_y),
                    width: u32::from(geometry.width),
                    height: u32::from(geometry.height),
                },
                mapped: attributes.map_state == MapState::VIEWABLE,
            })
        }

        fn front_pid(&self) -> Option<Pid> {
            let active = property_u32(&self.connection, self.root, self.atoms.net_active_window)?;
            if active == 0 {
                return None;
            }
            Some(Pid(property_u32(
                &self.connection,
                active,
                self.atoms.net_wm_pid,
            )?))
        }

        fn slot(&self, kind: Kind) -> Option<&XWindow> {
            match kind {
                Kind::Flash => self.flash.as_ref(),
                Kind::Recording => self.recording.as_ref(),
            }
        }

        fn slot_mut(&mut self, kind: Kind) -> &mut Option<XWindow> {
            match kind {
                Kind::Flash => &mut self.flash,
                Kind::Recording => &mut self.recording,
            }
        }
    }

    impl Drop for X11State {
        fn drop(&mut self) {
            for window in [self.flash.take(), self.recording.take()]
                .into_iter()
                .flatten()
            {
                let _ = self.connection.free_gc(window.gc);
                let _ = self.connection.destroy_window(window.id);
            }
            let _ = self.connection.free_colormap(self.colormap);
            let _ = self.connection.flush();
        }
    }

    struct WindowGuard<'a> {
        connection: &'a RustConnection,
        id: u32,
        gc: Option<u32>,
        armed: bool,
    }

    impl Drop for WindowGuard<'_> {
        fn drop(&mut self) {
            if !self.armed {
                return;
            }
            if let Some(gc) = self.gc {
                let _ = self.connection.free_gc(gc);
            }
            let _ = self.connection.destroy_window(self.id);
            let _ = self.connection.flush();
        }
    }

    fn argb_visual(screen: &x11rb::protocol::xproto::Screen) -> Option<u32> {
        let mut fallback = None;
        for depth in &screen.allowed_depths {
            if depth.depth != 32 {
                continue;
            }
            for visual in &depth.visuals {
                if visual.class != VisualClass::TRUE_COLOR {
                    continue;
                }
                if fallback.is_none() {
                    fallback = Some(visual.visual_id);
                }
                if visual.red_mask == 0x00ff_0000
                    && visual.green_mask == 0x0000_ff00
                    && visual.blue_mask == 0x0000_00ff
                {
                    return Some(visual.visual_id);
                }
            }
        }
        fallback
    }

    fn intern(connection: &RustConnection, name: &[u8]) -> Option<u32> {
        Some(connection.intern_atom(false, name).ok()?.reply().ok()?.atom)
    }

    fn property_u32(connection: &RustConnection, window: u32, atom: u32) -> Option<u32> {
        let reply = connection
            .get_property(false, window, atom, 0u32, 0, 1)
            .ok()?
            .reply()
            .ok()?;
        let mut values = reply.value32()?;
        values.next()
    }

    fn void_ok(
        result: Result<
            x11rb::cookie::VoidCookie<'_, RustConnection>,
            x11rb::errors::ConnectionError,
        >,
    ) -> bool {
        match result {
            Ok(cookie) => cookie.check().is_ok(),
            Err(_) => false,
        }
    }

    fn put_image(
        connection: &RustConnection,
        window: u32,
        gc: u32,
        width: u16,
        height: u16,
        depth: u8,
        data: &[u8],
    ) -> bool {
        let stride = width as usize * 4;
        if stride == 0 || data.len() < stride * height as usize {
            return false;
        }
        let max_rows = connection.maximum_request_bytes().saturating_sub(64) / stride;
        let max_rows = max_rows.max(1).min(height as usize);
        let mut y = 0usize;
        while y < height as usize {
            let rows = max_rows.min(height as usize - y);
            let start = y * stride;
            let end = start + rows * stride;
            if !void_ok(connection.put_image(
                ImageFormat::Z_PIXMAP,
                window,
                gc,
                width,
                rows as u16,
                0,
                y as i16,
                0,
                depth,
                &data[start..end],
            )) {
                return false;
            }
            y += rows;
        }
        true
    }
}

#[cfg(target_os = "linux")]
mod hypr {
    use super::{
        stroke_bytes, ByteOrder, Desired, Kind, NativeOp, Observation, Output, OutputPlace, Paint,
        Seen, Srgb,
    };
    use std::io::{Read, Write};
    use std::os::unix::io::{AsFd, FromRawFd};
    use std::os::unix::net::UnixStream;
    use std::path::PathBuf;
    use wayland_client::protocol::{
        wl_buffer, wl_compositor, wl_output, wl_region, wl_registry, wl_shm, wl_shm_pool,
        wl_surface,
    };
    use wayland_client::{
        delegate_noop, Connection, Dispatch, EventQueue, Proxy, QueueHandle, WEnum,
    };
    use wayland_protocols_wlr::layer_shell::v1::client::{
        zwlr_layer_shell_v1::{Layer, ZwlrLayerShellV1},
        zwlr_layer_surface_v1::{self, Anchor, KeyboardInteractivity, ZwlrLayerSurfaceV1},
    };

    pub(super) struct HyprState {
        session: Option<Session>,
        layer_absent: bool,
        failed: bool,
        monitors: Vec<Output>,
        monitor_id: Option<i64>,
    }

    struct Session {
        queue: EventQueue<WlState>,
        state: WlState,
        dead: bool,
    }

    struct WlState {
        compositor: Option<wl_compositor::WlCompositor>,
        shm: Option<wl_shm::WlShm>,
        layer_shell: Option<ZwlrLayerShellV1>,
        outputs: Vec<TrackedOutput>,
        recording: Option<LayerSlot>,
        flash: Option<LayerSlot>,
        retired: Vec<RetiredBuffer>,
        next_token: u64,
    }

    struct TrackedOutput {
        registry_name: u32,
        output: wl_output::WlOutput,
        x: i32,
        y: i32,
        pixel_w: i32,
        pixel_h: i32,
        scale: i32,
        has_mode: bool,
    }

    struct LayerSlot {
        surface: wl_surface::WlSurface,
        layer: ZwlrLayerSurfaceV1,
        buffer: Option<ShmBuffer>,
        output_name: u32,
        serial: Option<u32>,
        closed: bool,
    }

    struct ShmBuffer {
        token: u64,
        buffer: wl_buffer::WlBuffer,
        pool: wl_shm_pool::WlShmPool,
        released: bool,
    }

    struct RetiredBuffer {
        token: u64,
        buffer: wl_buffer::WlBuffer,
        pool: wl_shm_pool::WlShmPool,
    }

    impl HyprState {
        pub(super) fn new() -> Self {
            Self {
                session: None,
                layer_absent: false,
                failed: false,
                monitors: Vec::new(),
                monitor_id: None,
            }
        }

        pub(super) fn sample(&mut self, _hint: &super::SampleHint) -> Observation {
            let active = hypr_command("j/activewindow")
                .as_deref()
                .and_then(super::parse_active);
            self.monitors = hypr_command("j/monitors")
                .as_deref()
                .map(super::parse_monitors)
                .unwrap_or_default();
            self.monitor_id = active.as_ref().map(|window| window.monitor_id);
            let _ = self.ensure();
            match active {
                Some(window) => Observation {
                    front_pid: Some(window.pid),
                    windows: vec![Seen {
                        pid: window.pid,
                        id: None,
                        bounds: window.bounds,
                        mapped: true,
                    }],
                },
                None => Observation::default(),
            }
        }

        pub(super) fn perform(&mut self, op: &NativeOp) -> bool {
            if self.layer_absent || self.failed || !self.ensure() {
                return false;
            }
            let ok = match *op {
                NativeOp::Destroy { kind } => {
                    self.destroy_kind(kind);
                    true
                }
                NativeOp::Create { kind, paint } | NativeOp::Move { kind, paint } => {
                    self.show(kind, &paint)
                }
            };
            if self.session.as_ref().is_some_and(|session| session.dead) {
                self.failed = true;
                self.session = None;
                return false;
            }
            ok
        }

        fn ensure(&mut self) -> bool {
            if self.layer_absent || self.failed {
                return false;
            }
            if self.session.is_some() {
                return true;
            }
            let Some(session) = connect_session() else {
                return false;
            };
            if session.state.layer_shell.is_none() {
                self.layer_absent = true;
                return false;
            }
            self.session = Some(session);
            true
        }

        pub(super) fn repair(&mut self, goal: &Desired) {
            if self.layer_absent || self.failed || !self.ensure() {
                return;
            }
            if goal.recording.is_some() && self.needs_surface(Kind::Recording) {
                if let Some(paint) = goal.recording {
                    let _ = self.show(Kind::Recording, &paint);
                }
            }
            if self.needs_surface(Kind::Flash) {
                if let Some(paint) = goal.flash {
                    let _ = self.show(Kind::Flash, &paint);
                }
            }
            if self.session.as_ref().is_some_and(|session| session.dead) {
                self.failed = true;
                self.session = None;
            }
        }

        fn needs_surface(&self, kind: Kind) -> bool {
            self.session
                .as_ref()
                .is_none_or(|session| slot(&session.state, kind).is_none_or(|layer| layer.closed))
        }

        fn show(&mut self, kind: Kind, paint: &Paint) -> bool {
            let Some(session) = self.session.as_mut() else {
                return false;
            };
            let monitors = layout_monitors(&session.state, &self.monitors);
            let Some(place) = super::output_place(paint.rect, self.monitor_id, &monitors) else {
                destroy_slot(&mut session.state, kind);
                return false;
            };
            let Some(wanted) = monitors
                .into_iter()
                .find(|output| output.id == place.output_id)
            else {
                destroy_slot(&mut session.state, kind);
                return false;
            };
            let Some((output_proxy, output_name, scale)) = tracked_output(&session.state, &wanted)
            else {
                return false;
            };
            let recreate = match slot(&session.state, kind) {
                Some(existing) => existing.closed || existing.output_name != output_name,
                None => true,
            };
            if recreate {
                destroy_slot(&mut session.state, kind);
                create_slot(
                    session,
                    kind,
                    &place,
                    paint.color,
                    output_proxy,
                    output_name,
                    scale,
                )
            } else {
                update_slot(session, kind, &place, paint.color, scale)
            }
        }

        fn destroy_kind(&mut self, kind: Kind) {
            if let Some(session) = self.session.as_mut() {
                destroy_slot(&mut session.state, kind);
            }
        }
    }

    impl Drop for HyprState {
        fn drop(&mut self) {
            if let Some(session) = self.session.as_mut() {
                destroy_slot(&mut session.state, Kind::Flash);
                destroy_slot(&mut session.state, Kind::Recording);
                for retired in session.state.retired.drain(..) {
                    retired.buffer.destroy();
                    retired.pool.destroy();
                }
            }
        }
    }

    fn connect_session() -> Option<Session> {
        let stream = UnixStream::connect(wayland_path()?).ok()?;
        let connection = Connection::from_socket(stream).ok()?;
        let mut queue = connection.new_event_queue();
        let handle = queue.handle();
        let _registry = connection.display().get_registry(&handle, ());
        let mut state = WlState::new();
        queue.roundtrip(&mut state).ok()?;
        queue.roundtrip(&mut state).ok()?;
        Some(Session {
            queue,
            state,
            dead: false,
        })
    }

    fn wayland_path() -> Option<PathBuf> {
        let display = PathBuf::from(std::env::var_os("WAYLAND_DISPLAY")?);
        if display.is_absolute() {
            Some(display)
        } else {
            let mut path = PathBuf::from(std::env::var_os("XDG_RUNTIME_DIR")?);
            path.push(display);
            Some(path)
        }
    }

    fn hypr_command(command: &str) -> Option<String> {
        let signature = std::env::var_os("HYPRLAND_INSTANCE_SIGNATURE")?;
        if signature.is_empty() {
            return None;
        }
        let mut path = PathBuf::from(std::env::var_os("XDG_RUNTIME_DIR")?);
        path.push("hypr");
        path.push(signature);
        path.push(".socket.sock");
        let mut stream = UnixStream::connect(path).ok()?;
        stream.write_all(format!("{command}\n").as_bytes()).ok()?;
        stream.shutdown(std::net::Shutdown::Write).ok()?;
        let mut body = String::new();
        stream.read_to_string(&mut body).ok()?;
        Some(body)
    }

    fn layout_monitors(state: &WlState, monitors: &[Output]) -> Vec<Output> {
        monitors
            .iter()
            .copied()
            .map(|mut monitor| {
                // Current hyprctl writes m_pixelSize into width, while window at/size
                // and this monitor's x/y are layout pixels. Older replies used the layout size.
                let Some(output) = state.outputs.iter().find(|output| {
                    same_origin(output, &monitor)
                        && pixel_size(output, &monitor)
                        && !logical_size(output, &monitor)
                }) else {
                    return monitor;
                };
                let scale = output.scale.max(1);
                monitor.width = (output.pixel_w / scale) as u32;
                monitor.height = (output.pixel_h / scale) as u32;
                monitor
            })
            .collect()
    }

    fn tracked_output(state: &WlState, wanted: &Output) -> Option<(wl_output::WlOutput, u32, i32)> {
        let tracked = state
            .outputs
            .iter()
            .find(|output| same_origin(output, wanted) && logical_size(output, wanted))
            .or_else(|| {
                state
                    .outputs
                    .iter()
                    .find(|output| same_origin(output, wanted) && pixel_size(output, wanted))
            })?;
        Some((
            tracked.output.clone(),
            tracked.registry_name,
            tracked.scale.max(1),
        ))
    }

    fn same_origin(output: &TrackedOutput, wanted: &Output) -> bool {
        output.has_mode && output.x == wanted.x && output.y == wanted.y
    }

    fn logical_size(output: &TrackedOutput, wanted: &Output) -> bool {
        let scale = output.scale.max(1);
        output.pixel_w / scale == wanted.width as i32
            && output.pixel_h / scale == wanted.height as i32
    }

    fn pixel_size(output: &TrackedOutput, wanted: &Output) -> bool {
        output.pixel_w == wanted.width as i32 && output.pixel_h == wanted.height as i32
    }

    fn create_slot(
        session: &mut Session,
        kind: Kind,
        place: &OutputPlace,
        color: Srgb,
        output: wl_output::WlOutput,
        output_name: u32,
        scale: i32,
    ) -> bool {
        let handle = session.queue.handle();
        let Some(compositor) = session.state.compositor.clone() else {
            return false;
        };
        let Some(shell) = session.state.layer_shell.clone() else {
            return false;
        };
        let surface = compositor.create_surface(&handle, ());
        let layer = shell.get_layer_surface(
            &surface,
            Some(&output),
            Layer::Overlay,
            "aquastar-neo-border".to_string(),
            &handle,
            kind,
        );
        layer.set_size(place.width, place.height);
        layer.set_anchor(Anchor::Top | Anchor::Left);
        layer.set_exclusive_zone(-1);
        layer.set_margin(place.margin_top, 0, 0, place.margin_left);
        layer.set_keyboard_interactivity(KeyboardInteractivity::None);
        let region = compositor.create_region(&handle, ());
        surface.set_input_region(Some(&region));
        region.destroy();
        if surface.version() >= 3 {
            surface.set_buffer_scale(scale);
        }
        *slot_mut(&mut session.state, kind) = Some(LayerSlot {
            surface: surface.clone(),
            layer,
            buffer: None,
            output_name,
            serial: None,
            closed: false,
        });
        surface.commit();
        if !pump(session) {
            destroy_slot(&mut session.state, kind);
            return false;
        }
        let serial = slot(&session.state, kind).and_then(|slot| slot.serial);
        let closed = slot(&session.state, kind).is_some_and(|slot| slot.closed);
        let Some(serial) = serial else {
            destroy_slot(&mut session.state, kind);
            return false;
        };
        if closed {
            destroy_slot(&mut session.state, kind);
            return false;
        }
        if let Some(slot) = slot_mut(&mut session.state, kind).as_mut() {
            slot.layer.ack_configure(serial);
        }
        if !attach_buffer(session, kind, place.width, place.height, scale, color) {
            destroy_slot(&mut session.state, kind);
            return false;
        }
        if let Some(slot) = slot(&session.state, kind) {
            slot.surface.commit();
        }
        if !pump(session) {
            destroy_slot(&mut session.state, kind);
            return false;
        }
        true
    }

    fn update_slot(
        session: &mut Session,
        kind: Kind,
        place: &OutputPlace,
        color: Srgb,
        scale: i32,
    ) -> bool {
        let Some(surface) = slot(&session.state, kind).map(|slot| slot.surface.clone()) else {
            return false;
        };
        if let Some(slot) = slot_mut(&mut session.state, kind).as_mut() {
            slot.layer.set_size(place.width, place.height);
            slot.layer
                .set_margin(place.margin_top, 0, 0, place.margin_left);
            slot.serial = None;
            if surface.version() >= 3 {
                surface.set_buffer_scale(scale);
            }
        }
        surface.commit();
        if !pump(session) {
            return false;
        }
        let Some(serial) = slot(&session.state, kind).and_then(|slot| slot.serial) else {
            return false;
        };
        if slot(&session.state, kind).is_some_and(|slot| slot.closed) {
            destroy_slot(&mut session.state, kind);
            return false;
        }
        if let Some(slot) = slot_mut(&mut session.state, kind).as_mut() {
            slot.layer.ack_configure(serial);
        }
        if !attach_buffer(session, kind, place.width, place.height, scale, color) {
            return false;
        }
        if let Some(slot) = slot(&session.state, kind) {
            slot.surface.commit();
        }
        pump(session)
    }

    fn attach_buffer(
        session: &mut Session,
        kind: Kind,
        width: u32,
        height: u32,
        scale: i32,
        color: Srgb,
    ) -> bool {
        let Some(bytes) = stroke_bytes(width, height, scale.max(1) as u32, color, ByteOrder::Lsb)
        else {
            return false;
        };
        let buf_w = (u64::from(width) * u64::from(scale.max(1) as u32)) as i32;
        let buf_h = (u64::from(height) * u64::from(scale.max(1) as u32)) as i32;
        let stride = buf_w.saturating_mul(4);
        let handle = session.queue.handle();
        let Some(buffer) = upload(&mut session.state, &handle, &bytes, buf_w, buf_h, stride) else {
            return false;
        };
        let wl_buffer = buffer.buffer.clone();
        let old = {
            let Some(slot) = slot_mut(&mut session.state, kind).as_mut() else {
                return false;
            };
            let old = slot.buffer.replace(buffer);
            slot.surface.attach(Some(&wl_buffer), 0, 0);
            slot.surface.damage(0, 0, width as i32, height as i32);
            old
        };
        if let Some(old) = old {
            if old.released {
                old.buffer.destroy();
                old.pool.destroy();
            } else {
                session.state.retired.push(RetiredBuffer {
                    token: old.token,
                    buffer: old.buffer,
                    pool: old.pool,
                });
            }
        }
        true
    }

    fn upload(
        state: &mut WlState,
        handle: &QueueHandle<WlState>,
        bytes: &[u8],
        width: i32,
        height: i32,
        stride: i32,
    ) -> Option<ShmBuffer> {
        if bytes.len() > i32::MAX as usize || width <= 0 || height <= 0 {
            return None;
        }
        let shm = state.shm.clone()?;
        let file = anonymous_file(bytes)?;
        let token = state.next_token;
        state.next_token = state.next_token.wrapping_add(1);
        let pool = shm.create_pool(file.as_fd(), bytes.len() as i32, handle, ());
        let buffer = pool.create_buffer(
            0,
            width,
            height,
            stride,
            wl_shm::Format::Argb8888,
            handle,
            token,
        );
        Some(ShmBuffer {
            token,
            buffer,
            pool,
            released: false,
        })
    }

    fn pump(session: &mut Session) -> bool {
        if session.queue.roundtrip(&mut session.state).is_err() {
            session.dead = true;
            false
        } else {
            true
        }
    }

    fn slot(state: &WlState, kind: Kind) -> Option<&LayerSlot> {
        match kind {
            Kind::Flash => state.flash.as_ref(),
            Kind::Recording => state.recording.as_ref(),
        }
    }

    fn slot_mut(state: &mut WlState, kind: Kind) -> &mut Option<LayerSlot> {
        match kind {
            Kind::Flash => &mut state.flash,
            Kind::Recording => &mut state.recording,
        }
    }

    fn destroy_slot(state: &mut WlState, kind: Kind) {
        let Some(slot) = slot_mut(state, kind).take() else {
            return;
        };
        slot.layer.destroy();
        if let Some(buffer) = slot.buffer {
            buffer.buffer.destroy();
            buffer.pool.destroy();
        }
        slot.surface.destroy();
    }

    fn anonymous_file(bytes: &[u8]) -> Option<std::fs::File> {
        let file = if let Some(fd) = memfd() {
            unsafe { std::fs::File::from_raw_fd(fd) }
        } else {
            let path = std::env::temp_dir().join(format!("aquastar-border-{}", std::process::id()));
            let file = std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(true)
                .open(&path)
                .ok()?;
            let _ = std::fs::remove_file(&path);
            file
        };
        use std::os::unix::fs::FileExt;
        file.set_len(bytes.len() as u64).ok()?;
        file.write_all_at(bytes, 0).ok()?;
        Some(file)
    }

    fn memfd() -> Option<i32> {
        let name = b"aquastar-border\0";
        let fd = unsafe { syscall(memfd_syscall(), name.as_ptr(), 1) };
        if fd < 0 {
            None
        } else {
            Some(fd as i32)
        }
    }

    fn memfd_syscall() -> i64 {
        #[cfg(target_arch = "x86_64")]
        {
            319
        }
        #[cfg(target_arch = "aarch64")]
        {
            279
        }
        #[cfg(target_arch = "riscv64")]
        {
            279
        }
        #[cfg(not(any(
            target_arch = "x86_64",
            target_arch = "aarch64",
            target_arch = "riscv64"
        )))]
        {
            -1
        }
    }

    unsafe extern "C" {
        fn syscall(number: i64, ...) -> i64;
    }

    impl WlState {
        fn new() -> Self {
            Self {
                compositor: None,
                shm: None,
                layer_shell: None,
                outputs: Vec::new(),
                recording: None,
                flash: None,
                retired: Vec::new(),
                next_token: 1,
            }
        }
    }

    impl Dispatch<wl_registry::WlRegistry, ()> for WlState {
        fn event(
            state: &mut Self,
            registry: &wl_registry::WlRegistry,
            event: wl_registry::Event,
            _: &(),
            _: &Connection,
            handle: &QueueHandle<Self>,
        ) {
            let wl_registry::Event::Global {
                name,
                interface,
                version,
            } = event
            else {
                if let wl_registry::Event::GlobalRemove { name } = event {
                    state.outputs.retain(|output| output.registry_name != name);
                    for slot in [state.flash.as_mut(), state.recording.as_mut()]
                        .into_iter()
                        .flatten()
                    {
                        if slot.output_name == name {
                            slot.closed = true;
                        }
                    }
                }
                return;
            };
            match interface.as_str() {
                "wl_compositor" if state.compositor.is_none() => {
                    let version = version.min(4);
                    if version >= 1 {
                        state.compositor =
                            Some(registry.bind::<wl_compositor::WlCompositor, _, _>(
                                name,
                                version,
                                handle,
                                (),
                            ));
                    }
                }
                "wl_shm" if state.shm.is_none() => {
                    let version = version.min(1);
                    if version >= 1 {
                        state.shm =
                            Some(registry.bind::<wl_shm::WlShm, _, _>(name, version, handle, ()));
                    }
                }
                "zwlr_layer_shell_v1" if state.layer_shell.is_none() => {
                    let version = version.min(1);
                    if version >= 1 {
                        state.layer_shell = Some(registry.bind::<ZwlrLayerShellV1, _, _>(
                            name,
                            version,
                            handle,
                            (),
                        ));
                    }
                }
                "wl_output" => {
                    let version = version.min(4);
                    if version >= 1 {
                        let output =
                            registry.bind::<wl_output::WlOutput, _, _>(name, version, handle, name);
                        state.outputs.push(TrackedOutput {
                            registry_name: name,
                            output,
                            x: 0,
                            y: 0,
                            pixel_w: 0,
                            pixel_h: 0,
                            scale: 1,
                            has_mode: false,
                        });
                    }
                }
                _ => {}
            }
        }
    }

    impl Dispatch<wl_output::WlOutput, u32> for WlState {
        fn event(
            state: &mut Self,
            _: &wl_output::WlOutput,
            event: wl_output::Event,
            name: &u32,
            _: &Connection,
            _: &QueueHandle<Self>,
        ) {
            let Some(output) = state
                .outputs
                .iter_mut()
                .find(|output| output.registry_name == *name)
            else {
                return;
            };
            match event {
                wl_output::Event::Geometry { x, y, .. } => {
                    output.x = x;
                    output.y = y;
                }
                wl_output::Event::Mode {
                    flags,
                    width,
                    height,
                    ..
                } => {
                    let current = match flags {
                        WEnum::Value(mode) => mode.contains(wl_output::Mode::Current),
                        WEnum::Unknown(bits) => bits & wl_output::Mode::Current.bits() != 0,
                    };
                    if width > 0 && height > 0 && (current || !output.has_mode) {
                        output.pixel_w = width;
                        output.pixel_h = height;
                        output.has_mode = true;
                    }
                }
                wl_output::Event::Scale { factor } => {
                    output.scale = factor.max(1);
                }
                _ => {}
            }
        }
    }

    impl Dispatch<ZwlrLayerSurfaceV1, Kind> for WlState {
        fn event(
            state: &mut Self,
            _: &ZwlrLayerSurfaceV1,
            event: zwlr_layer_surface_v1::Event,
            kind: &Kind,
            _: &Connection,
            _: &QueueHandle<Self>,
        ) {
            let Some(slot) = slot_mut(state, *kind).as_mut() else {
                return;
            };
            match event {
                zwlr_layer_surface_v1::Event::Configure { serial, .. } => {
                    slot.serial = Some(serial)
                }
                zwlr_layer_surface_v1::Event::Closed => slot.closed = true,
                _ => {}
            }
        }
    }

    impl Dispatch<wl_buffer::WlBuffer, u64> for WlState {
        fn event(
            state: &mut Self,
            _: &wl_buffer::WlBuffer,
            event: wl_buffer::Event,
            token: &u64,
            _: &Connection,
            _: &QueueHandle<Self>,
        ) {
            if !matches!(event, wl_buffer::Event::Release) {
                return;
            }
            for slot in [state.flash.as_mut(), state.recording.as_mut()]
                .into_iter()
                .flatten()
            {
                if slot
                    .buffer
                    .as_ref()
                    .is_some_and(|buffer| buffer.token == *token)
                {
                    if let Some(buffer) = slot.buffer.as_mut() {
                        buffer.released = true;
                    }
                }
            }
            let mut kept = Vec::new();
            for retired in state.retired.drain(..) {
                if retired.token == *token {
                    retired.buffer.destroy();
                    retired.pool.destroy();
                } else {
                    kept.push(retired);
                }
            }
            state.retired = kept;
        }
    }

    delegate_noop!(WlState: ignore wl_compositor::WlCompositor);
    delegate_noop!(WlState: ignore wl_shm::WlShm);
    delegate_noop!(WlState: ignore wl_shm_pool::WlShmPool);
    delegate_noop!(WlState: ignore wl_surface::WlSurface);
    delegate_noop!(WlState: ignore wl_region::WlRegion);
    delegate_noop!(WlState: ignore ZwlrLayerShellV1);
}

#[cfg(windows)]
mod win32 {
    use super::{
        stroke_bytes, ByteOrder, Kind, NativeId, NativeOp, Observation, Paint, Pid, Rect,
        SampleHint, Seen,
    };
    use std::ffi::c_void;
    use std::sync::OnceLock;

    const WS_POPUP: u32 = 0x8000_0000;
    const WS_EX_LAYERED: u32 = 0x0008_0000;
    const WS_EX_TRANSPARENT: u32 = 0x0000_0020;
    const WS_EX_TOPMOST: u32 = 0x0000_0008;
    const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
    const WS_EX_NOACTIVATE: u32 = 0x0800_0000;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_SHOWWINDOW: u32 = 0x0040;
    const HWND_TOP: *mut c_void = std::ptr::null_mut();
    const HWND_TOPMOST: *mut c_void = -1isize as *mut c_void;

    struct Popup {
        hwnd: *mut c_void,
        excluded: bool,
    }

    pub(super) struct Win32State {
        recording: Option<Popup>,
        flash: Option<Popup>,
    }

    impl Win32State {
        pub(super) fn open() -> Option<Self> {
            if !ensure_class() {
                return None;
            }
            Some(Self {
                recording: None,
                flash: None,
            })
        }

        pub(super) fn sample(&mut self, hint: &SampleHint) -> Observation {
            let front_pid = unsafe {
                let hwnd = GetForegroundWindow();
                if hwnd.is_null() {
                    None
                } else {
                    let mut pid = 0u32;
                    GetWindowThreadProcessId(hwnd, &mut pid);
                    if pid == 0 {
                        None
                    } else {
                        Some(Pid(pid))
                    }
                }
            };
            let mut windows = Vec::new();
            for (pid, id) in &hint.windows {
                if let Some(seen) = observe(*pid, *id) {
                    windows.push(seen);
                }
            }
            Observation { front_pid, windows }
        }

        pub(super) fn perform(&mut self, op: &NativeOp) -> bool {
            match *op {
                NativeOp::Create { kind, paint } => self.create(kind, &paint),
                NativeOp::Move { kind, paint } => {
                    if self.slot(kind).is_none() {
                        self.create(kind, &paint)
                    } else {
                        self.move_popup(kind, &paint)
                    }
                }
                NativeOp::Destroy { kind } => {
                    self.destroy(kind);
                    true
                }
            }
        }

        fn create(&mut self, kind: Kind, paint: &Paint) -> bool {
            self.destroy(kind);
            let Some(width) = i32::try_from(paint.rect.width).ok() else {
                return false;
            };
            let Some(height) = i32::try_from(paint.rect.height).ok() else {
                return false;
            };
            if width <= 0 || height <= 0 {
                return false;
            }
            let hwnd = unsafe {
                CreateWindowExW(
                    WS_EX_LAYERED
                        | WS_EX_TRANSPARENT
                        | WS_EX_NOACTIVATE
                        | WS_EX_TOPMOST
                        | WS_EX_TOOLWINDOW,
                    class_name().as_ptr(),
                    class_name().as_ptr(),
                    WS_POPUP,
                    paint.rect.x,
                    paint.rect.y,
                    width,
                    height,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    GetModuleHandleW(std::ptr::null()),
                    std::ptr::null_mut(),
                )
            };
            if hwnd.is_null() {
                return false;
            }
            let mut guard = PopupGuard { hwnd };
            if !present(hwnd, paint) {
                return false;
            }
            let raise = matches!(kind, Kind::Flash);
            if !place(hwnd, paint.rect, true, raise) {
                return false;
            }
            let mut popup = Popup {
                hwnd: guard.disarm(),
                excluded: false,
            };
            exclude(&mut popup);
            *self.slot_mut(kind) = Some(popup);
            true
        }

        fn move_popup(&mut self, kind: Kind, paint: &Paint) -> bool {
            let Some(hwnd) = self.slot(kind).map(|popup| popup.hwnd) else {
                return false;
            };
            if !present(hwnd, paint) {
                return false;
            }
            let raise = matches!(kind, Kind::Flash);
            if !place(hwnd, paint.rect, false, raise) {
                return false;
            }
            if let Some(popup) = self.slot_mut(kind).as_mut() {
                exclude(popup);
            }
            true
        }

        fn destroy(&mut self, kind: Kind) {
            if let Some(popup) = self.slot_mut(kind).take() {
                unsafe {
                    DestroyWindow(popup.hwnd);
                }
            }
        }

        fn slot(&self, kind: Kind) -> Option<&Popup> {
            match kind {
                Kind::Flash => self.flash.as_ref(),
                Kind::Recording => self.recording.as_ref(),
            }
        }

        fn slot_mut(&mut self, kind: Kind) -> &mut Option<Popup> {
            match kind {
                Kind::Flash => &mut self.flash,
                Kind::Recording => &mut self.recording,
            }
        }

        pub(super) fn raise_flash(&self) {
            let Some(flash) = &self.flash else {
                return;
            };
            unsafe {
                SetWindowPos(
                    flash.hwnd,
                    HWND_TOP,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
        }
    }

    impl Drop for Win32State {
        fn drop(&mut self) {
            self.destroy(Kind::Flash);
            self.destroy(Kind::Recording);
        }
    }

    struct PopupGuard {
        hwnd: *mut c_void,
    }

    impl PopupGuard {
        fn disarm(&mut self) -> *mut c_void {
            let hwnd = self.hwnd;
            self.hwnd = std::ptr::null_mut();
            hwnd
        }
    }

    impl Drop for PopupGuard {
        fn drop(&mut self) {
            if !self.hwnd.is_null() {
                unsafe {
                    DestroyWindow(self.hwnd);
                }
            }
        }
    }

    fn present(hwnd: *mut c_void, paint: &Paint) -> bool {
        let Some(bytes) = stroke_bytes(
            paint.rect.width,
            paint.rect.height,
            1,
            paint.color,
            ByteOrder::Lsb,
        ) else {
            return false;
        };
        unsafe { update_layered(hwnd, paint.rect, &bytes) }
    }

    fn place(hwnd: *mut c_void, rect: Rect, show: bool, raise: bool) -> bool {
        let flags = if show {
            SWP_SHOWWINDOW | SWP_NOACTIVATE
        } else if raise {
            SWP_NOACTIVATE
        } else {
            SWP_NOZORDER | SWP_NOACTIVATE
        };
        let insert = if raise { HWND_TOP } else { HWND_TOPMOST };
        unsafe {
            SetWindowPos(
                hwnd,
                insert,
                rect.x,
                rect.y,
                rect.width as i32,
                rect.height as i32,
                flags,
            ) != 0
        }
    }

    fn exclude(popup: &mut Popup) {
        if popup.excluded {
            return;
        }
        let ok = unsafe { SetWindowDisplayAffinity(popup.hwnd, 0x11) != 0 };
        if ok {
            popup.excluded = true;
        }
    }

    fn observe(pid: Pid, id: NativeId) -> Option<Seen> {
        // Bit-preserving cast, matching Window::from_raw_hwnd in backend/windows.rs.
        // A signed cast would sign-extend window ids above i32::MAX.
        let hwnd = id.0 as usize as *mut c_void;
        unsafe {
            if IsWindow(hwnd) == 0 || IsIconic(hwnd) != 0 {
                return None;
            }
            let mut frame = WinRect {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            };
            if GetWindowRect(hwnd, &mut frame) == 0
                || frame.right <= frame.left
                || frame.bottom <= frame.top
            {
                return None;
            }
            Some(Seen {
                pid,
                id: Some(id),
                bounds: Rect {
                    x: frame.left,
                    y: frame.top,
                    width: (frame.right - frame.left) as u32,
                    height: (frame.bottom - frame.top) as u32,
                },
                mapped: true,
            })
        }
    }

    fn ensure_class() -> bool {
        static READY: OnceLock<bool> = OnceLock::new();
        *READY.get_or_init(|| unsafe { register_class() })
    }

    unsafe fn register_class() -> bool {
        let class = WndClassW {
            style: 0,
            wnd_proc,
            class_extra: 0,
            window_extra: 0,
            instance: GetModuleHandleW(std::ptr::null()),
            icon: std::ptr::null_mut(),
            cursor: std::ptr::null_mut(),
            background: std::ptr::null_mut(),
            menu_name: std::ptr::null(),
            class_name: class_name().as_ptr(),
        };
        RegisterClassW(&class) != 0 || GetLastError() == 1410
    }

    fn class_name() -> &'static [u16] {
        static NAME: OnceLock<Vec<u16>> = OnceLock::new();
        NAME.get_or_init(|| {
            "AquaStarNeoBorder"
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect()
        })
    }

    unsafe fn update_layered(hwnd: *mut c_void, rect: Rect, bytes: &[u8]) -> bool {
        let Ok(width) = i32::try_from(rect.width) else {
            return false;
        };
        let Ok(height) = i32::try_from(rect.height) else {
            return false;
        };
        if width <= 0 || height <= 0 {
            return false;
        }
        let screen = GetDC(std::ptr::null_mut());
        if screen.is_null() {
            return false;
        }
        let memory = CreateCompatibleDC(screen);
        if memory.is_null() {
            ReleaseDC(std::ptr::null_mut(), screen);
            return false;
        }
        let info = BitmapInfo {
            header: BitmapInfoHeader {
                bi_size: 40,
                bi_width: width,
                bi_height: -height,
                bi_planes: 1,
                bi_bit_count: 32,
                bi_compression: 0,
                bi_size_image: 0,
                bi_x_pels_per_meter: 0,
                bi_y_pels_per_meter: 0,
                bi_clr_used: 0,
                bi_clr_important: 0,
            },
        };
        let mut bits: *mut u8 = std::ptr::null_mut();
        let bitmap = CreateDIBSection(memory, &info, 0, &mut bits, std::ptr::null_mut(), 0);
        if bitmap.is_null() || bits.is_null() {
            DeleteDC(memory);
            ReleaseDC(std::ptr::null_mut(), screen);
            return false;
        }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), bits, bytes.len());
        let previous = SelectObject(memory, bitmap);
        let destination = Point {
            x: rect.x,
            y: rect.y,
        };
        let size = WinSize {
            cx: width,
            cy: height,
        };
        let source = Point { x: 0, y: 0 };
        let blend = BlendFunction {
            blend_op: 0,
            blend_flags: 0,
            source_constant_alpha: 255,
            alpha_format: 1,
        };
        let ok = UpdateLayeredWindow(
            hwnd,
            screen,
            &destination,
            &size,
            memory,
            &source,
            0,
            &blend,
            2,
        ) != 0;
        SelectObject(memory, previous);
        DeleteObject(bitmap);
        DeleteDC(memory);
        ReleaseDC(std::ptr::null_mut(), screen);
        ok
    }

    extern "system" fn wnd_proc(
        hwnd: *mut c_void,
        message: u32,
        wparam: usize,
        lparam: isize,
    ) -> isize {
        if message == 0x0021 {
            return 3;
        }
        unsafe { DefWindowProcW(hwnd, message, wparam, lparam) }
    }

    #[repr(C)]
    struct WndClassW {
        style: u32,
        wnd_proc: extern "system" fn(*mut c_void, u32, usize, isize) -> isize,
        class_extra: i32,
        window_extra: i32,
        instance: *mut c_void,
        icon: *mut c_void,
        cursor: *mut c_void,
        background: *mut c_void,
        menu_name: *const u16,
        class_name: *const u16,
    }

    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }

    #[repr(C)]
    struct WinSize {
        cx: i32,
        cy: i32,
    }

    #[repr(C)]
    struct WinRect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }

    #[repr(C)]
    struct BlendFunction {
        blend_op: u8,
        blend_flags: u8,
        source_constant_alpha: u8,
        alpha_format: u8,
    }

    #[repr(C)]
    struct BitmapInfoHeader {
        bi_size: u32,
        bi_width: i32,
        bi_height: i32,
        bi_planes: u16,
        bi_bit_count: u16,
        bi_compression: u32,
        bi_size_image: u32,
        bi_x_pels_per_meter: i32,
        bi_y_pels_per_meter: i32,
        bi_clr_used: u32,
        bi_clr_important: u32,
    }

    #[repr(C)]
    struct BitmapInfo {
        header: BitmapInfoHeader,
    }

    #[link(name = "user32")]
    extern "system" {
        fn RegisterClassW(class: *const WndClassW) -> u16;
        fn CreateWindowExW(
            ex_style: u32,
            class_name: *const u16,
            window_name: *const u16,
            style: u32,
            x: i32,
            y: i32,
            width: i32,
            height: i32,
            parent: *mut c_void,
            menu: *mut c_void,
            instance: *mut c_void,
            param: *mut c_void,
        ) -> *mut c_void;
        fn DefWindowProcW(hwnd: *mut c_void, message: u32, wparam: usize, lparam: isize) -> isize;
        fn DestroyWindow(hwnd: *mut c_void) -> i32;
        fn SetWindowPos(
            hwnd: *mut c_void,
            insert_after: *mut c_void,
            x: i32,
            y: i32,
            width: i32,
            height: i32,
            flags: u32,
        ) -> i32;
        fn SetWindowDisplayAffinity(hwnd: *mut c_void, affinity: u32) -> i32;
        fn UpdateLayeredWindow(
            hwnd: *mut c_void,
            destination_dc: *mut c_void,
            destination: *const Point,
            size: *const WinSize,
            source_dc: *mut c_void,
            source: *const Point,
            color_key: u32,
            blend: *const BlendFunction,
            flags: u32,
        ) -> i32;
        fn GetWindowRect(hwnd: *mut c_void, rect: *mut WinRect) -> i32;
        fn IsWindow(hwnd: *mut c_void) -> i32;
        fn IsIconic(hwnd: *mut c_void) -> i32;
        fn GetForegroundWindow() -> *mut c_void;
        fn GetWindowThreadProcessId(hwnd: *mut c_void, pid: *mut u32) -> u32;
        fn GetDC(hwnd: *mut c_void) -> *mut c_void;
        fn ReleaseDC(hwnd: *mut c_void, dc: *mut c_void) -> i32;
    }

    #[link(name = "gdi32")]
    extern "system" {
        fn CreateCompatibleDC(dc: *mut c_void) -> *mut c_void;
        fn CreateDIBSection(
            dc: *mut c_void,
            info: *const BitmapInfo,
            usage: u32,
            bits: *mut *mut u8,
            section: *mut c_void,
            offset: u32,
        ) -> *mut c_void;
        fn SelectObject(dc: *mut c_void, object: *mut c_void) -> *mut c_void;
        fn DeleteObject(object: *mut c_void) -> i32;
        fn DeleteDC(dc: *mut c_void) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetModuleHandleW(name: *const u16) -> *mut c_void;
        fn GetLastError() -> u32;
    }
}

#[cfg(test)]
mod tests {
    use super::super::{Pid, Rect, FLASH_COLOR, RECORD_COLOR};
    use super::*;

    fn rect(x: i32, y: i32, width: u32, height: u32) -> Rect {
        Rect {
            x,
            y,
            width,
            height,
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
}
