# AquaStar – Agent Notes

AquaStar 3.0 is the Tauri launcher in `desktop/` on `dev`. Read [`desktop/README.md`](desktop/README.md) for its build commands and [`docs/REPOSITORY.md`](docs/REPOSITORY.md) for the repository map. Electron 2.x is maintained separately on `2.x` and `2.x-dev`. The root Electron code remains here because 3.0 still consumes shared plugin assets; its commands and constraints below apply when working on that code.

## Working on 3.x (Tauri)

- `desktop/ui/` is the shipped launcher and tool UI. Keep new launcher and plugin-manager UI in English. Design previews under `docs/design/` are not the shipped UI.
- `desktop/src-tauri/src/main.rs` wires commands, windows, menus and shortcuts. `players/` manages separate Flash/Ruffle processes; do not embed the game into the launcher WebView.
- `account_sync.rs` owns manual and automatic account sync; `inventory.rs` parses and persists inventory/BuyBack data. Sync must work with the visible Account window (Alt+A) closed: reuse the saved browser profile through the hidden `account-session` window when needed. Do not merge cookies from arbitrary WebViews or read only the root URL's cookies; request cookies for each endpoint. Keep cookie access and HTTP work off the UI thread, preserve cached inventory on failure, and distinguish expired login from network/parse/storage errors. Never log cookies or credentials.
- `menu_visibility.rs` controls the in-window menu bar. **Preferences → Show menu bar** defaults off on Linux/Windows and applies to existing and new windows. Keep keyboard shortcuts registered when the bar is hidden. macOS retains its system application menu and disables this preference.
- Ruffle defaults are **High** quality and **Automatic** graphics. Preserve valid saved choices. Platform-specific crash recovery is separate from the user's default graphics setting. See `desktop/README.md` and the pinned player catalog before changing player arguments or compatibility.
- Public branding is AquaStar and the source directory is `desktop/`. Internal names such as the `aquastar-lite` binary/Cargo package and `io.github.aquaspy.aquastar-lite` identifier remain for compatibility; do not rename them without a data/resource migration.

### Game capture

- `capture/` owns screenshots, recording and capture settings. Capture is a host feature: only the launcher and built-in `capture` control window receive its commands. Never grant them to plugin WebViews or account/wiki windows.
- Resolve targets from `Players.capture_pids()` and recheck window ownership. Studio's separate preview processes are not game targets. Use native window capture; never silently fall back to monitor capture or whole-system audio.
- Native video frames and isolated game audio feed the bundled minimal FFmpeg/OpenH264 sidecar. Keep encoding off the UI thread, buffers bounded, stderr bounded and finalization time-limited. Keep the audio/video clocks aligned through silence; finalize audio before waiting for video flush.
- F2/Ctrl+J must capture directly without creating/revealing controls or modal AquaStar dialogs. Controls are opened only explicitly; status/errors and Stop Recording also appear in the existing launcher Preferences. Preserve active recording status if a concurrent screenshot fails.
- On GNOME Wayland without the GlobalShortcuts portal, capture shortcuts use an explicit opt-in custom-keybinding integration. Preserve unrelated GNOME settings, activate bindings only while a tracked game runs, and suspend them on exit. Never change desktop shortcuts without the user enabling this integration. Capture feedback must stay brief and avoid opening/focusing windows.
- Capture must work with the launcher hidden and during direct startup. Finalize before automatic player-exit shutdown. A replacement player PID requires a new recording. Preserve recoverable temporary files on encoding failures.
- Build media with `python3 desktop/scripts/build-media.py`; generated binaries belong in ignored `src-tauri/media/`, source/compiler caches in the sibling workspace. Include the sidecars, architecture-specific notices and source bundle when packaging. Debug overrides must not become production executable discovery.
- Wayland remembered authorization is opt-in. Keep restore tokens out of WebView responses/logs, store them privately, consume/rotate them once, and bind them to PID + process start time + boot identity. Never apply a remembered window grant to a replacement player. Turning it off forgets the local token; no idle capture stream should remain.
- See [capture behavior and validation](docs/CAPTURE.md). Native fixture success, cross-compilation and CI are separate evidence from Mac permissions, Wayland compositor support and real game-renderer tests.

### Desktop plugin boundary

