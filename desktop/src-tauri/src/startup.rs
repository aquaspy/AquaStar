//! How AquaStar starts: the launcher, or straight into a game.
//!
//! The command line (`cli.rs`) and the saved start-up game decide which. Everything that
//! chooses is `decide`, a pure function; `apply` carries the decision out for the first
//! instance and for later instances that forward their arguments.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde_json::json;
use tauri::{Emitter, Manager};

use crate::cli::{self, Cli, EngineRequest, LauncherMode};
use crate::extensions::model::{Game, Manifest, Tool};
use crate::extensions::Extensions;
use crate::launcher;
use crate::players::{Arch, Engine, Os};

pub const EVENT: &str = "aquastar://start";

#[derive(Default)]
pub struct StartupState {
    direct: AtomicBool,
    launcher_requested: AtomicBool,
    show: Mutex<Option<String>>,
    notice: Mutex<Option<String>>,
}

impl StartupState {
    pub fn is_direct(&self) -> bool {
        self.direct.load(Ordering::SeqCst)
    }
    pub fn game_launching(&self) {
        self.launcher_requested.store(false, Ordering::SeqCst);
    }
    pub fn request_launcher(&self) {
        self.direct.store(false, Ordering::SeqCst);
        self.launcher_requested.store(true, Ordering::SeqCst);
    }
    pub fn launcher_requested(&self) -> bool {
        self.launcher_requested.load(Ordering::SeqCst)
    }
    fn set(&self, show: Option<String>, notice: Option<String>) {
        *self.show.lock().unwrap_or_else(|e| e.into_inner()) = show;
        *self.notice.lock().unwrap_or_else(|e| e.into_inner()) = notice;
    }
    /// Plugin page to open and message to show, once.
    pub fn take(&self) -> (Option<String>, Option<String>) {
        (
            self.show.lock().unwrap_or_else(|e| e.into_inner()).take(),
            self.notice.lock().unwrap_or_else(|e| e.into_inner()).take(),
        )
    }
}

#[derive(Clone, Copy)]
pub struct Plugin<'a> {
    pub manifest: &'a Manifest,
    pub bundled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Action {
    Game { game: String, engine: Option<EngineRequest> },
    Tool { tool: String },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Target {
    pub plugin: String,
    pub action: Action,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Decision {
    pub direct: Option<Target>,
    pub show_plugin: Option<String>,
    pub notice: Option<String>,
}

/// Games the launcher can open: every game of the bundled plugin, and the games an
/// installed plugin gave an action to.
pub fn playable<'a>(plugin: &Plugin<'a>) -> Vec<&'a Game> {
    plugin
        .manifest
        .games
        .iter()
        .filter(|game| plugin.bundled || launcher::action_for(plugin.manifest, "game", &game.id).is_some())
        .collect()
}

/// Tools the launcher can open: every tool of the bundled plugin, and the tools an installed
/// plugin gave an action to.
pub fn openable_tools<'a>(plugin: &Plugin<'a>) -> Vec<&'a Tool> {
    plugin
        .manifest
        .tools
        .iter()
        .filter(|tool| plugin.bundled || launcher::action_for(plugin.manifest, "tool", &tool.id).is_some())
        .collect()
}

pub fn default_game<'a>(plugin: &Plugin<'a>) -> Option<&'a Game> {
    let games = playable(plugin);
    plugin
        .manifest
        .launcher_parameters
        .as_ref()
        .and_then(|parameters| parameters.default_game.as_deref())
        .and_then(|id| games.iter().copied().find(|game| game.id == id))
        .or_else(|| games.first().copied())
}

/// Command id → plugin id. When two plugins ask for the same id the first keeps it
/// (the bundled plugin, then installed ones by id) and the other is reported.
pub fn command_table(plugins: &[Plugin]) -> (BTreeMap<String, String>, Vec<String>) {
    let mut table: BTreeMap<String, String> = BTreeMap::new();
    let mut problems = Vec::new();
    for plugin in plugins {
        let Some(parameters) = &plugin.manifest.launcher_parameters else {
            continue;
        };
        match table.get(&parameters.id) {
            Some(owner) => problems.push(format!(
                "{}: --{} is already used by {owner}, so this plugin has no command",
                plugin.manifest.id, parameters.id
            )),
            None => {
                table.insert(parameters.id.clone(), plugin.manifest.id.clone());
            }
        }
    }
    (table, problems)
}

fn engine_name(engine: Engine) -> &'static str {
    match engine {
        Engine::Ruffle => "Ruffle",
        Engine::Flash => "Flash Player",
    }
}

