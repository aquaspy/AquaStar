# AquaStar – Agent Notes

Custom Electron 11 Flash (PPAPI) companion shell. Game-specific behavior lives in **plugins**; the bundled default is Adventure Quest Worlds (`plugins/adventure-quest-worlds/`).

Plugin authoring (full guide): [`docs/PLUGINS.md`](docs/PLUGINS.md). Architecture design: [`docs/design/plugin-architecture.md`](docs/design/plugin-architecture.md). Starter: `plugins/_template/`.

## Commands

- `npm install` – install deps (Electron 11.5.0, electron-builder 22.14.x, nw-flash-trust, electron-localshortcut)
- `npm start` – run in dev
- `npm run dist` – package for current OS (`dist/`)
- `npm run dist-w` / `dist-l` / `dist-m` – Windows / Linux (AppImage + deb) / Mac (zip + dmg locally; CI builds zip only)
- `npm test` – run the dependency-free regression suite (domain, persistence, plugins, and window lifecycle)
- `npm run test:ci` – run tests followed by the local Windows packaging check
- `npm run web:build` / `web:preview` – build/serve the static tools site (plugin `contributeWebBuild`)
- `./build.sh` – **legacy local release script** for multi-arch Linux/Windows. Prefer GitHub Releases via tag (see below).
- **GitHub Release:** bump `version` in `package.json`, commit, then `git tag vX.Y.Z && git push origin vX.Y.Z` (matching the new version, e.g. current is `1.12.2`) — the Release workflow builds all platforms and attaches installers to the GitHub Release.

The test workflow runs `npm test` on pull requests and packages the Windows app separately.

## Critical constraints

- **Electron is pinned to `11.5.0`.** This is the last Electron release on Chromium 87, the final Chromium line that supports PPAPI Flash (removed in Chromium 88 / Electron 12+). Do not upgrade to Electron 12+ without a Flash alternative (e.g. Ruffle).
- **`asar: false` is required.** The PPAPI Flash plugin must exist as a real file on disk (`FlashPlayer/*.so`, `*.dll`, `*.plugin`). Electron passes the path directly to Chromium.
- **The app runs without `app.enableSandbox()`** in the main process because Electron needs filesystem access to locate the Flash plugin. Game/main windows use `sandbox: false` so PPAPI Flash loads; wiki/settings/reminders-style windows use `sandbox: true`.
- **Flash `webPreferences.plugins`:** `true` on game/wiki/charpage/studio windows; **`false`** on settings/reminders/todo/inventory/strategy (see `res/windows/config.js`). Do not assume Flash is enabled on every window type.
- **One active plugin per process** (`activePluginId`); switching requires an app restart. `AQUASTAR_DISABLE_PLUGINS=1` or `"pluginSystem": false` forces the legacy boot path.

## Architecture

| File | Purpose |
|------|---------|
| `main.js` | Entry point. Activates the selected plugin, creates main window, registers platform ad-block + plugin session rules, sets up menu |
| `res/platform/` | PluginHost, loader, manifest schema, session-rules applicator, namespaced store, menu registry |
| `plugins/adventure-quest-worlds/` | Bundled AQW plugin: URLs, session rules, navigation injections, menus/keybinds, features, Studio processes, locales, web contribute |
| `plugins/_template/` | Starter plugin for third-party games |
| `res/flash.js` | Picks platform/arch-specific PPAPI binary from `FlashPlayer/` and registers it with `app.commandLine.appendSwitch` |
| `res/const.js` | Core app-wide constants; AQW URL catalog re-exported from the plugin for migration callers |
| `res/instances.js` | Window factory, screenshot/charpage capture, context menus; delegates did-finish-load to plugin navigation hooks when set |
| `res/keybindings.js` | Registers app keybinds; Settings IPC for `aquastar.json` |
| `res/windows/config.js` | `BrowserWindow` configs + `file://` URLs (feature HTML may live under the active plugin tree) |
| `res/windows/menu.js` | Builds the app/context menu; Useful Pages prefer plugin menu registry when present |
| `res/ipc/recording.js` | Screen-recording IPC (platform-owned) |
| `res/ipc/wikiFetch.js` | Main-process fetch of AQW Wiki pages for WikiView (AQW plugin feature IPC) |
| `res/features/settings/`, `capture/`, `common/` | Platform settings UI, capture preload, shared list-window kit |
| `res/core/` | Parameterized kits (`list-state`, `reset-time`) with AQW defaults |