Desktop plugins use the isolated launcher API in `desktop/src-tauri/src/extensions/`. Read [the authoring guide](docs/DESKTOP-PLUGINS.md); the starter is `desktop/plugins/example-companion/`. They are independent of the Electron plugin host described below.

- AQW is the bundled desktop plugin (`desktop/plugins/adventure-quest-worlds/plugin.json`, compiled in, not removable); multiple desktop plugins can be enabled together. Only the bundled plugin may use `builtin` tools, `resolver` games and `menu:useful` link blocks. `launcher.rs` builds the launcher model from every active plugin; keep the launcher declarative and never run plugin code in it.
- `example-companion` is also built in (`extensions/builtin.rs` embeds `desktop/plugins/example-companion/`). It runs through the normal plugin pipeline, so keep its sandbox identical to installed plugins; it cannot be disabled or removed, and `AQUASTAR_DISABLE_PLUGINS=1` leaves it active like AQW.
- Start-up is decided by `startup.rs` (`decide`, pure and unit-tested) from `cli.rs` and the saved `startup` setting. Naming a plugin shows its launcher page; `--no-launcher` goes straight to its game or tool (`--<plugin> --tool=<id> --no-launcher`); the app ends when the last window of a direct start closes (`exit_when_finished`). A plugin names itself on the command line with `launcherParameters.id`, never with its stable `id`. When starting straight into a game, `main` is created hidden (`probably_direct`) and `sync_launcher` exits with the game; any fallback must show the launcher with a message.
- Char Page Studio (`studio.rs`, `ui/features/studio/`) is a built-in tool of the AQW plugin. It runs Ruffle in a separate window with `-P` FlashVars and `--dummy-external-interface`, outside the `Players` tracking (no presence/launcher hiding), and captures with Win32 `PrintWindow` on Windows only. Keep the preview process killed with the Studio window and on exit.
- Never build a `WebviewWindow` on the main thread: synchronous commands and menu handlers run there and deadlock on Windows. Window-opening commands are `async`; handlers use `spawn_tool`/`open_dialog`. ZIP installation, updates, enable/disable and removal apply after an explicit restart. Preserve plugin data unless removal explicitly requests deletion. Apply pending cleanup only after the single-instance plugin has established ownership of the process.
- Manifest contributions register games, links, tools, menus and shortcuts. JavaScript runs only in on-demand tool WebViews, with a plugin-specific origin and a private browser context per tool. No Node runtime or background plugin runtime is provided.
- The SDK exposes only the caller's JSON storage, approved public HTTPS requests, declared actions and host information. Derive identity from the actual native WebView, never a JavaScript-supplied plugin ID. Keep plugin access separate from account cookies, inventory and other plugins.
- Preserve the narrow capabilities/permissions and exhaustive command ACL built in `build.rs`. Hiding `window.__TAURI__` is not authorization. Keep CSP, navigation restrictions, per-tool data-directory keys and valid-length custom schemes; do not host untrusted plugin code in the privileged launcher.
- `AQUASTAR_DISABLE_PLUGINS=1` disables third-party desktop plugins; built-in AQW remains available. Do not import Electron trust decisions or reuse its plugin installation directory.

### Desktop commands and verification

Run these from the repository root unless noted:

- `bash desktop/scripts/build-local.sh --release` – optimized local build; append `--run` to launch. This requires Rust on PATH and the native dependencies described in `desktop/README.md` (or the configured local SDK).
- `cargo test --manifest-path desktop/src-tauri/Cargo.toml --locked -- --test-threads=1` – Rust regressions; serialize native process/window tests.
- `cargo build --manifest-path desktop/src-tauri/Cargo.toml --locked --example extension-runtime-probe` – build the native plugin/menu probe.
- `python3 desktop/scripts/smoke/extensions.py --binary desktop/src-tauri/target/debug/examples/extension-runtime-probe` – run the probe on Linux/macOS; use the `.exe` suffix and available Python launcher on Windows. Linux requires an X display; CI uses Xvfb.
- `account-session-probe` in `desktop/src-tauri/examples/` exercises the real hidden-session helper with synthetic cookies and fixture inventory responses. It also loads the anonymous HTTPS account page, requires an isolated profile and `AQUASTAR_ACCOUNT_PROBE_OUTPUT`, and does not prove authenticated sync with a real account.
- Native plugin/menu checks run in `.github/workflows/extensions-check.yml` for Linux, Windows and macOS. A prepared workflow is not evidence that those platforms passed; inspect the actual run results before release claims.