fn join(notes: Vec<String>) -> Option<String> {
    (!notes.is_empty()).then(|| notes.join(" "))
}

/// Whether the window can stay hidden while the decision is made. It only looks at the
/// words used, so it can run before any plugin is loaded.
pub fn probably_direct(cli: &Cli, has_saved: bool) -> bool {
    match cli.launcher {
        LauncherMode::Show => false,
        LauncherMode::Skip => true,
        // Naming a plugin shows the launcher on its page; only `--no-launcher` skips it. The
        // saved start-up game applies when nothing is named.
        LauncherMode::Default => cli.plugin.is_none() && has_saved,
    }
}

pub fn decide(
    cli: &Cli,
    saved: Option<(&str, &str)>,
    plugins: &[Plugin],
    os: Option<Os>,
    arch: Option<Arch>,
) -> Decision {
    let (table, _) = command_table(plugins);
    let find = |id: &str| plugins.iter().find(|plugin| plugin.manifest.id == id);
    let mut notes = cli.problems.clone();
    let asks_for_a_game = cli.game.is_some() || cli.tool.is_some() || cli.engine.is_some();

    let mut saved_game: Option<&str> = None;
    let plugin = if let Some(command) = &cli.plugin {
        match table.get(command).and_then(|id| find(id)) {
            Some(plugin) => Some(plugin),
            None => {
                let known: Vec<String> = table.keys().map(|c| format!("--{c}")).collect();
                notes.push(format!("No plugin answers to --{command}. Available: {}.", known.join(", ")));
                None
            }
        }
    } else if cli.launcher != LauncherMode::Show
        && (cli.launcher == LauncherMode::Skip || asks_for_a_game || saved.is_some())
    {
        match saved.and_then(|(plugin, game)| find(plugin).map(|plugin| (plugin, game))) {
            Some((plugin, game)) => {
                saved_game = Some(game);
                Some(plugin)
            }
            None => {
                if cli.launcher == LauncherMode::Skip || asks_for_a_game {
                    notes.push("No start-up game is set. Name a plugin, for example --aqw --no-launcher.".into());
                }
                None
            }
        }
    } else {
        None
    };
    let Some(plugin) = plugin else {
        return Decision { direct: None, show_plugin: None, notice: join(notes) };
    };
    let name = plugin.manifest.name.clone();
    let page = Some(plugin.manifest.id.clone());
    if cli.launcher == LauncherMode::Show {
        return Decision { direct: None, show_plugin: page, notice: join(notes) };
    }
    // `aquastar --aqw` shows the launcher on that plugin's page. Going straight to a game or
    // tool is what `--no-launcher` is for.
    if cli.plugin.is_some() && cli.launcher != LauncherMode::Skip {
        if asks_for_a_game {
            notes.push("Add --no-launcher to open it without the launcher.".into());
        }
        return Decision { direct: None, show_plugin: page, notice: join(notes) };
    }

    if let Some(wanted) = cli.tool.as_deref() {
        let tools = openable_tools(plugin);
        return match tools.iter().find(|tool| tool.id == wanted) {
            Some(tool) => Decision {
                direct: Some(Target {
                    plugin: plugin.manifest.id.clone(),
                    action: Action::Tool { tool: tool.id.clone() },
                }),
                show_plugin: None,
                notice: join(notes),
            },
            None => {
                let ids: Vec<&str> = tools.iter().map(|tool| tool.id.as_str()).collect();
                notes.push(format!(
                    "{name} has no tool \"{wanted}\". Tools: {}.",
                    if ids.is_empty() { "none".to_string() } else { ids.join(", ") }
                ));
                Decision { direct: None, show_plugin: page, notice: join(notes) }
            }
        };
    }

    let games = playable(plugin);
    let wanted = cli.game.as_deref().or(saved_game);
    let game = match wanted {
        Some(id) => match games.iter().copied().find(|game| game.id == id) {
            Some(game) => Some(game),
            None => {
                let ids: Vec<&str> = games.iter().map(|game| game.id.as_str()).collect();
                notes.push(format!(
                    "{name} has no game \"{id}\". Games: {}.",
                    if ids.is_empty() { "none".to_string() } else { ids.join(", ") }
                ));
                None
            }
        },
        None => default_game(plugin),
    };
    let Some(game) = game else {
        if games.is_empty() && wanted.is_none() {
            notes.push(format!("{name} has no game to open, so its page is shown."));
        }
        return Decision { direct: None, show_plugin: page, notice: join(notes) };
    };

    if let Some(request) = &cli.engine {
        let available = launcher::effective_engines(game, os, arch);
        let shipped = match (os, arch) {
            (Some(os), Some(arch)) => request.engine.version_on(os, arch),
            _ => None,
        };
        let problem = if !available.contains(&request.engine) {
            Some(format!("{} is not available for {} on this system.", engine_name(request.engine), game.name))
        } else {
            match (&request.version, &shipped) {
                (Some(wanted), Some(actual)) if !cli::version_matches(actual, wanted) => Some(format!(
                    "{} {wanted} is not available here; AquaStar ships {} {actual}.",
                    engine_name(request.engine),
                    engine_name(request.engine)
                )),
                _ => None,
            }
        };
        if let Some(problem) = problem {
            notes.push(problem);
            return Decision { direct: None, show_plugin: page, notice: join(notes) };
        }
    }

    Decision {
        direct: Some(Target {
            plugin: plugin.manifest.id.clone(),
            action: Action::Game { game: game.id.clone(), engine: cli.engine.clone() },
        }),
        show_plugin: None,
        notice: join(notes),
    }
}

