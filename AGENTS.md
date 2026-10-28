# AquaStar – Agent Notes

This checkout is the `electron-experimental` branch. It is an experiment, not a release. `main` is classic stable. `dev` is classic development (Electron 11.5.0 and PPAPI Flash). Do not merge this branch into those, and do not publish tags from it. AquaStar NEO is a separate product on `neo` and `neo-dev` and is not in this tree. See [`docs/REPOSITORY.md`](docs/REPOSITORY.md) for the repository map.

Electron 45 companion shell. Game SWFs run in the pinned Ruffle web player under `res/ruffle/` (see `res/ruffle/PROVENANCE` and `ruffle/RUFFLE_COMMIT`). Game-specific behavior lives in **plugins**; the bundled default is Adventure Quest Worlds (`plugins/adventure-quest-worlds/`).

Plugin authoring (full guide): [`docs/PLUGINS.md`](docs/PLUGINS.md). Architecture design: [`docs/design/plugin-architecture.md`](docs/design/plugin-architecture.md). Starter: `plugins/_template/`. Worked example: `plugins/example-companion/`. Smoke: `npm run smoke:plugins`.

## Commands

- `npm install` – install deps (Electron 45.1.0, electron-builder 26.18.0, electron-localshortcut). If the Electron binary is missing because install scripts were skipped, run `node node_modules/electron/install.js`.
- `npm start` – run in dev
- `npm run dist` – package for current OS (`dist/`)
- `npm run dist-w` / `dist-l` / `dist-m` – Windows / Linux (AppImage + deb) / Mac (zip + dmg locally; CI builds zip only)
- `npm test` – run the dependency-free regression suite (domain, persistence, plugins, and window lifecycle)
- `npm run test:ci` – run tests followed by the local Windows packaging check
- `npm run web:build` / `web:preview` – build/serve the static tools site (plugin `contributeWebBuild`)
- `./scripts/build-all-arch.sh` – **legacy local release script** for multi-arch Linux/Windows. Prefer GitHub Releases via tag (see below).
- **GitHub Release:** the Electron release workflow handles `v*` tags on this line. It does not build AquaStar NEO. NEO tags use `neo-v*` and are published from the `neo` branch. Publishing a stable release requires explicit user approval. Local builds and repository organization do not authorize release tags or changes to GitHub Latest.

The test workflow runs `npm test` on pull requests and packages the Windows app separately.

## Critical constraints

- **Electron is 45.1.0** with electron-builder 26.18.0. PPAPI Flash is gone. Do not bring back `FlashPlayer/`, `ppapi-flash-path`, or `nw-flash-trust`.
- **The app is packed in an asar.** The renderer loads Ruffle through `aquastar://ruffle/`, and the main process reads that archive. Nothing is unpacked unless a file must exist on disk for a tool that cannot read the archive.
- **`contextIsolation: true` and `nodeIntegration: false`.** Renderers talk to the main process through preloads and `contextBridge`. Do not add `@electron/remote`.
- **The Chromium sandbox stays on.** Game, main, settings, list, char-page print, and Char Page Studio windows use `sandbox: true` with `webSecurity` left on. Char pages and the Studio load the player from `aquastar://ruffle/` (`res/platform/ruffle-origin.js`). The plugin passes the origins allowed to read it. Linux packages do not pass `--no-sandbox`. The AppImage launcher adds that flag only when `unshare -Ur` fails. The deb postinstall sets `chrome-sandbox` setuid only in that same case. If neither user namespaces nor a setuid helper is available, `res/platform/sandbox-fallback.js` appends `no-sandbox` before ready so the process still starts.
- **One active plugin per process** (`activePluginId`); switching requires an app restart. `AQUASTAR_DISABLE_PLUGINS=1` or `"pluginSystem": false` is safe mode: only the bundled default plugin (the one whose manifest says `bundledDefault`) is activated. There is no legacy boot path and the platform has no built-in game.
- **Do not replace `res/ruffle/` with a stock ruffle.rs download.** `PROVENANCE` makes `downloadLatest` return without writing files. The AQW patches are the port of toommyliu/ruffle onto Ruffle v0.7.1, applied from `ruffle/patches/` by `scripts/build-ruffle-web.sh`.

## Architecture