For sync changes, test Alt+I without a visible Alt+A window, reuse of the hidden session, expired login, cache preservation and button recovery after an error. For menu changes, test default visibility, saved state, existing/new windows and shortcuts while hidden. Run the native isolation probe when changing plugin, window or permission boundaries. Mock UI tests alone do not establish native isolation.

Prefer local builds for iterative user testing. Keep artifacts outside the checkout as described below, and ask the tester to close the previous launcher before opening a new build: single-instance handling can otherwise focus the old binary. A local preview's version string may match an existing tag; verify the source/ref rather than claiming the published release contains untagged changes.

## Working on 2.x (Electron)

Game-specific Electron behavior lives in **plugins**; the bundled default is Adventure Quest Worlds (`plugins/adventure-quest-worlds/`).

Plugin authoring (full guide): [`docs/PLUGINS.md`](docs/PLUGINS.md). Architecture design: [`docs/design/plugin-architecture.md`](docs/design/plugin-architecture.md). Starter: `plugins/_template/`. Worked example: `plugins/example-companion/`. Smoke: `npm run smoke:plugins`.

### Electron commands

- `npm install` – install the dependencies declared in `package.json`; Electron remains pinned to 11.5.0
- `npm start` – run in dev
- `npm run dist` – package for current OS (`dist/`)
- `npm run dist-w` / `dist-l` / `dist-m` – Windows / Linux (AppImage + deb) / Mac (zip + dmg locally; CI builds zip only)
- `npm test` – run the dependency-free regression suite (domain, persistence, plugins, and window lifecycle)
- `npm run test:ci` – run unit tests, plugin smoke checks and packaging for the current host
- `npm run web:build` / `web:preview` – build/serve the static tools site (plugin `contributeWebBuild`)
- `./scripts/build-all-arch.sh` – **legacy local release script** for multi-arch Linux/Windows. Prefer GitHub Releases via tag (see below).
- **GitHub Release:** follow [`docs/aquastar-3.0-plan.md`](docs/aquastar-3.0-plan.md). The Electron workflow handles 2.x tags; the Tauri workflow handles 3.x tags. Stable publication, changing Latest, and merging to `main` remain pending explicit approval. A local build does not authorize tagging a release.

The test workflow runs `npm test` on pull requests and packages the Windows app separately.

### Electron constraints

- **Electron is pinned to `11.5.0`.** This is the last Electron release on Chromium 87, the final Chromium line that supports PPAPI Flash (removed in Chromium 88 / Electron 12+). Do not upgrade to Electron 12+ without a Flash alternative (e.g. Ruffle).
- **`asar: false` is required.** The PPAPI Flash plugin must exist as a real file on disk (`FlashPlayer/*.so`, `*.dll`, `*.plugin`). Electron passes the path directly to Chromium.
- **The app runs without `app.enableSandbox()`** in the main process because Electron needs filesystem access to locate the Flash plugin. Game/main windows use `sandbox: false` so PPAPI Flash loads; wiki/settings/reminders-style windows use `sandbox: true`.
- **Flash `webPreferences.plugins`:** `true` on game/wiki/charpage/studio windows; **`false`** on settings and on a plugin's list-style feature windows (the platform's windows are in `res/windows/config.js`; a plugin defines its own, e.g. `plugins/adventure-quest-worlds/windows.js`). Do not assume Flash is enabled on every window type.
- **One active plugin per process** (`activePluginId`); switching requires an app restart. `AQUASTAR_DISABLE_PLUGINS=1` or `"pluginSystem": false` is safe mode: only the bundled default plugin (the one whose manifest says `bundledDefault`) is activated. There is no legacy boot path and the platform has no built-in game.

### Electron architecture

