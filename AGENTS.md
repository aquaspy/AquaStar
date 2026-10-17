# AquaStar – Agent Notes

Custom Electron 11 Flash (PPAPI) companion shell. Game-specific behavior lives in **plugins**; the bundled default is Adventure Quest Worlds (`plugins/adventure-quest-worlds/`).

Plugin authoring (full guide): [`docs/PLUGINS.md`](docs/PLUGINS.md). Architecture design: [`docs/design/plugin-architecture.md`](docs/design/plugin-architecture.md). Starter: `plugins/_template/`. Worked example: `plugins/example-companion/`. Smoke: `npm run smoke:plugins`.

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
- **Flash `webPreferences.plugins`:** `true` on game/wiki/charpage/studio windows; **`false`** on settings and on a plugin's list-style feature windows (the platform's windows are in `res/windows/config.js`; a plugin defines its own, e.g. `plugins/adventure-quest-worlds/windows.js`). Do not assume Flash is enabled on every window type.
- **One active plugin per process** (`activePluginId`); switching requires an app restart. `AQUASTAR_DISABLE_PLUGINS=1` or `"pluginSystem": false` is safe mode: only the bundled default plugin (the one whose manifest says `bundledDefault`) is activated. There is no legacy boot path and the platform has no built-in game.

## Architecture