| File | Purpose |
|------|---------|
| `main.js` | Entry point. Activates the selected plugin, creates main window, registers platform ad-block + plugin session rules, sets up menu |
| `res/platform/` | PluginHost, loader, manifest schema, session-rules applicator, namespaced store, menu registry |
| `plugins/adventure-quest-worlds/` | Bundled AQW plugin: URLs, session rules, navigation injections, menus/keybinds, features, Studio processes, locales, web contribute |
| `plugins/_template/` | Starter plugin for third-party games |
| `res/flash.js` | No-op stub. Helper processes and tests still require the module. It does not register a plugin. |
| `res/ruffle/` | Vendored selfhosted web build of Ruffle v0.7.1 plus the toommyliu port (`ruffle.js`, one wasm, licenses, `PROVENANCE`) |
| `res/ruffle_wrapper.html` | Page that creates a `RufflePlayer` and calls `load`. Renderer order is left at Ruffle's default. |
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
- **Custom keybindings / plugin flags:** `aquastar.json` in appData (Settings Alt+9). See [`docs/examples/aquastar.json`](docs/examples/aquastar.json) and `KEYBINDING.md`.
- **Reminders (Alt+T):** AQW plugin feature. Stored in `aquastar_reminders.json`, seeded from `plugins/adventure-quest-worlds/features/reminders/reminders_default.json` on first run.
- **To-Do (Alt+Y):** AQW plugin feature. `aquastar_todo.json`. Shared list kit: `plugins/adventure-quest-worlds/features/common/list_window_common.js`.
- **Local plugins:** `%AppData%/AquaStar/plugins/<id>/` when `enableLocalPlugins` is true; must be trusted in Settings (full Node/Electron trust after prompt).

## Important quirks

- Game SWFs are loaded through **`res/ruffle_wrapper.html`**. Any URL that looks like a SWF uses Ruffle. A saved Flash or retired native player id in `aquastar.json` migrates to `ruffle`. `useDirectWmode` no longer changes how the movie is drawn. Ruffle draws a canvas, so capture does not depend on wmode.
- **Background throttling is disabled** with `backgroundThrottling: false` on game and main windows. The old Chromium command-line flags are gone. Minimizing a SWF window sets `renderingSuspended` and calls `releaseMemory` when the player exposes it.
- **F2 / Ctrl+J** use `globalShortcut` so a focused game window cannot swallow them.
- **WikiView's hover-preview image** is fetched from the main process (`plugins/adventure-quest-worlds/features/wikiview/wikiFetch.js`), not the renderer - a page-side `fetch()` to aqwwiki.wikidot.com from an account.aq.com window would be blocked by CORS.
- **Screen recording** (Ctrl+J) captures the game window's web contents with `getDisplayMedia` and saves MP4 (H.264, plus AAC when MediaRecorder supports it, otherwise Opus). WebM is used only when MP4 is unsupported, and the window title says so. A saved `recordingFormat` of `h264-mkv` records as MP4. Files are still chosen in the save dialog, named `Recording-Y-M-D_H-M-S`. macOS Screen Recording permission is checked only for the desktop-window fallback. In-process capture does not prompt.
- **User-Agent** for `*.aq.com` requests is an AQW plugin policy (`plugins/adventure-quest-worlds/user-agent.js`, applied by its `artix-ua` session rule): it matches what Artix Game Launcher 2.2.0 actually sends, `... (KHTML, like Gecko) Safari/537.36` with no `Chrome/`, `Electron/` or app-name tokens (the launcher's `replace(/Artix.*\s/, '')` eats them), plus an `artixmode: launcher` header. The platform only passes the browser's own UA to rules as `ctx.defaultUserAgent`.
- **Ad blocking** blocks known ad domains only (aq.com traffic is not filtered). It is a platform-owned session rule (`res/platform/platform-rules.js`). All session rules, platform and plugin, go through `res/platform/session-rules.js`, which registers one listener per webRequest event, because Electron keeps only one and a second registration silently replaces the first.
- **Char Page Studio** runs in a second Electron process, launched by the AQW plugin through `host.windows.spawnHelperProcess` (platform side: `res/platform/helper-process.js`; only scripts inside the bundled `plugins/` tree may run that way). Its scripts live under `plugins/adventure-quest-worlds/processes/`.

## Testing checklist

Automated: `npm test` and `npm run smoke:plugins`. Headless recording check, on a machine with a display: `xvfb-run -a node scripts/smoke-recording.js`.

**Manual UI:** [`docs/electron-experimental-parity.md`](docs/electron-experimental-parity.md) is the checklist for this branch. [`docs/FLASH_CHECKLIST.md`](docs/FLASH_CHECKLIST.md) describes the classic PPAPI app on `dev`.

## Build artifacts

- `dist/` – electron-builder output (gitignored)
- `work-<platform>-<arch>/` – `scripts/build-arch.sh` staging folders (gitignored); `work/` is the older staging path
- `releases/` – `scripts/build-all-arch.sh` final artifacts (gitignored)
- `AquaStar Screenshots/` – runtime screenshots (gitignored)