## Runtime behavior

- **Active plugin:** default `adventure-quest-worlds`. Change via Settings → Plugins (restart required) or `"activePluginId"` in `aquastar.json`.
- **Default AQW game URL:** `https://game.aq.com/game/gamefiles/Loader3.swf?ver=a` (plugin URL catalog).
- **Override:** Drop `aqlite_old.swf` in AppData (or legacy install dir), or use Settings → Custom SWF File. Platform primary-game override; takes priority over `customUrl`. Restart required.
- **Custom URL override:** `"customUrl"` in `aquastar.json` / Settings. Ignored when `aqlite_old.swf` is present.
- **SWF logging:** `"swfLog": true` logs `game.aq.com/game/*` via the AQW plugin session rule.
- **Custom keybindings / plugin flags:** `aquastar.json` in appData (Settings Alt+9). See `aquastar_testing.json` and `KEYBINDING.md`.
- **Reminders (Alt+T):** AQW plugin feature. Stored in `aquastar_reminders.json`, seeded from `plugins/adventure-quest-worlds/features/reminders/reminders_default.json` on first run.
- **To-Do (Alt+Y):** AQW plugin feature. `aquastar_todo.json`. Shared list kit: `res/features/common/list_window_common.js`.
- **Local plugins:** `%AppData%/AquaStar/plugins/<id>/` when `enableLocalPlugins` is true; must be trusted in Settings (full Node/Electron trust after prompt).

## Important quirks

- Game SWFs are loaded through **`res/swf_wrapper.html`** with `wmode=direct` (GPU direct-to-screen). Set `"useDirectWmode": false` in `aquastar.json` to disable the wrapper.
- **Background throttling is disabled** via Chromium flags in `res/flash.js` and `backgroundThrottling: false` on game/main windows.
- **F2 / Ctrl+J** use `globalShortcut` because Flash PPAPI consumes keyboard events before `before-input-event`.
- **WikiView's hover-preview image** is fetched from the main process (`res/ipc/wikiFetch.js`), not the renderer - a page-side `fetch()` to aqwwiki.wikidot.com from an account.aq.com window would be blocked by CORS.
- **Screen recording** saves WebM (VP8 preferred). Native MP4 is not supported on Chromium 87; upgrading to Electron 12+ drops Flash.
- **User-Agent** for `*.aq.com` requests matches Artix Game Launcher: native Chromium UA with any `Artix...` token stripped, plus `artixmode: launcher` header (no hardcoded ArtixGameLauncher string). Registered as an AQW plugin session rule when `pluginSystem` is on.
- **Ad blocking** blocks known ad domains only via `session.webRequest.onBeforeRequest` (aq.com traffic is not filtered) — platform-owned.
- **Char Page Studio** runs in a second Electron process (`--charpage-studio`); entrypoints live under `plugins/adventure-quest-worlds/processes/`.

## Testing checklist

After making changes:
1. `npm start` – verify the game loads and Flash works
2. Test `Alt+N` (new AQW window) and `Alt+1` (DragonFable)
3. Test `F2` screenshot saves to `Pictures/AquaStar Screenshots`
4. Test `Ctrl+J` screen recording saves WebM to a chosen path
5. Test `Alt+K` on a charpage (opens hidden 4K window, captures, closes)
6. Test `Alt+9` (Settings opens with General / Active plugin / Keybinds tabs; plugin fields like player/autoSync are on the plugin tab; primary SWF override + recording/Ruffle on General; keybind recording still saves)
7. Test `Alt+T` (Reminders opens; add a character and a quest, mark it done, restart the app, confirm it persisted)
8. Test `Alt+Y` (To-Do opens; add a character and a task with a wiki link, mark priority, mark complete, restart the app, confirm it persisted)
9. If modifying build/packaging, test `npm run pack` first (`--dir`, no installer)

## Build artifacts

- `dist/` – electron-builder output (gitignored)
- `work/` – `build.sh` temp folder (gitignored)
- `releases/` – `build.sh` final artifacts (gitignored)
- `AquaStar Screenshots/` – runtime screenshots (gitignored)