| File                                                 | Purpose                                                                                                                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.js`                                            | Entry point. Activates the selected plugin, creates main window, registers platform ad-block + plugin session rules, sets up menu                                                   |
| `res/platform/`                                      | PluginHost, loader, manifest schema, session-rules applicator, namespaced store, menu registry                                                                                      |
| `plugins/_template/`                                 | Starter plugin for third-party games                                                                                                                                                |
| `res/flash.js`                                       | Picks platform/arch-specific PPAPI binary from `FlashPlayer/` and registers it with `app.commandLine.appendSwitch`                                                                  |
| `res/const.js`                                       | Core app-wide constants (no game URLs: those live in plugins; exposes `customSwfUrl` for the platform SWF override)                                                                 |
| `res/instances.js`                                   | Window factory, screenshot/charpage capture, context menus; delegates did-finish-load to plugin navigation hooks when set                                                           |
| `res/keybindings.js`                                 | Registers app keybinds; Settings IPC for `aquastar.json`                                                                                                                            |
| `res/windows/config.js`                              | `BrowserWindow` configs for the platform's own windows (settings, game, browser). Plugins define their feature windows themselves (`host.registerFeatureWindows`)                   |
| `res/windows/menu.js`                                | Builds the app/context menu; Useful Pages prefer plugin menu registry when present                                                                                                  |
| `res/ipc/recording.js`                               | Screen-recording IPC (platform-owned)                                                                                                                                               |
| `res/customSwf.js`                                   | Local SWF override (neutral file `custom-game.swf`; a plugin's manifest `customSwfAliases` adds older names)                                                                        |
| `res/platform/helper-process.js`                     | Generic helper Electron processes: `host.windows.spawnHelperProcess` runs a bundled-plugin script via `--aquastar-helper=<path>`                                                    |
| `res/platform/session-rules.js`, `platform-rules.js` | One webRequest listener per event, shared by platform rules (ad blocking) and plugin rules                                                                                          |
| `res/features/settings/`, `capture/`, `common/`      | Platform settings UI, capture preload, shared focus stylesheet                                                                                                                      |
| `plugins/adventure-quest-worlds/`                    | The bundled game plugin: URLs, session rules, windows, menus, keybinds, features, kits (`core/`, `ui/`, `features/common/`), Ruffle socket config, web tools site (`web/`), locales |

### Electron isolation rule

The Electron platform (`main.js`, `res/`, shared tooling in `scripts/`) names no game. Anything specific to a game (URLs, windows, shortcuts, strings, kits, server lists, file names) lives in that game's plugin and reaches the platform only through the manifest and the Host API. `test/unit/platform-isolation.test.js` scans the platform for game names, so a leak fails the suite.

### Electron runtime behavior

- **Active plugin:** default `adventure-quest-worlds`. Change via Settings → Plugins (restart required) or `"activePluginId"` in `aquastar.json`.
- **Default AQW game URL:** `https://game.aq.com/game/gamefiles/Loader4.swf?ver=b` (built-in default in `plugins/adventure-quest-worlds/urls.js`). At startup the AQW plugin reads the loader Artix Game Launcher currently uses from `https://www.artix.com/gamelauncher` (`launcher-config.js`), validates it, caches it, and falls back to the built-in default. Turn off with `"liveLoaderUrl": false`. The launcher page, not its `app.asar`, is the source of truth.
- **Override:** Settings → Custom SWF File (stored as `custom-game.swf` in AppData), or drop a file there by hand. The AQW plugin also keeps accepting `aqlite_old.swf` (its manifest `customSwfAliases`). Platform primary-game override; takes priority over `customUrl`. Restart required.
- **Custom URL override:** `"customUrl"` in `aquastar.json` / Settings. Ignored when a custom SWF is present.
- **SWF logging:** `"swfLog": true` logs `game.aq.com/game/*` via the AQW plugin session rule.
- **Custom keybindings / plugin flags:** `aquastar.json` in appData (Settings Alt+9). See [`docs/examples/aquastar.json`](docs/examples/aquastar.json) and `KEYBINDING.md`.
- **Reminders (Alt+T):** AQW plugin feature. Stored in `aquastar_reminders.json`, seeded from `plugins/adventure-quest-worlds/features/reminders/reminders_default.json` on first run.
- **To-Do (Alt+Y):** AQW plugin feature. `aquastar_todo.json`. Shared list kit: `plugins/adventure-quest-worlds/features/common/list_window_common.js`.
- **Local plugins:** `%AppData%/AquaStar/plugins/<id>/` when `enableLocalPlugins` is true; must be trusted in Settings (full Node/Electron trust after prompt).
- **Inventory sync:** uses `net.request` with `session.defaultSession` and `useSessionCookies: true`; it does not obtain its session from an open Account window. Do not copy Tauri's hidden-window workaround into Electron without reproducing an Electron-specific failure.

