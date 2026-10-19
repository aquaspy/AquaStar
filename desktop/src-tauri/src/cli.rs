//! The command line: `aquastar --aqw --game=dragonfable --ruffle1.7`.
//!
//! * `--<plugin>`      a plugin's command id (its `launcherParameters.id`)
//! * `--game=<id>`     a game of that plugin; without it the plugin's default game
//! * `--tool=<id>`     one of that plugin's tools instead of a game (`--aqw --tool=inventory`)
//! * `--ruffle[<v>]`, `--flash[<v>]`   the player, optionally a version (`--ruffle1.7`, `--ruffle=1.7`)
//! * `--launcher`      show the launcher instead of going straight to the game
//! * `--no-launcher`   skip the launcher, using the saved start-up game if no plugin is named
//!
//! Parsing never fails: anything it cannot use is reported in `problems` so the launcher
//! can show it, and the rest of the command still applies.

use crate::players::Engine;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum LauncherMode {
    #[default]
    Default,
    Show,
    Skip,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EngineRequest {
    pub engine: Engine,
    pub version: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Cli {
    pub plugin: Option<String>,
    pub game: Option<String>,
    pub tool: Option<String>,
    pub engine: Option<EngineRequest>,
    pub launcher: LauncherMode,
    pub problems: Vec<String>,
}

const RESERVED: [&str; 7] = ["game", "launcher", "no-launcher", "nolauncher", "help", "version", "plugin"];

fn version_text(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 16
        && text.as_bytes()[0].is_ascii_digit()
        && !text.ends_with('.')
        && text.bytes().all(|b| b.is_ascii_digit() || b == b'.')
}

/// `ruffle`, `ruffle1.7`, `flash`, `flash32` → the player and the version, if any.
fn player_flag(name: &str) -> Option<(Engine, Option<String>)> {
    for (prefix, engine) in [("ruffle", Engine::Ruffle), ("flash", Engine::Flash)] {
        if let Some(rest) = name.strip_prefix(prefix) {
            if rest.is_empty() {
                return Some((engine, None));
            }
            if version_text(rest) {
                return Some((engine, Some(rest.to_string())));
            }
        }
    }
    None
}

/// Words a plugin cannot use as its command id, because they already mean something.
pub fn reserved_command(id: &str) -> bool {
    RESERVED.contains(&id) || player_flag(id).is_some()
}

pub fn valid_command_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 32
        && id.as_bytes()[0].is_ascii_lowercase()
        && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && !reserved_command(id)
}

/// `1.7` matches `1.7.0` and `1.7.2`, but not `1.70`.
pub fn version_matches(actual: &str, requested: &str) -> bool {
    actual == requested || actual.strip_prefix(requested).is_some_and(|rest| rest.starts_with('.'))
}

pub fn parse(args: &[String]) -> Cli {
    let mut cli = Cli::default();
    let mut index = 0;
    while index < args.len() {
        let token = &args[index];
        index += 1;
        let Some(body) = token.strip_prefix("--") else {
            continue; // paths and platform arguments are not ours
        };
        if body.is_empty() {
            continue;
        }
        let (name, value) = match body.split_once('=') {
            Some((name, value)) => (name.to_ascii_lowercase(), Some(value.to_string())),
            None => (body.to_ascii_lowercase(), None),
        };
        match name.as_str() {
            "launcher" | "no-launcher" | "nolauncher" => {
                let mode = if name == "launcher" { LauncherMode::Show } else { LauncherMode::Skip };
                if cli.launcher != LauncherMode::Default && cli.launcher != mode {
                    cli.problems.push("--launcher and --no-launcher cannot be used together".into());
                } else {
                    cli.launcher = mode;
                }
            }
            "game" => {
                let value = value.or_else(|| {
                    let next = args.get(index).filter(|next| !next.starts_with('-')).cloned();
                    if next.is_some() {
                        index += 1;
                    }
                    next
                });
                match value.filter(|value| !value.trim().is_empty()) {
                    Some(value) => cli.game = Some(value.trim().to_ascii_lowercase()),
                    None => cli.problems.push("--game needs a game id, for example --game=dragonfable".into()),
                }
            }
            "tool" => {
                let value = value.or_else(|| {
                    let next = args.get(index).filter(|next| !next.starts_with('-')).cloned();
                    if next.is_some() {
                        index += 1;
                    }
                    next
                });
                match value.filter(|value| !value.trim().is_empty()) {
                    Some(value) => cli.tool = Some(value.trim().to_ascii_lowercase()),
                    None => cli.problems.push("--tool needs a tool id, for example --tool=inventory".into()),
                }
            }
            other => {
                if let Some((engine, version)) = player_flag(other) {
                    let version = match (version, value) {
                        (Some(_), Some(_)) => {
                            cli.problems.push(format!("--{other}=... already names a version; give it once"));
                            continue;
                        }
                        (Some(version), None) => Some(version),
                        (None, Some(value)) if version_text(value.trim()) => Some(value.trim().to_string()),
                        (None, Some(value)) => {
                            cli.problems.push(format!("\"{value}\" is not a player version"));
                            continue;
                        }
                        (None, None) => None,
                    };
                    cli.engine = Some(EngineRequest { engine, version });
                } else if valid_command_id(other) && value.is_none() {
                    match &cli.plugin {
                        Some(first) if first != other => {
                            cli.problems.push(format!("Only one plugin can be named (--{first} and --{other})"));
                        }
                        _ => cli.plugin = Some(other.to_string()),
                    }
                } else {
                    cli.problems.push(format!("Unknown option --{other}"));
                }
            }
        }
    }
    if cli.game.is_some() && cli.tool.is_some() {
        cli.problems.push("--game and --tool cannot be used together; the game is opened".into());
        cli.tool = None;
    }
    cli
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_str(line: &str) -> Cli {
        parse(&line.split_whitespace().map(str::to_string).collect::<Vec<_>>())
    }

    #[test]
    fn the_documented_example_names_a_plugin_and_a_player_version() {
        let cli = parse_str("--aqw --ruffle1.7");
        assert_eq!(cli.plugin.as_deref(), Some("aqw"));
        assert_eq!(cli.engine, Some(EngineRequest { engine: Engine::Ruffle, version: Some("1.7".into()) }));
        assert_eq!(cli.game, None);
        assert_eq!(cli.launcher, LauncherMode::Default);
        assert!(cli.problems.is_empty());
    }

    #[test]
    fn games_players_and_launcher_modes_have_several_spellings() {
        assert_eq!(parse_str("--aqw --game=dragonfable").game.as_deref(), Some("dragonfable"));
        assert_eq!(parse_str("--aqw --game DragonFable").game.as_deref(), Some("dragonfable"));
        assert_eq!(parse_str("--ruffle").engine, Some(EngineRequest { engine: Engine::Ruffle, version: None }));
        assert_eq!(parse_str("--ruffle=1.7").engine.unwrap().version.as_deref(), Some("1.7"));
        assert_eq!(parse_str("--FLASH32").engine, Some(EngineRequest { engine: Engine::Flash, version: Some("32".into()) }));
        assert_eq!(parse_str("--no-launcher").launcher, LauncherMode::Skip);
        assert_eq!(parse_str("--nolauncher").launcher, LauncherMode::Skip);
        assert_eq!(parse_str("--aqw --launcher").launcher, LauncherMode::Show);
    }

    #[test]
    fn tools_are_named_with_tool() {
        let cli = parse_str("--aqw --tool=Inventory --no-launcher");
        assert_eq!(cli.plugin.as_deref(), Some("aqw"));
        assert_eq!(cli.tool.as_deref(), Some("inventory"));
        assert_eq!(cli.launcher, LauncherMode::Skip);
        assert_eq!(parse_str("--aqw --tool todo").tool.as_deref(), Some("todo"));
        assert!(parse_str("--tool").problems.iter().any(|p| p.contains("--tool needs")));
        let both = parse_str("--aqw --game=dragonfable --tool=todo");
        assert_eq!(both.tool, None);
        assert_eq!(both.game.as_deref(), Some("dragonfable"));
        assert!(both.problems.iter().any(|p| p.contains("cannot be used together")));
    }

    #[test]
    fn plugin_ids_that_start_like_a_player_are_still_plugins() {
        let cli = parse_str("--flash-arcade --ruffle");
        assert_eq!(cli.plugin.as_deref(), Some("flash-arcade"));
        assert_eq!(cli.engine.unwrap().engine, Engine::Ruffle);
        assert!(cli.problems.is_empty());
    }

    #[test]
    fn what_cannot_be_used_is_reported_and_the_rest_still_applies() {
        let cli = parse_str("--aqw --example-plugin --bogus=1 --game --ruffle=abc C:\\games\\x.swf");
        assert_eq!(cli.plugin.as_deref(), Some("aqw"));
        assert_eq!(cli.problems.len(), 4, "{:?}", cli.problems);
        assert!(cli.problems.iter().any(|p| p.contains("Only one plugin")));
        assert!(cli.problems.iter().any(|p| p.contains("Unknown option --bogus")));
        assert!(cli.problems.iter().any(|p| p.contains("--game needs")));
        assert!(cli.problems.iter().any(|p| p.contains("not a player version")));
        assert!(parse_str("--launcher --no-launcher").problems.iter().any(|p| p.contains("cannot be used together")));
        assert!(parse_str("--ruffle1.7=2.0").problems.len() == 1);
        assert_eq!(parse(&[]), Cli::default());
    }

    #[test]
    fn command_ids_cannot_shadow_built_in_words() {
        for good in ["aqw", "example-plugin", "flash-arcade", "a", "df2"] {
            assert!(valid_command_id(good), "{good}");
        }
        for bad in ["", "Aqw", "1aqw", "game", "launcher", "no-launcher", "ruffle", "flash", "ruffle1", "has space", "under_score", &"x".repeat(33)] {
            assert!(!valid_command_id(bad), "{bad}");
        }
    }

    #[test]
    fn versions_match_on_whole_components() {
        assert!(version_matches("1.7.0", "1.7"));
        assert!(version_matches("1.7.0", "1"));
        assert!(version_matches("1.7.0", "1.7.0"));
        assert!(version_matches("32.0.0.465", "32"));
        assert!(!version_matches("1.70.0", "1.7"));
        assert!(!version_matches("0.7.1", "1.7"));
    }
}