| File | Purpose |
|------|---------|
| `main.js` | Entry point. Activates the selected plugin, creates main window, registers platform ad-block + plugin session rules, sets up menu |
| `res/platform/` | PluginHost, loader, manifest schema, session-rules applicator, namespaced store, menu registry |
| `plugins/adventure-quest-worlds/` | Bundled AQW plugin: URLs, session rules, navigation injections, menus/keybinds, features, Studio processes, locales, web contribute |
| `plugins/_template/` | Starter plugin for third-party games |
| `res/flash.js` | Picks platform/arch-specific PPAPI binary from `FlashPlayer/` and registers it with `app.commandLine.appendSwitch` |
| `res/const.js` | Core app-wide constants (no game URLs: those live in plugins; exposes `customSwfUrl` for the platform SWF override) |
| `res/instances.js` | Window factory, screenshot/charpage capture, context menus; delegates did-finish-load to plugin navigation hooks when set |
| `res/keybindings.js` | Registers app keybinds; Settings IPC for `aquastar.json` |
| `res/windows/config.js` | `BrowserWindow` configs for the platform's own windows (settings, game, browser). Plugins define their feature windows themselves (`host.registerFeatureWindows`) |
| `res/windows/menu.js` | Builds the app/context menu; Useful Pages prefer plugin menu registry when present |
| `res/ipc/recording.js` | Screen-recording IPC (platform-owned) |
| `res/customSwf.js` | Local SWF override (neutral file `custom-game.swf`; a plugin's manifest `customSwfAliases` adds older names) |
| `res/platform/helper-process.js` | Generic helper Electron processes: `host.windows.spawnHelperProcess` runs a bundled-plugin script via `--aquastar-helper=<path>` |
| `res/platform/session-rules.js`, `platform-rules.js` | One webRequest listener per event, shared by platform rules (ad blocking) and plugin rules |
| `res/features/settings/`, `capture/`, `common/` | Platform settings UI, capture preload, shared focus stylesheet |
| `plugins/adventure-quest-worlds/` | The bundled game plugin: URLs, session rules, windows, menus, keybinds, features, kits (`core/`, `ui/`, `features/common/`), Ruffle socket config, web tools site (`web/`), locales |

## Isolation rule

The platform (`main.js`, `res/`, shared tooling in `scripts/`) names no game. Anything specific to a game (URLs, windows, shortcuts, strings, kits, server lists, file names) lives in that game's plugin and reaches the platform only through the manifest and the Host API. `test/unit/platform-isolation.test.js` scans the platform for game names, so a leak fails the suite.

## Runtime behavior

- **Active plugin:** default `adventure-quest-worlds`. Change via Settings → Plugins (restart required) or `"activePluginId"` in `aquastar.json`.
- **Default AQW game URL:** `https://game.aq.com/game/gamefiles/Loader4.swf?ver=b` (built-in default in `plugins/adventure-quest-worlds/urls.js`). At startup the AQW plugin reads the loader Artix Game Launcher currently uses from `https://www.artix.com/gamelauncher` (`launcher-config.js`), validates it, caches it, and falls back to the built-in default. Turn off with `"liveLoaderUrl": false`. The launcher page, not its `app.asar`, is the source of truth.
- **Override:** Settings → Custom SWF File (stored as `custom-game.swf` in AppData), or drop a file there by hand. The AQW plugin also keeps accepting `aqlite_old.swf` (its manifest `customSwfAliases`). Platform primary-game override; takes priority over `customUrl`. Restart required.
- **Custom URL override:** `"customUrl"` in `aquastar.json` / Settings. Ignored when a custom SWF is present.
- **SWF logging:** `"swfLog": true` logs `game.aq.com/game/*` via the AQW plugin session rule.
- **Custom keybindings / plugin flags:** `aquastar.json` in appData (Settings Alt+9). See `aquastar_testing.json` and `KEYBINDING.md`.
- **Reminders (Alt+T):** AQW plugin feature. Stored in `aquastar_reminders.json`, seeded from `plugins/adventure-quest-worlds/features/reminders/reminders_default.json` on first run.
- **To-Do (Alt+Y):** AQW plugin feature. `aquastar_todo.json`. Shared list kit: `plugins/adventure-quest-worlds/features/common/list_window_common.js`.
- **Local plugins:** `%AppData%/AquaStar/plugins/<id>/` when `enableLocalPlugins` is true; must be trusted in Settings (full Node/Electron trust after prompt).

## Important quirks

- Game SWFs are loaded through **`res/swf_wrapper.html`**. The default `wmode` is `direct` (GPU direct-to-screen). macOS defaults `useDirectWmode` to false because that surface is invisible to F2, and the wrapper then uses `wmode=opaque`. A top-level SWF navigation is the wrong fallback: on a Retina display the Pepper plugin's preferred height is the stage divided by `devicePixelRatio` twice, so the movie sits in a short strip at the top of the window. `"useDirectWmode": true` in `aquastar.json` forces `wmode=direct`.
- **Background throttling is disabled** via Chromium flags in `res/flash.js` and `backgroundThrottling: false` on game/main windows.
- **F2 / Ctrl+J** use `globalShortcut` because Flash PPAPI consumes keyboard events before `before-input-event`.
- **WikiView's hover-preview image** is fetched from the main process (`plugins/adventure-quest-worlds/features/wikiview/wikiFetch.js`), not the renderer - a page-side `fetch()` to aqwwiki.wikidot.com from an account.aq.com window would be blocked by CORS.
- **Screen recording** saves WebM (VP8 preferred). Native MP4 is not supported on Chromium 87; upgrading to Electron 12+ drops Flash.
- **User-Agent** for `*.aq.com` requests is an AQW plugin policy (`plugins/adventure-quest-worlds/user-agent.js`, applied by its `artix-ua` session rule): it matches what Artix Game Launcher 2.2.0 actually sends, `... (KHTML, like Gecko) Safari/537.36` with no `Chrome/`, `Electron/` or app-name tokens (the launcher's `replace(/Artix.*\s/, '')` eats them), plus an `artixmode: launcher` header. The platform only passes the browser's own UA to rules as `ctx.defaultUserAgent`.
- **Ad blocking** blocks known ad domains only (aq.com traffic is not filtered). It is a platform-owned session rule (`res/platform/platform-rules.js`). All session rules, platform and plugin, go through `res/platform/session-rules.js`, which registers one listener per webRequest event, because Electron keeps only one and a second registration silently replaces the first.
- **Char Page Studio** runs in a second Electron process, launched by the AQW plugin through `host.windows.spawnHelperProcess` (platform side: `res/platform/helper-process.js`; only scripts inside the bundled `plugins/` tree may run that way). Its scripts live under `plugins/adventure-quest-worlds/processes/`.

## Testing checklist

Automated: `npm test` and `npm run smoke:plugins`.

**Manual PPAPI / UI:** follow and tick boxes in [`docs/FLASH_CHECKLIST.md`](docs/FLASH_CHECKLIST.md) (Example, AQW, F2/Ctrl+J/Alt+K, language, local plugins, pack).

## Build artifacts

- `dist/` – electron-builder output (gitignored)
- `work/` – `build.sh` temp folder (gitignored)
- `releases/` – `build.sh` final artifacts (gitignored)
- `AquaStar Screenshots/` – runtime screenshots (gitignored)