### Electron quirks

- Game SWFs are loaded through **`res/swf_wrapper.html`**. The default `wmode` is `direct` (GPU direct-to-screen). macOS defaults `useDirectWmode` to false because that surface is invisible to F2, and the wrapper then uses `wmode=opaque`. A top-level SWF navigation is the wrong fallback: on a Retina display the Pepper plugin's preferred height is the stage divided by `devicePixelRatio` twice, so the movie sits in a short strip at the top of the window. `"useDirectWmode": true` in `aquastar.json` forces `wmode=direct`.
- **Background throttling is disabled** via Chromium flags in `res/flash.js` and `backgroundThrottling: false` on game/main windows.
- **F2 / Ctrl+J** use `globalShortcut` because Flash PPAPI consumes keyboard events before `before-input-event`.
- **WikiView's hover-preview image** is fetched from the main process (`plugins/adventure-quest-worlds/features/wikiview/wikiFetch.js`), not the renderer - a page-side `fetch()` to aqwwiki.wikidot.com from an account.aq.com window would be blocked by CORS.
- **Screen recording** saves WebM (VP8 preferred). Native MP4 is not supported on Chromium 87; upgrading to Electron 12+ drops Flash.
- **User-Agent** for `*.aq.com` requests is an AQW plugin policy (`plugins/adventure-quest-worlds/user-agent.js`, applied by its `artix-ua` session rule): it matches what Artix Game Launcher 2.2.0 actually sends, `... (KHTML, like Gecko) Safari/537.36` with no `Chrome/`, `Electron/` or app-name tokens (the launcher's `replace(/Artix.*\s/, '')` eats them), plus an `artixmode: launcher` header. The platform only passes the browser's own UA to rules as `ctx.defaultUserAgent`.
- **Ad blocking** blocks known ad domains only (aq.com traffic is not filtered). It is a platform-owned session rule (`res/platform/platform-rules.js`). All session rules, platform and plugin, go through `res/platform/session-rules.js`, which registers one listener per webRequest event, because Electron keeps only one and a second registration silently replaces the first.
- **Char Page Studio** runs in a second Electron process, launched by the AQW plugin through `host.windows.spawnHelperProcess` (platform side: `res/platform/helper-process.js`; only scripts inside the bundled `plugins/` tree may run that way). Its scripts live under `plugins/adventure-quest-worlds/processes/`.

### Electron testing checklist

Automated: `npm test` and `npm run smoke:plugins`.

**Manual PPAPI / UI:** follow and tick boxes in [`docs/FLASH_CHECKLIST.md`](docs/FLASH_CHECKLIST.md) (Example, AQW, F2/Ctrl+J/Alt+K, language, local plugins, pack).

## Branches, releases and build artifacts

The retained branches are `main`, `dev`, `2.x` and `2.x-dev`. Development of 3.x belongs on `dev`; maintenance of Electron belongs on `2.x-dev`. `main` has not received the 3.x application merge yet. Do not copy Tauri-only instructions into a maintenance checkout that has no `desktop/` tree.

Stable publication, changing GitHub Latest and merging the 3.x application into `main` remain subject to the user's explicit authorization. Local builds and documentation updates do not authorize those actions. Public release filenames use AquaStar. Debian package identities remain distinct (`aqua-star` for 3.x, `aquastar` for 2.x); use `scripts/normalize-deb-version.py` to ensure candidate control versions sort below stable (`~rc`), without renaming the public artifact.

- `desktop/src-tauri/target/` – Rust build output (gitignored)
- `desktop/src-tauri/permissions/autogenerated/` – generated command permissions (gitignored)
- Local test builds, SDK files and branch-history backups belong outside the checkout, conventionally in the sibling `AquaStar-workspace/`. Do not delete bundled players, SWFs or shared source assets during cleanup.

- `dist/` – electron-builder output (gitignored)
- `work-<platform>-<arch>/` – `scripts/build-arch.sh` staging folders (gitignored); `work/` is the older staging path
- `releases/` – `scripts/build-all-arch.sh` final artifacts (gitignored)
- `AquaStar Screenshots/` – runtime screenshots (gitignored)
