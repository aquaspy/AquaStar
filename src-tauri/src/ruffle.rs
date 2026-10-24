//! Ruffle desktop options shared by the launcher UI and the player process.
//!
//! Artix Ruffle 3.0.0's desktop CLI takes:
//! - `--quality low|medium|high` (high is Ruffle's own default: 4x MSAA; low is no anti-aliasing)
//! - `--graphics default|vulkan|metal|dx12|gl`
//! - `--title`
//!
//! Artix 3.0.0 removed `--performance-mode`. AquaStar NEO does not pass it.
//! Smooth Motion (`frame_interpolation`) is a saved context-menu preference
//! in that build, not a command-line flag.
//!
//! Automatic (`default`) lets Ruffle choose the backend on every platform.
//! Crash recovery retries once with OpenGL on Linux/Windows or Metal on macOS.
//! Explicit choices also include Vulkan on Linux/Windows and DirectX 12 on Windows.

use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

pub const SETTINGS_FILE: &str = "settings.json";
/// A backend other than the recovery backend that dies before this, or dies later with a graphics panic, is retried once.
pub const EARLY_EXIT: Duration = Duration::from_millis(15_000);
pub const STDERR_TAIL: usize = 8192;
const LOG_TAIL: usize = 1000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuffleQuality {
    Low,
    Medium,
    High,
}

