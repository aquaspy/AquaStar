# Electron experimental parity

Checklist against classic AquaStar on `dev` (Electron 11.5.0 and PPAPI Flash). This branch is Electron 45.1.0 with the pinned Ruffle web player in `res/ruffle/`.

Status values:

- **ported.** Same behavior, or the same code path still does the job.
- **ported with changes.** It still exists. The note says what moved.
- **not possible.** It needed PPAPI Flash, or it would throw away the AQW patches in the pinned player.

Counts: 17 ported, 13 ported with changes, 5 not possible. 35 items.

## Player

| Item | Status | Note |
| --- | --- | --- |
| SWF opens in a player inside the Electron window | ported with changes | Every `.swf` URL goes through `res/ruffle_wrapper.html`. `RufflePlayer.load` gets the URL, base, quality, letterbox, networking, and the socket proxy list. Quality can be low, medium, high, best, 8x8, 8x8 linear, 16x16, or 16x16 linear. Render scale is set on the player before load and defaults to 1. `preferredRenderer` is not set, so Ruffle tries wgpu-webgl, then webgpu, then webgl, then canvas. |
| Saved `renderMode: flash` or `ruffle-native` | ported with changes | Both migrate to `ruffle`. Settings has one player. |
| `useDirectWmode` and `wmode=direct` | not possible | Those settings existed so the Pepper plugin could draw straight to the screen, and so macOS screenshots could see an opaque surface. Ruffle draws a canvas. The saved keys are ignored. |
| PPAPI Flash Player and the `FlashPlayer/` binaries | not possible | Chromium dropped PPAPI. This branch deletes the plugin and the switches that pointed at it. |
| Pepper trust directory (`nw-flash-trust`) | not possible | Ruffle has no PPAPI trust folder. `res/flash.js` is a stub so older requires do not throw. `host.trustFlashUrls` still stores the list. |
| Stock ruffle.rs download replacing the bundled player | not possible | A stock v0.7.1 build would drop the toommyliu patches in `ruffle/patches/`. While `res/ruffle/PROVENANCE` exists, `downloadLatest` returns without writing files, and `ruffleAutoUpdate` stays off. |
| Minimize pauses the movie | ported with changes | A SWF window sets `renderingSuspended` and calls `releaseMemory` on minimize, and resumes on restore. |

## Game loading

| Item | Status | Note |
| --- | --- | --- |
| AQW plugin, default loader, live launcher URL | ported | The plugin still reads Artix's launcher page and falls back to `Loader4.swf`. This environment got HTTP 403 from `game.aq.com` before the SWF bytes arrived. |
| Custom SWF file and custom URL | ported | Local file still wins over `customUrl`, which still wins over the plugin URL. A local SWF served to the wrapper rendered in the smoke run. |
| User-Agent and `artixmode: launcher` | ported | Still the AQW plugin session rule. |
| CORS for Artix, AQ, and DragonFable hosts | ported with changes | New `onHeadersReceived` rule adds `Access-Control-Allow-Origin: *` when the response lacks it. The wrapper is a `file://` page, so Ruffle's fetch needs that header. |
| AQW TCP socket proxy | ported | WebSocket-to-TCP relay, policy port 843, allowed hosts unchanged. |
| DragonFable window | ported with changes | The menu still opens `DFLoader.swf` in Ruffle. That launch has no socket section, so raw game sockets are not relayed. The old ruffle mode was the same. The PPAPI path that could open them directly is gone. |
| SWF request log | ported | `swfLog` still writes through the plugin rule. |
| Ad blocking | ported | Platform rule, known ad hosts only. |

## Windows, capture, and accounts

