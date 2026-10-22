# AquaStar NEO – Agent Notes

This tree is AquaStar NEO, the Tauri launcher. Read [`README.md`](README.md) for build commands and [`docs/REPOSITORY.md`](docs/REPOSITORY.md) for the repository map. The development plan is [`docs/neo-plan.md`](docs/neo-plan.md).

Classic AquaStar is the Electron app. It lives on `main` and `dev` and is not in this tree. Do not add Electron application code here.

NEO development is `neo-dev`. Stable NEO is `neo`. The version sequence starts at `1.0.0`. Tags use `neo-v*`. An `rc`, `alpha`, or `beta` tag is a prerelease. No NEO release is marked Latest. Do not create a release tag unless the owner asks for one.

The Cargo package and binary are `aquastar-neo`. The bundle identifier stays `io.github.aquaspy.aquastar-lite`. Do not rename the identifier without a data migration. Settings, portal grants, and shortcut bindings use that identifier.

## Working on NEO

- `ui/` is the shipped launcher and tool UI. Keep new launcher and plugin-manager UI in English. Design previews under `docs/design/` are not the shipped UI.
- `src-tauri/src/main.rs` wires commands, windows, menus and shortcuts. `players/` manages separate Flash/Ruffle processes. Do not embed the game into the launcher WebView.
- `account_sync.rs` owns manual and automatic account sync. `inventory.rs` parses and persists inventory and BuyBack data. Sync must work with the visible Account window (Alt+A) closed. Reuse the saved browser profile through the hidden `account-session` window when needed. Do not merge cookies from arbitrary WebViews or read only the root URL's cookies. Request cookies for each endpoint. Keep cookie access and HTTP work off the UI thread, preserve cached inventory on failure, and distinguish expired login from network, parse, and storage errors. Never log cookies or credentials.
- `menu_visibility.rs` controls the in-window menu bar. **Preferences → Show menu bar** defaults off on Linux and Windows and applies to existing and new windows. Keep keyboard shortcuts registered when the bar is hidden. On Linux, preserve the GTK menu widget’s `no_show_all` state so showing or restoring a window cannot reveal a hidden menu. macOS retains its system application menu and disables this preference.
- Ruffle defaults are **High** quality and **Automatic** graphics. Preserve valid saved choices. Platform-specific crash recovery is separate from the user's default graphics setting. See `README.md` and `players.json` before changing player arguments or compatibility.
- The only Ruffle pin is Artix 2.1.0 (`cli: artix`) on Linux x64, Windows x64, Windows ARM, and macOS. One universal macOS zip covers Apple silicon and Intel. The published macOS file is `Artix Games Launcher · Ruffle`, not `ruffle_desktop`. Windows artifacts are a zip of per-arch zips. The Flash projector is optional and is never the default. Linux i686 and Linux aarch64 have no player. Windows x86 prefers Flash. Do not pass `--performance-mode`. Artix's default is `auto`. A saved stock Ruffle marker in `settings.json` or `aquastar.json` migrates to `ruffle` without dropping other keys. Invalid settings JSON is left untouched. `--ruffle0.7` launches the shipped Artix pin. `--ruffle1.7` does not match 2.1.0.

### Game capture

- `capture/` owns screenshots, recording, and capture settings. Capture is a host feature. Only the launcher and the built-in `capture` control window receive its commands. Never grant them to plugin WebViews or account and wiki windows.
- Resolve targets from `Players.capture_pids()` and recheck window ownership. Studio's separate preview processes are not game targets. Use native window capture. Never silently fall back to monitor capture or whole-system audio.
- Native video frames feed the bundled minimal FFmpeg/OpenH264 sidecar. Keep encoding off the UI thread, buffers bounded, stderr bounded, and finalization time-limited.
- F2 and Ctrl+J must capture directly without creating or revealing controls or modal dialogs. Controls open only when asked. Status, errors, and Stop Recording also appear in launcher Preferences. Preserve active recording status if a concurrent screenshot fails.
- On GNOME Wayland without the GlobalShortcuts portal, capture shortcuts use an explicit opt-in custom-keybinding integration. Preserve unrelated GNOME settings, activate bindings only while a tracked game runs, and suspend them on exit. Never change desktop shortcuts without the user enabling this integration. Capture feedback must stay brief and avoid opening or focusing windows. Keep the Linux notification D-Bus connection alive across messages. GNOME binds source lifetime and replacement IDs to the sender. A successful Notify call alone does not prove a visible banner.
- Recordings are video only. Do not capture game, system, or microphone audio, and do not expose audio settings. Accept and ignore the legacy capture `audio` preference without resetting other settings.
- Capture must work with the launcher hidden and during direct startup. Finalize before automatic player-exit shutdown. A replacement player PID requires a new recording. Preserve recoverable temporary files on encoding failures.
- Build media with `python3 scripts/build-media.py`. Generated binaries belong in ignored `src-tauri/media/`. Source and compiler caches belong in the sibling workspace. Include the sidecars, architecture-specific notices, and source bundle when packaging. Debug overrides must not become production executable discovery.
- Wayland remembered authorization defaults on for new or missing preferences. Preserve explicit saved choices. The first window selection still requires the system permission dialog. Keep restore tokens out of WebView responses and logs, store them privately, consume and rotate them once, and bind them to PID, process start time, and boot identity. Never apply a remembered window grant to a replacement player. Turning it off forgets the local token. No idle capture stream should remain.
- See [capture behavior and validation](docs/CAPTURE.md). Native fixture success, cross-compilation, and CI are separate evidence from Mac permissions, Wayland compositor support, and real game-renderer tests.

