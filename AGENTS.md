# AquaStar – Agent Notes

Custom Electron launcher for AdventureQuest Worlds using native Pepper Flash (PPAPI).

## Commands

- `npm install` – install deps (Electron 11.5.0, electron-builder 22.14.x, nw-flash-trust, electron-localshortcut)
- `npm start` – run in dev
- `npm run dist` – package for current OS (`dist/`)
- `npm run dist-w` / `dist-l` / `dist-m` – Windows / Linux (AppImage + deb) / Mac (zip + dmg locally; CI builds zip only)
- `./build.sh` – **legacy local release script** for multi-arch Linux/Windows. Prefer GitHub Releases via tag (see below).
- **GitHub Release:** bump `version` in `package.json`, commit, then `git tag v1.8.0 && git push origin v1.8.0` — the Release workflow builds all platforms and attaches installers to the GitHub Release.

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
| `res/const.js` | Core app-wide constants: URLs, default keybindings/options, icon paths, locale bootstrap. No window configs or IPC handlers live here anymore - see `res/windows/` and `res/ipc/` below |
| `res/instances.js` | Window factory, screenshot/charpage capture, context menus, child-window handling |
| `res/keybindings.js` | Registers every app keybind (`electron-localshortcut`/`globalShortcut`); also owns the Settings screen's own IPC (load/save `aquastar.json`) since that's tightly coupled to keybind state |
| `res/windows/config.js` | `BrowserWindow` configs + `file://` URLs for every window the app opens (main/game/wiki/charpage/settings/reminders) |
| `res/windows/menu.js` | Builds the app/context menu; Help and About dialogs |
| `res/ipc/recording.js` | Screen-recording IPC (save-dialog, write-file, desktop-capturer source lookup, recording-toggle state) |
| `res/ipc/wikiFetch.js` | Main-process fetch of AQW Wiki pages for WikiView, so the request isn't subject to a page's CORS policy |
| `res/features/<name>/` | Each self-contained window feature's own files together: `reminders/` (reminders.js + reminders.html + preload_reminders.js + reminders_default.json), `settings/` (settings.html + preload_settings.js), `wikiview/` (wikiviewsource.js + preload_wikiview.js + jquery.min.js), `capture/` (preload_capture.js, for game windows), `charpage/` (preload_charpage.js, for the hidden 4K charpage window) |

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