# AquaStar – Agent Notes

Custom Electron launcher for AdventureQuest Worlds using native Pepper Flash (PPAPI).

## Commands

- `npm install` – install deps (Electron 4.2.12, electron-builder, nw-flash-trust)
- `npm start` – run in dev
- `npm run dist` – package for current OS (`dist/`)
- `npm run dist-w` / `dist-l` / `dist-m` – Windows / Linux / Mac only
- `./build.sh` – **release script, do not run locally unless releasing.** Builds all platforms (Linux x64/ia32/armv7l, Windows x64/ia32). Requires WINE for Windows builds.

No tests, lint, typecheck, or CI exist in this repo.

## Critical constraints

- **Electron is pinned to `^4.2.12`. Do NOT upgrade.** This is the last Electron version that reliably loads PPAPI Flash. Later versions remove Flash support entirely.
- **`asar: false` is required.** The PPAPI Flash plugin must exist as a real file on disk (`FlashPlayer/*.so`, `*.dll`, `*.plugin`). Electron passes the path directly to Chromium.
- **The app runs without `app.enableSandbox()`** in the main process because Electron needs filesystem access to locate the Flash plugin. Individual windows use `sandbox: true`.

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

- Game SWFs are now loaded through **`res/swf_wrapper.html`** so Flash runs with `wmode=direct` (GPU direct-to-screen) instead of the slower `wmode=window` browser-compositing path. Set `"useDirectWmode": false` in `aquastar.json` to disable the wrapper if you encounter issues.
- **Background throttling is disabled.** A suite of performance Chromium flags is appended at startup in `res/flash.js` (`disable-renderer-backgrounding`, `disable-background-timer-throttling`, GPU-rasterization, zero-copy, etc.). Alt-tabbing or opening wiki windows will no longer drop the game's FPS.
- **User-Agent is hardcoded** to spoof `ArtixGameLauncher/2.0.9 Chrome/80.0.3987.163 Electron/8.5.5` regardless of the actual Electron version. This is intentional for server compatibility.
- **Ad blocking** is done via `session.webRequest.onBeforeRequest`: blocks `adsymptotic.com`, allows `aq.com`.
- The `enableRemoteModule: true` flag is used in game/main windows for screen recording IPC. Removing it will break recording.

## Testing checklist

After making changes:
1. `npm start` – verify the game loads and Flash works
2. Test `Alt+N` (new AQW window) and `Alt+1` (DragonFable)
3. Test `F2` screenshot saves to `Pictures/AquaStar Screenshots`
4. Test `Alt+K` on a charpage (opens hidden 4K window, captures, closes)
5. If modifying build/packaging, test `npm run pack` first (`--dir`, no installer)

## Build artifacts

- `dist/` – electron-builder output (gitignored)
- `work/` – `build.sh` temp folder (gitignored)
- `releases/` – `build.sh` final artifacts (gitignored)
- `AquaStar Screenshots/` – runtime screenshots (gitignored)