impl RuffleQuality {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuffleGraphics {
    Gl,
    Vulkan,
    Metal,
    Dx12,
    Automatic,
}

impl RuffleGraphics {
    /// Value passed to `--graphics`. Automatic is Ruffle's `default`.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Gl => "gl",
            Self::Vulkan => "vulkan",
            Self::Metal => "metal",
            Self::Dx12 => "dx12",
            Self::Automatic => "default",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuffleSettings {
    pub quality: RuffleQuality,
    pub graphics: RuffleGraphics,
}

/// OpenGL on Linux and Windows. Metal on macOS. The Artix Mac binary links Metal.
pub fn safe_graphics(platform: &str) -> RuffleGraphics {
    if platform == "macos" {
        RuffleGraphics::Metal
    } else {
        RuffleGraphics::Gl
    }
}

impl Default for RuffleSettings {
    fn default() -> Self {
        Self {
            quality: RuffleQuality::High,
            graphics: RuffleGraphics::Automatic,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SettingChoice {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SettingsView {
    #[serde(rename = "ruffleQuality")]
    pub ruffle_quality: String,
    #[serde(rename = "ruffleGraphics")]
    pub ruffle_graphics: String,
    pub qualities: Vec<SettingChoice>,
    #[serde(rename = "graphicsChoices")]
    pub graphics_choices: Vec<SettingChoice>,
}

/// What the player process did, for the platform recovery decision.
pub struct ExitReport {
    pub graphics: RuffleGraphics,
    pub code: Option<i32>,
    pub signal: Option<i32>,
    pub elapsed: Duration,
    pub panicked: bool,
    pub killed_by_us: bool,
}

pub fn quality_choices() -> Vec<SettingChoice> {
    [
        ("high", "High (default)"),
        ("medium", "Medium"),
        ("low", "Low (fastest)"),
    ]
    .into_iter()
    .map(|(id, label)| SettingChoice {
        id: id.into(),
        label: label.into(),
    })
    .collect()
}

/// `platform` is `std::env::consts::OS` (`linux`, `windows`, `macos`).
pub fn graphics_choices(platform: &str) -> Vec<SettingChoice> {
    [
        ("default", "Automatic (default, Ruffle decides)", &[] as &[&str]),
        ("gl", "OpenGL", &[]),
        ("vulkan", "Vulkan", &["linux", "windows"]),
        ("dx12", "DirectX 12", &["windows"]),
        ("metal", "Metal", &["macos"]),
    ]
    .into_iter()
    .filter(|(id, _, platforms)| {
        (*id != "gl" || platform != "macos")
            && (platforms.is_empty() || platforms.contains(&platform))
    })
    .map(|(id, label, _)| SettingChoice {
        id: id.into(),
        label: label.into(),
    })
    .collect()
}

pub fn normalize_quality(value: &str) -> RuffleQuality {
    match value {
        "low" => RuffleQuality::Low,
        "medium" => RuffleQuality::Medium,
        "high" => RuffleQuality::High,
        _ => RuffleQuality::High,
    }
}

pub fn normalize_graphics(value: &str, platform: &str) -> RuffleGraphics {
    let graphics = match value {
        "gl" => RuffleGraphics::Gl,
        "vulkan" => RuffleGraphics::Vulkan,
        "metal" => RuffleGraphics::Metal,
        "dx12" => RuffleGraphics::Dx12,
        "default" => RuffleGraphics::Automatic,
        _ => return RuffleGraphics::Automatic,
    };
    if graphics_choices(platform)
        .iter()
        .any(|c| c.id == graphics.as_str())
    {
        graphics
    } else {
        RuffleGraphics::Automatic
    }
}

impl RuffleSettings {
    pub fn for_platform(&self, platform: &str) -> Self {
        Self {
            quality: normalize_quality(self.quality.as_str()),
            graphics: normalize_graphics(self.graphics.as_str(), platform),
        }
    }

    /// Missing, unreadable, or broken files load the defaults.
    pub fn load(dir: &Path) -> Self {
        match fs::read_to_string(dir.join(SETTINGS_FILE)) {
            Ok(text) => Self::parse(&text, std::env::consts::OS),
            Err(_) => Self::default(),
        }
    }

    fn parse(text: &str, platform: &str) -> Self {
        let Ok(raw) = serde_json::from_str::<serde_json::Value>(text) else {
            return Self::default();
        };
        let quality = raw
            .get("ruffleQuality")
            .and_then(|v| v.as_str())
            .unwrap_or("high");
        let graphics = raw
            .get("ruffleGraphics")
            .and_then(|v| v.as_str())
            .unwrap_or("default");
        Self {
            quality: normalize_quality(quality),
            graphics: normalize_graphics(graphics, platform),
        }
    }

    pub fn from_choice(quality: &str, graphics: &str) -> Self {
        Self {
            quality: normalize_quality(quality),
            graphics: normalize_graphics(graphics, std::env::consts::OS),
        }
    }

    pub fn save(&self, dir: &Path) -> Result<(), String> {
        let current = self.for_platform(std::env::consts::OS);
        let mut map = settings_object(dir);
        map.insert(
            "ruffleQuality".into(),
            serde_json::Value::String(current.quality.as_str().to_string()),
        );
        map.insert(
            "ruffleGraphics".into(),
            serde_json::Value::String(current.graphics.as_str().to_string()),
        );
        write_settings(dir, &map)
    }

    pub fn view(&self) -> SettingsView {
        let current = self.for_platform(std::env::consts::OS);
        SettingsView {
            ruffle_quality: current.quality.as_str().to_string(),
            ruffle_graphics: current.graphics.as_str().to_string(),
            qualities: quality_choices(),
            graphics_choices: graphics_choices(std::env::consts::OS),
        }
    }
}

/// A saved choice that named the removed stock Ruffle build.
pub fn retired_stock_marker(value: &str) -> bool {
    matches!(
        value,
        "stock"
            | "ruffle-stock"
            | "ruffle_stock"
            | "0.7"
            | "0.7.1"
            | "ruffle-0.7"
            | "ruffle0.7"
            | "ruffle-0.7.1"
            | "ruffle0.7.1"
    )
}

/// Rewrite retired stock markers to Artix's engine id. Other keys stay. Returns
/// whether anything changed. Callers that cannot parse the file must not write.
pub fn migrate_retired_ruffle_map(map: &mut serde_json::Map<String, serde_json::Value>) -> bool {
    let mut changed = false;
    if let Some(serde_json::Value::String(engine)) = map.get_mut("newInstanceEngine") {
        if retired_stock_marker(engine) {
            *engine = "ruffle".to_string();
            changed = true;
        }
    }
    if let Some(serde_json::Value::Object(engines)) = map.get_mut("gameEngine") {
        for value in engines.values_mut() {
            if let serde_json::Value::String(engine) = value {
                if retired_stock_marker(engine) {
                    *engine = "ruffle".to_string();
                    changed = true;
                }
            }
        }
    }
    changed
}

fn settings_object(dir: &Path) -> serde_json::Map<String, serde_json::Value> {
    let text = match fs::read_to_string(dir.join(SETTINGS_FILE)) {
        Ok(text) => text,
        Err(_) => return serde_json::Map::new(),
    };
    let mut map = match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(serde_json::Value::Object(map)) => map,
        _ => return serde_json::Map::new(),
    };
    if migrate_retired_ruffle_map(&mut map) {
        let _ = write_settings(dir, &map);
    }
    map
}

fn write_settings(
    dir: &Path,
    map: &serde_json::Map<String, serde_json::Value>,
) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let body = serde_json::to_string_pretty(&serde_json::Value::Object(map.clone()))
        .map_err(|e| e.to_string())?;
    fs::write(dir.join(SETTINGS_FILE), body + "\n").map_err(|e| e.to_string())
}

/// Missing or non-boolean values stay off, so an existing install keeps the launcher visible.
pub fn load_hide_launcher(dir: &Path) -> bool {
    settings_object(dir)
        .get("hideLauncher")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

pub fn save_hide_launcher(dir: &Path, hide: bool) -> Result<(), String> {
    let mut map = settings_object(dir);
    map.insert("hideLauncher".into(), serde_json::Value::Bool(hide));
    write_settings(dir, &map)
}

pub fn load_show_menu_bar(dir: &Path) -> bool {
    settings_object(dir).get("showMenuBar").and_then(serde_json::Value::as_bool).unwrap_or(false)
}

pub fn save_show_menu_bar(dir: &Path, show: bool) -> Result<(), String> {
    let mut map = settings_object(dir);
    map.insert("showMenuBar".into(), serde_json::Value::Bool(show));
    write_settings(dir, &map)
}

/// Player chosen for one game, keyed `<plugin>/<game>`. Unknown or malformed values are ignored by callers.
pub fn load_game_engine(dir: &Path, key: &str) -> Option<String> {
    settings_object(dir)
        .get("gameEngine")?
        .get(key)?
        .as_str()
        .map(str::to_string)
}

pub fn save_game_engine(dir: &Path, key: &str, engine: &str) -> Result<(), String> {
    let mut map = settings_object(dir);
    let mut engines = match map.remove("gameEngine") {
        Some(serde_json::Value::Object(existing)) => existing,
        _ => serde_json::Map::new(),
    };
    engines.insert(key.into(), serde_json::Value::String(engine.into()));
    map.insert("gameEngine".into(), serde_json::Value::Object(engines));
    write_settings(dir, &map)
}

/// Game opened at start-up instead of the launcher: (plugin id, game id).
pub fn load_startup(dir: &Path) -> Option<(String, String)> {
    let map = settings_object(dir);
    let startup = map.get("startup")?;
    let plugin = startup.get("plugin")?.as_str()?;
    let game = startup.get("game")?.as_str()?;
    (!plugin.is_empty() && !game.is_empty()).then(|| (plugin.to_string(), game.to_string()))
}

/// `None` goes back to showing the launcher.
pub fn save_startup(dir: &Path, target: Option<(&str, &str)>) -> Result<(), String> {
    let mut map = settings_object(dir);
    match target {
        Some((plugin, game)) => {
            map.insert("startup".into(), serde_json::json!({ "plugin": plugin, "game": game }));
        }
        None => {
            map.remove("startup");
        }
    }
    write_settings(dir, &map)
}

/// Command line for one movie. The SWF is last, and only known flag values are passed.
pub fn ruffle_args(swf: &str, settings: &RuffleSettings, platform: &str) -> Vec<String> {
    let settings = settings.for_platform(platform);
    [
        "--tcp-connections",
        "allow",
        "--storage",
        "disk",
        "--letterbox",
        "on",
        "--quality",
        settings.quality.as_str(),
        "--graphics",
        settings.graphics.as_str(),
        "--no-gui",
        swf,
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}

/// A backend other than [`safe_graphics`] that exits abnormally within [`EARLY_EXIT`],
/// or exits abnormally after printing a panic / wgpu graphics error, is relaunched
/// with the platform recovery backend. A clean exit, a process we killed, and the safe backend
/// itself never qualify, so the relaunch cannot loop.
pub fn should_fallback(info: &ExitReport) -> bool {
    should_fallback_on(info, std::env::consts::OS)
}

pub fn should_fallback_on(info: &ExitReport, platform: &str) -> bool {
    if info.graphics == safe_graphics(platform) || info.killed_by_us {
        return false;
    }
    let abnormal = info.signal.is_some() || matches!(info.code, Some(code) if code != 0);
    if !abnormal {
        return false;
    }
    info.panicked || info.elapsed < EARLY_EXIT
}

pub fn looks_like_panic(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("panicked at")
        || lower.contains("out of memory")
        || lower.contains("wgpu error")
        || lower.contains("validation error")
}

/// Keep the last [`STDERR_TAIL`] bytes and remember a panic seen there.
pub fn note_stderr(acc: &mut String, chunk: &str, panicked: &AtomicBool) {
    acc.push_str(chunk);
    if acc.len() > STDERR_TAIL {
        let mut start = acc.len() - STDERR_TAIL;
        while !acc.is_char_boundary(start) {
            start += 1;
        }
        acc.replace_range(..start, "");
    }
    if looks_like_panic(acc) {
        panicked.store(true, Ordering::SeqCst);
    }
}

pub fn log_tail(text: &str) -> &str {
    if text.len() <= LOG_TAIL {
        return text;
    }
    let mut start = text.len() - LOG_TAIL;
    while !text.is_char_boundary(start) {
        start += 1;
    }
    &text[start..]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    fn report(
        graphics: RuffleGraphics,
        code: Option<i32>,
        signal: Option<i32>,
        elapsed_ms: u64,
        panicked: bool,
        killed_by_us: bool,
    ) -> ExitReport {
        ExitReport {
            graphics,
            code,
            signal,
            elapsed: Duration::from_millis(elapsed_ms),
            panicked,
            killed_by_us,
        }
    }

    #[test]
    fn quality_and_graphics_map_to_ruffle_0_7_1_flags() {
        let args = ruffle_args(
            "https://game.aq.com/game/gamefiles/Loader4.swf?ver=b",
            &RuffleSettings {
                quality: RuffleQuality::Low,
                graphics: RuffleGraphics::Vulkan,
            },
            "linux",
        );
        assert_eq!(
            args[args.len() - 1],
            "https://game.aq.com/game/gamefiles/Loader4.swf?ver=b"
        );
        assert!(args.windows(2).any(|w| w == ["--quality", "low"]));
        assert!(args.windows(2).any(|w| w == ["--graphics", "vulkan"]));
        assert!(args.windows(2).any(|w| w == ["--tcp-connections", "allow"]));
        assert!(args.windows(2).any(|w| w
            == [
                "--no-gui",
                "https://game.aq.com/game/gamefiles/Loader4.swf?ver=b"
            ]));

        let auto = ruffle_args(
            "x.swf",
            &RuffleSettings {
                quality: RuffleQuality::Medium,
                graphics: RuffleGraphics::Automatic,
            },
            "linux",
        );
        assert!(auto.windows(2).any(|w| w == ["--quality", "medium"]));
        assert!(auto.windows(2).any(|w| w == ["--graphics", "default"]));

        let defaults = ruffle_args("x.swf", &RuffleSettings::default(), "linux");
        assert!(defaults.windows(2).any(|w| w == ["--quality", "high"]));
        assert!(defaults.windows(2).any(|w| w == ["--graphics", "default"]));
    }

    #[test]
    fn unknown_values_and_foreign_backends_become_default_flags() {
        let junk = RuffleSettings::parse(
            r#"{"ruffleQuality":"best; rm -rf /","ruffleGraphics":"vulkan --evil"}"#,
            "linux",
        );
        let args = ruffle_args("x.swf", &junk, "linux");
        assert!(args.windows(2).any(|w| w == ["--quality", "high"]));
        assert!(args.windows(2).any(|w| w == ["--graphics", "default"]));
        assert!(!args.iter().any(|a| a.contains("rm ")));

        assert_eq!(normalize_graphics("dx12", "windows"), RuffleGraphics::Dx12);
        assert_eq!(normalize_graphics("dx12", "linux"), RuffleGraphics::Automatic);
        assert_eq!(normalize_graphics("dx12", "macos"), RuffleGraphics::Automatic);
        assert_eq!(normalize_graphics("metal", "macos"), RuffleGraphics::Metal);
        assert_eq!(normalize_graphics("metal", "linux"), RuffleGraphics::Automatic);
        assert_eq!(normalize_graphics("vulkan", "macos"), RuffleGraphics::Automatic);
        assert_eq!(
            normalize_graphics("vulkan", "linux"),
            RuffleGraphics::Vulkan
        );
        assert_eq!(normalize_quality("LOW"), RuffleQuality::High);
    }

    #[test]
    fn absent_invalid_and_saved_preferences_work_on_every_platform() {
        for platform in ["linux", "windows", "macos"] {
            for text in ["{}", "[]", "{", r#"{"ruffleQuality":null,"ruffleGraphics":42}"#] {
                let settings = RuffleSettings::parse(text, platform);
                assert_eq!(settings.quality, RuffleQuality::High);
                assert_eq!(settings.graphics, RuffleGraphics::Automatic);
                let args = ruffle_args("x.swf", &settings, platform);
                assert!(args.windows(2).any(|w| w == ["--quality", "high"]));
                assert!(args.windows(2).any(|w| w == ["--graphics", "default"]));
            }
            let graphics = safe_graphics(platform);
            let saved = format!(r#"{{"ruffleQuality":"medium","ruffleGraphics":"{}"}}"#, graphics.as_str());
            let settings = RuffleSettings::parse(&saved, platform);
            assert_eq!(settings.quality, RuffleQuality::Medium);
            assert_eq!(settings.graphics, graphics);
        }
    }

    #[test]
    fn graphics_choices_match_platform_support_and_defaults() {
        let ids = |platform| -> Vec<_> {
            graphics_choices(platform)
                .into_iter()
                .map(|c| c.id)
                .collect()
        };
        assert_eq!(ids("linux"), ["default", "gl", "vulkan"]);
        assert_eq!(ids("macos"), ["default", "metal"]);
        assert_eq!(ids("windows"), ["default", "gl", "vulkan", "dx12"]);
        assert_eq!(ids("freebsd"), ["default", "gl"]);
        let label = |platform: &str, id: &str| -> String {
            graphics_choices(platform)
                .into_iter()
                .find(|choice| choice.id == id)
                .expect(id)
                .label
        };
        assert_eq!(label("macos", "metal"), "Metal");
        assert_eq!(normalize_graphics("gl", "macos"), RuffleGraphics::Automatic);
        assert_eq!(label("windows", "gl"), "OpenGL");
        assert_eq!(label("linux", "gl"), "OpenGL");
        assert_eq!(
            quality_choices()
                .into_iter()
                .map(|c| c.id)
                .collect::<Vec<_>>(),
            ["high", "medium", "low"]
        );
        let labels: Vec<_> = quality_choices()
            .into_iter()
            .map(|c| (c.id, c.label))
            .collect();
        assert!(labels.contains(&("medium".into(), "Medium".into())));
        assert!(labels.contains(&("high".into(), "High (default)".into())));
    }

    #[test]
    fn a_crashing_non_gl_backend_falls_back_to_opengl_and_opengl_does_not() {
        let f = |graphics, code, signal, elapsed, panicked, killed| {
            should_fallback(&report(graphics, code, signal, elapsed, panicked, killed))
        };
        assert!(f(
            RuffleGraphics::Vulkan,
            Some(101),
            None,
            2000,
            false,
            false
        ));
        assert!(f(RuffleGraphics::Vulkan, None, Some(6), 3000, false, false));
        assert!(f(
            RuffleGraphics::Automatic,
            Some(101),
            None,
            600_000,
            true,
            false
        ));
        assert!(f(RuffleGraphics::Dx12, Some(1), None, 14_999, false, false));
        assert!(!f(
            RuffleGraphics::Vulkan,
            Some(1),
            None,
            15_000,
            false,
            false
        ));
        assert!(!f(
            RuffleGraphics::Vulkan,
            Some(1),
            None,
            600_000,
            false,
            false
        ));
        assert!(!f(
            RuffleGraphics::Vulkan,
            Some(0),
            None,
            1000,
            false,
            false
        ));
        assert!(!f(
            RuffleGraphics::Vulkan,
            None,
            Some(15),
            1000,
            false,
            true
        ));
        assert!(!f(RuffleGraphics::Vulkan, None, None, 1000, true, false));
        // OpenGL is the relaunch target, so a second crash must not qualify.
        assert!(!f(RuffleGraphics::Gl, Some(101), None, 1000, true, false));
        assert!(looks_like_panic(
            "thread 'main' panicked at wgpu-core: Out of Memory"
        ));
        assert!(looks_like_panic("Validation Error"));
        assert!(!looks_like_panic("INFO loaded movie"));
    }

    #[test]
    fn metal_is_the_mac_recovery_backend_and_unsupported_opengl_becomes_automatic() {
        assert_eq!(safe_graphics("macos"), RuffleGraphics::Metal);
        assert_eq!(safe_graphics("linux"), RuffleGraphics::Gl);
        assert_eq!(safe_graphics("windows"), RuffleGraphics::Gl);
        let crashed = |graphics| report(graphics, Some(101), None, 1000, true, false);
        assert!(should_fallback_on(&crashed(RuffleGraphics::Gl), "macos"));
        assert!(!should_fallback_on(
            &crashed(RuffleGraphics::Metal),
            "macos"
        ));
        assert!(!should_fallback_on(&crashed(RuffleGraphics::Gl), "linux"));
        assert!(should_fallback_on(&crashed(RuffleGraphics::Metal), "linux"));
        assert_eq!(
            RuffleSettings::parse(r#"{"ruffleQuality":"high"}"#, "macos").graphics,
            RuffleGraphics::Automatic
        );
        let mac = ruffle_args(
            "x.swf",
            &RuffleSettings {
                quality: RuffleQuality::High,
                graphics: safe_graphics("macos"),
            },
            "macos",
        );
        assert!(mac.windows(2).any(|w| w == ["--graphics", "metal"]));
    }

    #[test]
    fn stderr_tail_keeps_a_late_panic_and_stays_bounded() {
        let panicked = AtomicBool::new(false);
        let mut acc = String::new();
        note_stderr(&mut acc, &"a".repeat(9000), &panicked);
        assert!(!panicked.load(Ordering::SeqCst));
        assert!(acc.len() <= STDERR_TAIL);
        note_stderr(
            &mut acc,
            "\nthread 'main' panicked at wgpu error: Out of Memory\n",
            &panicked,
        );
        assert!(panicked.load(Ordering::SeqCst));
        assert!(acc.len() <= STDERR_TAIL);
        assert!(acc.contains("panicked at"));

        let text = format!("é{}", "b".repeat(999));
        assert_eq!(log_tail(&text), "b".repeat(999));
        assert_eq!(log_tail("short"), "short");
    }

    #[test]
    fn settings_roundtrip_normalizes_and_rejects_garbage() {
        let dir =
            std::env::temp_dir().join(format!("aquastar-lite-settings-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let saved = RuffleSettings {
            quality: RuffleQuality::Low,
            graphics: RuffleGraphics::Automatic,
        };
        saved.save(&dir).unwrap();
        let text = fs::read_to_string(dir.join(SETTINGS_FILE)).unwrap();
        assert!(text.contains("\"ruffleQuality\": \"low\""));
        assert!(text.contains("\"ruffleGraphics\": \"default\""));
        assert_eq!(RuffleSettings::load(&dir).quality, RuffleQuality::Low);

        assert_eq!(
            RuffleSettings::parse(r#"{"ruffleQuality":"medium"}"#, "windows").quality,
            RuffleQuality::Medium
        );
        assert_eq!(
            RuffleSettings::parse(r#"{"ruffleGraphics":"dx12"}"#, "windows").graphics,
            RuffleGraphics::Dx12
        );
        assert_eq!(
            RuffleSettings::parse(r#"{"ruffleGraphics":"metal"}"#, "macos").graphics,
            RuffleGraphics::Metal
        );
        assert_eq!(
            RuffleSettings::parse("{", "linux"),
            RuffleSettings::default()
        );
        assert_eq!(
            RuffleSettings::load(&dir.join("missing")),
            RuffleSettings::default()
        );
        fs::write(dir.join(SETTINGS_FILE), "[]").unwrap();
        assert_eq!(RuffleSettings::load(&dir), RuffleSettings::default());
        let _ = fs::remove_dir_all(&dir);

        let view = RuffleSettings::default().view();
        assert_eq!(view.ruffle_quality, "high");
        assert_eq!(RuffleSettings::default().quality, RuffleQuality::High);
        assert_eq!(view.ruffle_graphics, "default");
        assert!(view.qualities.iter().any(|c| c.id == "low"));
        assert!(view.graphics_choices.iter().any(|c| c.id == "default"));
    }

    #[test]
    fn menu_bar_defaults_hidden_and_preserves_other_preferences() {
        let dir = std::env::temp_dir().join(format!("aquastar-menu-bar-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        assert!(!load_show_menu_bar(&dir));
        RuffleSettings::default().save(&dir).unwrap();
        save_hide_launcher(&dir, true).unwrap();
        save_show_menu_bar(&dir, true).unwrap();
        assert!(load_show_menu_bar(&dir));
        assert!(load_hide_launcher(&dir));
        assert_eq!(RuffleSettings::load(&dir), RuffleSettings::default());
        RuffleSettings::default().save(&dir).unwrap();
        assert!(load_show_menu_bar(&dir));
        save_show_menu_bar(&dir, false).unwrap();
        assert!(!load_show_menu_bar(&dir));
        fs::write(dir.join(SETTINGS_FILE), r#"{"showMenuBar":"true"}"#).unwrap();
        assert!(!load_show_menu_bar(&dir));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn hide_launcher_defaults_off_and_survives_ruffle_saves() {
        let dir = std::env::temp_dir().join(format!(
            "aquastar-lite-hide-launcher-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        assert!(!load_hide_launcher(&dir));

        RuffleSettings {
            quality: RuffleQuality::Low,
            graphics: RuffleGraphics::Gl,
        }
        .save(&dir)
        .unwrap();
        save_hide_launcher(&dir, true).unwrap();
        let text = fs::read_to_string(dir.join(SETTINGS_FILE)).unwrap();
        assert!(text.contains("\"hideLauncher\": true"));
        assert!(text.contains("\"ruffleQuality\": \"low\""));
        assert!(load_hide_launcher(&dir));
        assert_eq!(RuffleSettings::load(&dir).quality, RuffleQuality::Low);

        RuffleSettings {
            quality: RuffleQuality::High,
            graphics: RuffleGraphics::Gl,
        }
        .save(&dir)
        .unwrap();
        assert!(load_hide_launcher(&dir));
        assert_eq!(RuffleSettings::load(&dir).quality, RuffleQuality::High);

        save_hide_launcher(&dir, false).unwrap();
        assert!(!load_hide_launcher(&dir));
        assert_eq!(RuffleSettings::load(&dir).quality, RuffleQuality::High);

        fs::write(dir.join(SETTINGS_FILE), r#"{"hideLauncher":"yes"}"#).unwrap();
        assert!(!load_hide_launcher(&dir));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_saved_stock_ruffle_choice_becomes_ruffle_and_other_settings_stay() {
        let dir = std::env::temp_dir().join(format!(
            "aquastar-lite-stock-migrate-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let source = r#"{
  "hideLauncher": true,
  "ruffleQuality": "low",
  "customNote": {"keep": 1},
  "newInstanceEngine": "0.7.1",
  "gameEngine": {
    "adventure-quest-worlds/aqw": "stock",
    "adventure-quest-worlds/dragonfable": "ruffle-0.7.1",
    "other/game": "flash"
  }
}"#;
        fs::write(dir.join(SETTINGS_FILE), source).unwrap();
        assert_eq!(
            load_game_engine(&dir, "adventure-quest-worlds/aqw").as_deref(),
            Some("ruffle")
        );
        assert_eq!(
            load_game_engine(&dir, "adventure-quest-worlds/dragonfable").as_deref(),
            Some("ruffle")
        );
        assert_eq!(load_game_engine(&dir, "other/game").as_deref(), Some("flash"));
        let text = fs::read_to_string(dir.join(SETTINGS_FILE)).unwrap();
        assert!(text.contains("\"hideLauncher\": true"));
        assert!(text.contains("\"ruffleQuality\": \"low\""));
        assert!(text.contains("\"keep\": 1"));
        assert!(text.contains("\"newInstanceEngine\": \"ruffle\""));
        assert!(!text.contains("stock"));
        assert!(!text.contains("0.7.1"));
        assert_eq!(RuffleSettings::load(&dir).quality, RuffleQuality::Low);

        let broken = "{not json";
        fs::write(dir.join(SETTINGS_FILE), broken).unwrap();
        assert_eq!(load_game_engine(&dir, "adventure-quest-worlds/aqw"), None);
        assert_eq!(fs::read_to_string(dir.join(SETTINGS_FILE)).unwrap(), broken);
        fs::write(dir.join(SETTINGS_FILE), "[]").unwrap();
        assert_eq!(load_game_engine(&dir, "adventure-quest-worlds/aqw"), None);
        assert_eq!(fs::read_to_string(dir.join(SETTINGS_FILE)).unwrap(), "[]");
        let _ = fs::remove_dir_all(&dir);
    }
}