pub fn show_main(app: &tauri::AppHandle) {
    app.state::<StartupState>().request_launcher();
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// In a direct start there is no launcher to go back to, so AquaStar ends when the last
/// window is closed and no game is running.
pub fn exit_when_finished(app: &tauri::AppHandle, closed: &str) {
    if app.state::<crate::capture::CaptureState>().active() { return; }
    if !app.state::<StartupState>().is_direct() {
        return;
    }
    if app.state::<crate::players::Players>().presence() == crate::players::Presence::Running {
        return;
    }
    let anything_open = app.webview_windows().into_iter().any(|(label, window)| {
        label != closed && window.is_visible().unwrap_or(false)
    });
    if !anything_open {
        app.exit(0);
    }
}

/// Carry out what the command line (or the saved start-up game) asks for.
/// `first` is the first instance; later instances forward their arguments here.
pub fn apply(app: &tauri::AppHandle, args: &[String], first: bool) {
    let parsed = cli::parse(args);
    let saved = launcher::config_dir(app).and_then(|dir| crate::ruffle::load_startup(&dir));
    let mut owned: Vec<(Manifest, bool)> = vec![(launcher::bundled().clone(), true)];
    owned.extend(app.state::<Extensions>().active_plugins().into_iter().map(|(manifest, _)| (manifest, false)));
    let plugins: Vec<Plugin> = owned.iter().map(|(manifest, bundled)| Plugin { manifest, bundled: *bundled }).collect();
    let saved_ref = saved.as_ref().map(|(plugin, game)| (plugin.as_str(), game.as_str()));
    let decision = decide(&parsed, saved_ref, &plugins, Os::host(), Arch::host());
    let state = app.state::<StartupState>();

    let Some(target) = decision.direct else {
        state.set(decision.show_plugin.clone(), decision.notice.clone());
        show_main(app);
        if !first {
            let _ = app.emit(EVENT, json!({ "plugin": decision.show_plugin, "notice": decision.notice }));
        }
        return;
    };
    if first {
        state.direct.store(true, Ordering::SeqCst);
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = match &target.action {
            Action::Game { game, engine } => {
                launcher::launch_target(&app, &target.plugin, game, engine.as_ref()).await
            }
            Action::Tool { tool } => launcher::launch_tool(&app, &target.plugin, tool).await,
        };
        if let Err(error) = result {
            let state = app.state::<StartupState>();
            state.direct.store(false, Ordering::SeqCst);
            state.set(Some(target.plugin.clone()), Some(error.clone()));
            show_main(&app);
            let _ = app.emit(EVENT, json!({ "plugin": target.plugin, "notice": error }));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::parse;

    const WIN: (Option<Os>, Option<Arch>) = (Some(Os::Windows), Some(Arch::X86_64));

    fn manifest(json: &str) -> Manifest {
        let manifest: Manifest = serde_json::from_str(json).unwrap();
        manifest.validate("3.0.0").unwrap();
        manifest
    }

    fn arcade() -> Manifest {
        manifest(
            r#"{"format":"aquastar-desktop-plugin","apiVersion":2,"id":"flash-arcade","name":"Flash Arcade","version":"1.0.0",
            "permissions":["launch"],
            "launcherParameters":{"id":"arcade","defaultGame":"tower"},
            "games":[{"id":"tower","name":"Tower","url":"https://example.com/t.swf"},
                     {"id":"plain","name":"Plain","url":"https://example.com/p.swf","engines":[{"engine":"flash"}]},
                     {"id":"hidden","name":"Hidden","url":"https://example.com/h.swf"}],
            "actions":[{"id":"p-tower","name":"Tower","kind":"game","target":"tower"},
                       {"id":"p-plain","name":"Plain","kind":"game","target":"plain"}]}"#,
        )
    }

    fn lone() -> Manifest {
        manifest(
            r#"{"format":"aquastar-desktop-plugin","apiVersion":2,"id":"companion","name":"Companion","version":"1.0.0",
            "launcherParameters":{"id":"example-plugin"}}"#,
        )
    }

    fn run(line: &str, saved: Option<(&str, &str)>) -> Decision {
        let (aqw, arcade, lone) = (launcher::bundled().clone(), arcade(), lone());
        let plugins = [
            Plugin { manifest: &aqw, bundled: true },
            Plugin { manifest: &arcade, bundled: false },
            Plugin { manifest: &lone, bundled: false },
        ];
        let args: Vec<String> = line.split_whitespace().map(str::to_string).collect();
        decide(&parse(&args), saved, &plugins, WIN.0, WIN.1)
    }

    fn direct(plugin: &str, game: &str, engine: Option<(Engine, Option<&str>)>) -> Decision {
        Decision {
            direct: Some(Target {
                plugin: plugin.into(),
                action: Action::Game {
                    game: game.into(),
                    engine: engine.map(|(engine, version)| EngineRequest { engine, version: version.map(str::to_string) }),
                },
            }),
            ..Decision::default()
        }
    }

    #[test]
    fn reopening_the_launcher_leaves_direct_mode_until_the_next_app_start() {
        let state = StartupState::default();
        state.direct.store(true, Ordering::SeqCst);
        state.game_launching();
        assert!(state.is_direct());
        assert!(!state.launcher_requested());
        state.request_launcher();
        assert!(!state.is_direct());
        assert!(state.launcher_requested());
        state.game_launching();
        assert!(!state.is_direct());
        assert!(!state.launcher_requested());
    }

    #[test]
    fn no_arguments_shows_the_launcher() {
        assert_eq!(run("", None), Decision::default());
    }

    #[test]
    fn naming_a_plugin_opens_its_default_game_with_the_requested_player() {
        assert_eq!(
            run("--aqw --no-launcher --ruffle1.7", None),
            direct("adventure-quest-worlds", "aqw", Some((Engine::Ruffle, Some("1.7"))))
        );
        assert_eq!(run("--aqw --no-launcher", None), direct("adventure-quest-worlds", "aqw", None));
        assert_eq!(
            run("--aqw --game=dragonfable --no-launcher", None),
            direct("adventure-quest-worlds", "dragonfable", None)
        );
        assert_eq!(run("--arcade --no-launcher", None), direct("flash-arcade", "tower", None), "the plugin's default game");
    }

    #[test]
    fn naming_a_plugin_alone_shows_its_page_and_player_options_ask_for_no_launcher() {
        let page = run("--aqw", None);
        assert_eq!(page.direct, None);
        assert_eq!(page.show_plugin.as_deref(), Some("adventure-quest-worlds"));
        assert_eq!(page.notice, None);
        let hinted = run("--aqw --ruffle1.7", None);
        assert_eq!(hinted.direct, None);
        assert!(hinted.notice.unwrap().contains("--no-launcher"));
        assert_eq!(run("--aqw --game=dragonfable", Some(("adventure-quest-worlds", "aqw"))).direct, None);
    }

    #[test]
    fn launcher_shows_the_plugin_page_instead() {
        let decision = run("--aqw --launcher", None);
        assert_eq!(decision.direct, None);
        assert_eq!(decision.show_plugin.as_deref(), Some("adventure-quest-worlds"));
        assert_eq!(decision.notice, None);
    }

    #[test]
    fn problems_fall_back_to_the_plugin_page_with_an_explanation() {
        let unknown = run("--nope", None);
        assert_eq!(unknown.direct, None);
        let notice = unknown.notice.unwrap();
        assert!(notice.contains("--nope") && notice.contains("--aqw") && notice.contains("--arcade"), "{notice}");

        let no_games = run("--example-plugin --no-launcher", None);
        assert_eq!(no_games.show_plugin.as_deref(), Some("companion"));
        assert!(no_games.notice.unwrap().contains("no game to open"));

        let wrong_game = run("--aqw --game=nope --no-launcher", None);
        assert_eq!(wrong_game.show_plugin.as_deref(), Some("adventure-quest-worlds"));
        assert!(wrong_game.notice.unwrap().contains("Games: aqw, dragonfable"));

        let no_action = run("--arcade --game=hidden --no-launcher", None);
        assert_eq!(no_action.direct, None, "a game without a launcher action is not playable");
    }

    #[test]
    fn player_requests_are_checked_against_the_platform_and_the_shipped_version() {
        let shipped = Engine::Ruffle.version_on(Os::Windows, Arch::X86_64).unwrap();
        let major_minor: String = shipped.split('.').take(2).collect::<Vec<_>>().join(".");
        assert!(run(&format!("--aqw --no-launcher --ruffle{major_minor}"), None).direct.is_some());
        let wrong = run("--aqw --no-launcher --ruffle9.9", None);
        assert_eq!(wrong.direct, None);
        assert!(wrong.notice.unwrap().contains("9.9 is not available"));
        let not_offered = run("--arcade --game=plain --no-launcher --ruffle", None);
        assert_eq!(not_offered.direct, None, "the game only lists Flash Player");
        assert!(not_offered.notice.unwrap().contains("Ruffle is not available for Plain"));
        assert!(run("--arcade --game=plain --no-launcher --flash", None).direct.is_some());
    }

    #[test]
    fn the_saved_startup_game_applies_unless_the_launcher_is_asked_for() {
        let saved = Some(("adventure-quest-worlds", "dragonfable"));
        assert_eq!(run("", saved), direct("adventure-quest-worlds", "dragonfable", None));
        assert_eq!(
            run("--ruffle", saved),
            direct("adventure-quest-worlds", "dragonfable", Some((Engine::Ruffle, None)))
        );
        assert_eq!(run("--launcher", saved).direct, None);
        assert_eq!(run("--aqw --no-launcher", saved), direct("adventure-quest-worlds", "aqw", None), "a named plugin wins");
        let gone = run("", Some(("removed-plugin", "x")));
        assert_eq!(gone, Decision::default(), "a saved game of a removed plugin quietly shows the launcher");
        let skip = run("--no-launcher", None);
        assert_eq!(skip.direct, None);
        assert!(skip.notice.unwrap().contains("No start-up game"));
    }

    fn tool(plugin: &str, tool: &str) -> Decision {
        Decision {
            direct: Some(Target { plugin: plugin.into(), action: Action::Tool { tool: tool.into() } }),
            ..Decision::default()
        }
    }

    #[test]
    fn a_tool_opens_directly_and_unknown_tools_fall_back_to_the_page() {
        assert_eq!(run("--aqw --no-launcher --tool=inventory", None), tool("adventure-quest-worlds", "inventory"));
        assert_eq!(run("--aqw --tool=todo --no-launcher", None), tool("adventure-quest-worlds", "todo"));
        let missing = run("--aqw --no-launcher --tool=nope", None);
        assert_eq!(missing.direct, None);
        assert_eq!(missing.show_plugin.as_deref(), Some("adventure-quest-worlds"));
        let notice = missing.notice.unwrap();
        assert!(notice.contains("no tool \"nope\"") && notice.contains("inventory, reminders, todo, strategy"), "{notice}");
        assert_eq!(run("--aqw --tool=inventory --launcher", None).direct, None, "--launcher shows the page");
        let saved = Some(("adventure-quest-worlds", "aqw"));
        assert_eq!(run("--tool=reminders", saved), tool("adventure-quest-worlds", "reminders"));
        let no_action = run("--arcade --no-launcher --tool=anything", None);
        assert_eq!(no_action.direct, None);
        assert!(no_action.notice.unwrap().contains("Tools: none"));
    }

    #[test]
    fn two_plugins_cannot_share_a_command() {
        let first = arcade();
        let mut second = arcade();
        second.id = "other-arcade".into();
        let plugins = [Plugin { manifest: &first, bundled: false }, Plugin { manifest: &second, bundled: false }];
        let (table, problems) = command_table(&plugins);
        assert_eq!(table.get("arcade").map(String::as_str), Some("flash-arcade"));
        assert_eq!(problems.len(), 1);
        assert!(problems[0].contains("other-arcade") && problems[0].contains("--arcade"));
    }

    #[test]
    fn the_window_stays_hidden_only_when_the_words_point_at_a_game() {
        assert!(!probably_direct(&parse(&[]), false));
        assert!(!probably_direct(&parse(&["--aqw".into()]), false), "naming a plugin shows its page");
        assert!(probably_direct(&parse(&["--aqw".into(), "--no-launcher".into()]), false));
        assert!(!probably_direct(&parse(&["--aqw".into()]), true), "a named plugin beats the saved game");
        assert!(probably_direct(&parse(&[]), true));
        assert!(!probably_direct(&parse(&["--launcher".into()]), true));
        assert!(probably_direct(&parse(&["--no-launcher".into()]), false));
    }
}