| Item | Status | Note |
| --- | --- | --- |
| Several game windows | ported with changes | `new-window` is gone in this Electron. `setWindowOpenHandler` opens the child and denies the default popup. |
| Accounts, wiki, design notes, and other HTML pages | ported | Ordinary browser windows. Sandbox stays on. |
| Char page and char-page print | ported with changes | The page loads `aquastar://ruffle/ruffle.js` so the selfhosted polyfill replaces the Flash `<object>`. Alt+K treats `object`, `embed`, or `ruffle-player` as the movie. The window is sandboxed with web security on. The player scheme echoes CORS only for origins the plugin allows. |
| Char Page Studio | ported with changes | Helper process remains. It no longer starts PPAPI. The lab page and the capture page are sandboxed with web security on. They load `aquastar://ruffle/ruffle.js`. The helper serves the two local SWFs on their Artix URLs and adds an Artix CORS header. Popups are denied. Shared focus CSS is inserted from the helper because a `file://` page cannot read a parent file. |
| Screenshots (F2) | ported | `capturePage` from the main process. The smoke hook wrote PNGs of the game window. |
| Screen recording (Ctrl+J) | ported with changes | The game window's web contents are captured with `getDisplayMedia`. The file is MP4 (H.264). Audio is AAC when MediaRecorder supports it, otherwise Opus in the MP4. WebM is only the fallback when MP4 is unsupported, and the window title says so. Start, stop, the save dialog, and `Recording-Y-M-D_H-M-S` names are unchanged. A saved `h264-mkv` setting records as MP4. macOS Screen Recording permission is reported when the desktop-window fallback is blocked. That permission and Wayland's portal were not exercised here. |
| Global shortcuts | ported | F2 and Ctrl+J stay on `globalShortcut`. |
| Menus, reminders, to-do, inventory, strategy | ported | Plugin windows and stores are unchanged. |
| WikiView hover images | ported | Still fetched in the main process. |
| Fullscreen, reload, cache clear, DevTools flag | ported | Same keybinds and settings. |
| About dialog and releases link | ported with changes | The about text credits Ruffle. The releases link is still the GitHub page. There is no in-app auto-updater, same as classic. |

## Settings, plugins, and packaging

| Item | Status | Note |
| --- | --- | --- |
| Settings UI, language, keybinds, `aquastar.json` | ported | English and Portuguese copy no longer offers a Flash player. |
| Plugin host, safe mode, local plugins | ported | One active plugin. Restart to switch. Trust prompt unchanged. |
| Example companion | ported | `boxmover.swf` rendered under xvfb (canvas fallback, no GPU). |
| Plugin web site (`npm run web:build`, `web:preview`) | ported | Scripts were not rewritten. |
| Game window sandbox | ported with changes | Game and main windows are `sandbox: true` with `contextIsolation` and a preload. `plugins` is no longer a webPreference. |
| `asar: false` | ported with changes | Kept so the wasm and the plugin tree stay real files. The reason used to be the Pepper plugin. |
| Windows, Linux, and macOS packages | ported with changes | electron-builder targets stay nsis, AppImage, deb, zip, and dmg. `scripts/strip-mac-signature.js` is still `afterPack`. Packages are x64 only. Linux does not pass `--no-sandbox`. The AppImage launcher adds it when user namespaces are missing, and the deb postinstall sets the setuid helper in that same case. |
| 32-bit and armv7l installers | not possible | Electron 45 does not ship those architectures for this app. `scripts/build-arch.sh` accepts x64 only. |
| Tests, plugin smoke, lint | ported | `npm test`, `npm run lint`, and `npm run smoke:plugins` are the same commands. |

## What this environment did not prove

- A real AQW session. `https://game.aq.com/game/gamefiles/Loader4.swf?ver=b` returned Cloudflare HTML (HTTP 403) from this network, including with a launcher User-Agent and `artixmode`. Ruffle showed its load-error splash. The same request from a normal network may succeed.
- Gameplay frame rate on a GPU. xvfb blocklists WebGL, so Ruffle used the canvas renderer. A machine with a GPU should get wgpu-webgl first.
- Windows and macOS packages were not built here. The mac zip and `strip-mac-signature` were not executed.
- Wayland's screen portal, Windows, and macOS Screen Recording permission. The xvfb smoke captured the game web contents to an H.264 MP4. It did not open a portal or a macOS permission prompt.
- `release.yml` is unchanged. A `v*` tag pushed from this branch would still run Release, and a tag with no hyphen would replace GitHub Latest. Do not push a tag.
- GitHub Pages deploy is skipped when the workflow ref is `electron-experimental`. A dispatch of that workflow on this branch does not publish the tools site.