### Plugin boundary

Desktop plugins use the isolated launcher API in `src-tauri/src/extensions/`. Read [the authoring guide](docs/DESKTOP-PLUGINS.md). The starter is `plugins/example-companion/`.

- AQW is the bundled plugin (`plugins/adventure-quest-worlds/plugin.json`, compiled in, not removable). Several plugins can be enabled together. Only the bundled plugin may use `builtin` tools, `resolver` games, and `menu:useful` link blocks. `launcher.rs` builds the launcher model from every active plugin. Keep the launcher declarative and never run plugin code in it.
- `example-companion` is also built in (`extensions/builtin.rs` embeds `plugins/example-companion/`). It runs through the normal plugin pipeline, so keep its sandbox identical to installed plugins. It cannot be disabled or removed. `AQUASTAR_DISABLE_PLUGINS=1` leaves it active, as it does for AQW.
- Start-up is decided by `startup.rs` (`decide`, pure and unit-tested) from `cli.rs` and the saved `startup` setting. Naming a plugin shows its launcher page. `--no-launcher` goes straight to its game or tool (`--<plugin> --tool=<id> --no-launcher`). The app ends when the last window of a direct start closes (`exit_when_finished`). A plugin names itself on the command line with `launcherParameters.id`, never with its stable `id`. When starting straight into a game, `main` is created hidden (`probably_direct`) and `sync_launcher` exits with the game. Any fallback must show the launcher with a message.
- Char Page Studio (`studio.rs`, `ui/features/studio/`) is a built-in tool of the AQW plugin. It runs Ruffle in a separate window with `-P` FlashVars and `--dummy-external-interface`, outside `Players` tracking (no presence or launcher hiding), and captures with Win32 `PrintWindow` on Windows only. Keep the preview process killed with the Studio window and on exit.
- Never build a `WebviewWindow` on the main thread. Synchronous commands and menu handlers run there and deadlock on Windows. Window-opening commands are `async`. Handlers use `spawn_tool` and `open_dialog`. ZIP installation, updates, enable, disable, and removal apply after an explicit restart. Preserve plugin data unless removal explicitly requests deletion. Apply pending cleanup only after the single-instance plugin has established ownership of the process.
- Manifest contributions register games, links, tools, menus, and shortcuts. JavaScript runs only in on-demand tool WebViews, with a plugin-specific origin and a private browser context per tool. No Node runtime or background plugin runtime is provided.
- The SDK exposes only the caller's JSON storage, approved public HTTPS requests, declared actions, and host information. Derive identity from the actual native WebView, never a JavaScript-supplied plugin ID. Keep plugin access separate from account cookies, inventory, and other plugins.
- Preserve the narrow capabilities and permissions and the exhaustive command ACL built in `build.rs`. Hiding `window.__TAURI__` is not authorization. Keep CSP, navigation restrictions, per-tool data-directory keys, and valid-length custom schemes. Do not host untrusted plugin code in the privileged launcher.
- `AQUASTAR_DISABLE_PLUGINS=1` disables third-party plugins. Built-in AQW remains available. Do not reuse an Electron plugin installation directory.

### Commands and verification

Run these from the repository root unless noted:

- `bash scripts/build-local.sh --release` builds an optimized local binary. Append `--run` to launch. This requires Rust on PATH and the native dependencies in `README.md`.
- `cargo test --manifest-path src-tauri/Cargo.toml --locked -- --test-threads=1` runs the Rust regressions. Serialize native process and window tests. Parallel window tests can abort on X11.
- `cargo build --manifest-path src-tauri/Cargo.toml --locked --example extension-runtime-probe` builds the native plugin and menu probe.
- `python3 scripts/smoke/extensions.py --binary src-tauri/target/debug/examples/extension-runtime-probe` runs the probe on Linux and macOS. Use the `.exe` suffix and the available Python launcher on Windows. Linux requires an X display. CI uses Xvfb.
- `account-session-probe` in `src-tauri/examples/` exercises the hidden-session helper with synthetic cookies and fixture inventory responses. It also loads the anonymous HTTPS account page, requires an isolated profile and `AQUASTAR_ACCOUNT_PROBE_OUTPUT`, and does not prove authenticated sync with a real account.
- Native plugin and menu checks run in `.github/workflows/extensions-check.yml` for Linux, Windows, and macOS. A prepared workflow is not evidence that those platforms passed. Inspect the actual run results before release claims.

For sync changes, test Alt+I without a visible Alt+A window, reuse of the hidden session, expired login, cache preservation, and button recovery after an error. For menu changes, test default visibility, saved state, existing and new windows, and shortcuts while hidden. Run the native isolation probe when changing plugin, window, or permission boundaries. Mock UI tests alone do not establish native isolation.

Prefer local builds for iterative testing. Keep artifacts outside the checkout. Ask the tester to close the previous launcher before opening a new build. Single-instance handling can otherwise focus the old binary. A local preview's version string may match an existing tag. Verify the source ref rather than claiming a published release contains untagged changes.

## Branches and build artifacts

`neo-dev` is development. `neo` is stable NEO. CI workflows in this tree trigger on those two branches. The release workflow triggers on `neo-v*` tags and always passes `--latest=false`.

- `src-tauri/target/` is Rust build output (gitignored).
- `src-tauri/permissions/autogenerated/` is generated command permissions (gitignored).
- Local test builds and package snapshots belong outside the checkout. Do not delete SWFs or source assets during cleanup.
