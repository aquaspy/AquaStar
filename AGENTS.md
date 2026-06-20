# AquaStar – Agent Notes

Custom Electron launcher for AdventureQuest Worlds using native Pepper Flash (PPAPI).

## Commands

- `npm install` – install deps (Electron 11.5.0, electron-builder 22.14.x, nw-flash-trust, electron-localshortcut)
- `npm start` – run in dev
- `npm run dist` – package for current OS (`dist/`)
- `npm run dist-w` / `dist-l` / `dist-m` – Windows / Linux (AppImage + deb) / Mac (zip + dmg locally; CI builds zip only)
- `./build.sh` – **release script, do not run locally unless releasing.** Builds all platforms (Linux x64/ia32/armv7l, Windows x64/ia32). Requires WINE for Windows builds.

No tests, lint, typecheck, or CI exist in this repo.

## Critical constraints

- **Electron is pinned to `11.5.0`.** This is the last Electron release on Chromium 87, the final Chromium line that supports PPAPI Flash (removed in Chromium 88 / Electron 12+). Do not upgrade to Electron 12+ without a Flash alternative (e.g. Ruffle).
- **`asar: false` is required.** The PPAPI Flash plugin must exist as a real file on disk (`FlashPlayer/*.so`, `*.dll`, `*.plugin`). Electron passes the path directly to Chromium.
- **The app runs without `app.enableSandbox()`** in the main process because Electron needs filesystem access to locate the Flash plugin. Game/main windows use `sandbox: false` so PPAPI Flash loads; wiki windows use `sandbox: true` and `plugins: false`.

## Architecture

| File | Purpose |
|------|---------|
| `main.js` | Entry point. Creates main window, registers webRequest filters (ad block, UA spoof, SWF logging), sets up menu |
| `res/flash.js` | Picks platform/arch-specific PPAPI binary from `FlashPlayer/` and registers it with `app.commandLine.appendSwitch` |
| `res/const.js` | URLs, window configs, default keybindings, i18n (en-US + pt-BR), debug toggle |
| `res/instances.js` | Window factory, screenshot/charpage capture, context menus, child-window handling |
| `res/keybindings.js` | Loads `aquastar.json` overrides from appData or install dir |
| `res/preload_capture.js` | Preload for game windows (screen recording IPC) |
| `res/preload_charpage.js` | Preload for hidden 4K charpage window (Alt+K screenshot) |

## Runtime behavior

- **Default game URL:** `https://game.aq.com/game/gamefiles/Loader3.swf?ver=a`
- **Override:** Drop `aqlite_old.swf` in the project root (or install dir). If present, it loads the local file instead of the remote URL.
- **Custom URL override:** Set `"customUrl": "https://..."` in `aquastar.json` (only works when not using `aqlite_old.swf`).
- **SWF logging:** Set `"swfLog": true` in `aquastar.json` to log all `game.aq.com/game/*` requests to `Pictures/AquaStar Screenshots/SWFLogging/`.
- **Custom keybindings:** Create `aquastar.json` in appData or install dir. See `aquastar_testing.json` for an example and `KEYBINDING.md` for docs.

## Important quirks

- Game SWFs are loaded through **`res/swf_wrapper.html`** with `wmode=direct` (GPU direct-to-screen). Set `"useDirectWmode": false` in `aquastar.json` to disable the wrapper.
- **Background throttling is disabled** via Chromium flags in `res/flash.js` and `backgroundThrottling: false` on game/main windows.
- **Wiki windows** use `plugins: false` to avoid spawning a PPAPI instance per tab (RAM savings).
- **F2 / Ctrl+J** use `globalShortcut` because Flash PPAPI consumes keyboard events before `before-input-event`.
- **Screen recording** saves WebM (VP8 preferred). Native MP4 is not supported on Chromium 87; upgrading to Electron 12+ drops Flash.
- **User-Agent** for `*.aq.com` requests matches Artix Game Launcher: native Chromium UA with any `Artix...` token stripped, plus `artixmode: launcher` header (no hardcoded ArtixGameLauncher string).
- **Ad blocking** blocks known ad domains only via `session.webRequest.onBeforeRequest` (aq.com traffic is not filtered).

## Testing checklist

After making changes:
1. `npm start` – verify the game loads and Flash works
2. Test `Alt+N` (new AQW window) and `Alt+1` (DragonFable)
3. Test `F2` screenshot saves to `Pictures/AquaStar Screenshots`
4. Test `Ctrl+J` screen recording saves WebM to a chosen path
5. Test `Alt+K` on a charpage (opens hidden 4K window, captures, closes)
6. If modifying build/packaging, test `npm run pack` first (`--dir`, no installer)

## Build artifacts

- `dist/` – electron-builder output (gitignored)
- `work/` – `build.sh` temp folder (gitignored)
- `releases/` – `build.sh` final artifacts (gitignored)
- `AquaStar Screenshots/` – runtime screenshots (gitignored)