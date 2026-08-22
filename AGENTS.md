# AquaStar – Agent Notes

Custom Electron launcher for AdventureQuest Worlds using native Pepper Flash (PPAPI).

## Commands

- `npm install` – install deps (Electron 11.5.0, electron-builder 22.14.x, nw-flash-trust, electron-localshortcut)
- `npm start` – run in dev
- `npm run dist` – package for current OS (`dist/`)
- `npm run dist-w` / `dist-l` / `dist-m` – Windows / Linux (AppImage + deb) / Mac (zip + dmg locally; CI builds zip only)
- `npm test` – run the dependency-free regression suite (domain, persistence, and window lifecycle)
- `npm run test:ci` – run tests followed by the local Windows packaging check
- `./build.sh` – **legacy local release script** for multi-arch Linux/Windows. Prefer GitHub Releases via tag (see below).
- **GitHub Release:** bump `version` in `package.json`, commit, then `git tag vX.Y.Z && git push origin vX.Y.Z` (matching the new version, e.g. current is `1.9.1`) — the Release workflow builds all platforms and attaches installers to the GitHub Release.

The test workflow runs `npm test` on pull requests and packages the Windows app separately.

## Critical constraints

- **Electron is pinned to `11.5.0`.** This is the last Electron release on Chromium 87, the final Chromium line that supports PPAPI Flash (removed in Chromium 88 / Electron 12+). Do not upgrade to Electron 12+ without a Flash alternative (e.g. Ruffle).
- **`asar: false` is required.** The PPAPI Flash plugin must exist as a real file on disk (`FlashPlayer/*.so`, `*.dll`, `*.plugin`). Electron passes the path directly to Chromium.
- **The app runs without `app.enableSandbox()`** in the main process because Electron needs filesystem access to locate the Flash plugin. Game/main windows use `sandbox: false` so PPAPI Flash loads; wiki/settings/reminders-style windows use `sandbox: true`. Plugins (Flash) stay enabled on every window type regardless - see `res/windows/config.js`.

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
| `res/features/<name>/` | Each self-contained window feature's own files together: `reminders/` (reminders.js + reminders.html + preload_reminders.js + reminders_default.json), `todo/` (todo.js + todo.html + preload_todo.js), `common/` (list_window_common.js - shared renderer-side logic for Reminders and To-Do, see below), `settings/` (settings.html + preload_settings.js), `wikiview/` (wikiviewsource.js + preload_wikiview.js + jquery.min.js), `capture/` (preload_capture.js, for game windows), `charpage/` (preload_charpage.js, for the hidden 4K charpage window) |

## Runtime behavior

- **Default game URL:** `https://game.aq.com/game/gamefiles/Loader3.swf?ver=a`
- **Override:** Drop `aqlite_old.swf` in the project root (or install dir), or use the "Custom SWF File" section of the Settings screen (Alt+9) to pick one via a file dialog - it copies the file to that same location. If present, it loads the local file instead of the remote URL, and takes priority over the custom URL option below. Restart required either way.
- **Custom URL override:** Set `"customUrl": "https://..."` in `aquastar.json`, or the same "Custom SWF File" section in Settings (it's a plain text field there too). Ignored whenever `aqlite_old.swf` is present.
- **SWF logging:** Set `"swfLog": true` in `aquastar.json` to log all `game.aq.com/game/*` requests to `Pictures/AquaStar Screenshots/SWFLogging/`.
- **Custom keybindings:** Create `aquastar.json` in appData or install dir, or use the Settings screen (Alt+9) which writes the same file. See `aquastar_testing.json` for an example and `KEYBINDING.md` for docs.
- **Reminders (Alt+T):** per-character daily/weekly/monthly (and seasonal) quest tracker, with a name/type/category filter bar. Stored in `aquastar_reminders.json` in appData, seeded once from `res/features/reminders/reminders_default.json` on first run - after that the user's own file is authoritative. The hidden/archived-quest list is shared across characters by default; a toolbar toggle switches it to per-character (each quest's `hiddenBy` map holds a `__shared__` key plus one key per character id), and switching back to shared prompts for which character's list becomes the new shared one.
- **To-Do List (Alt+Y):** per-character task list (drop / daily drop / shop-merge / quest-reward categories, optional wiki link, priority star that always sorts to the top of the list, seasonal tagging). Stored in `aquastar_todo.json` in appData - no default seed file, starts empty. Unlike Reminders there's no recurring type or `done` map: "hidden" doubles as "completed" (same shared-vs-per-character toggle as Reminders' hidden list). Wiki links open in AquaStar's own tabbed window via `instances.newBrowserWindow` (not the OS browser), restricted to `http(s)://` in `todo.js`'s `todoOpenLink` handler. Shares its date/reset math, seasonal-event keys, hidden-map helpers, drag-reorder, and prompt/choice modals with Reminders via `res/features/common/list_window_common.js` (`window.ListWindowCommon`, loaded as a plain `<script>` tag) - update that file, not both windows separately, when touching that shared logic.

## Important quirks

- Game SWFs are loaded through **`res/swf_wrapper.html`** with `wmode=direct` (GPU direct-to-screen). Set `"useDirectWmode": false` in `aquastar.json` to disable the wrapper.
- **Background throttling is disabled** via Chromium flags in `res/flash.js` and `backgroundThrottling: false` on game/main windows.
- **Plugins (Flash) are enabled on every window type**, including wiki/settings/reminders - see the comment in `res/windows/config.js` (Char Page compatibility, not worth the special-casing).
- **F2 / Ctrl+J** use `globalShortcut` because Flash PPAPI consumes keyboard events before `before-input-event`.
- **WikiView's hover-preview image** is fetched from the main process (`res/ipc/wikiFetch.js`), not the renderer - a page-side `fetch()` to aqwwiki.wikidot.com from an account.aq.com window would be blocked by CORS.
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
6. Test `Alt+9` (Settings opens; keybind recording, Other Options, and the Custom SWF File section - choosing/removing a file - all save correctly)
7. Test `Alt+T` (Reminders opens; add a character and a quest, mark it done, restart the app, confirm it persisted)
8. Test `Alt+Y` (To-Do opens; add a character and a task with a wiki link, mark priority, mark complete, restart the app, confirm it persisted)
9. If modifying build/packaging, test `npm run pack` first (`--dir`, no installer)

## Build artifacts

- `dist/` – electron-builder output (gitignored)
- `work/` – `build.sh` temp folder (gitignored)
- `releases/` – `build.sh` final artifacts (gitignored)
- `AquaStar Screenshots/` – runtime screenshots (gitignored)
