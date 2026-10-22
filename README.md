# AquaStar NEO

AquaStar NEO is the Tauri launcher, version 1.0.0-rc.1. It is a separate product from classic AquaStar. Classic AquaStar is the Electron app on the `main` and `dev` branches. This branch, `neo-dev`, contains only NEO. Stable NEO work belongs on `neo`. Release tags use `neo-v*` (for example `neo-v1.0.0-rc.1`). An `rc`, `alpha`, or `beta` tag is a prerelease. No NEO release is marked Latest. Latest stays the classic Electron release. Older `v3.0.0-*` tags stay as history.

A Tauri 2 launcher for AQW. The launcher UI is plain HTML/JS in the system webview. The game never runs in the webview. Rust starts it as a separate player process. The launcher stays open while a player runs, so the wiki and search stay usable. "Hide the launcher during gameplay" in the launcher (stored as `hideLauncher` in `settings.json`) hides that window until the player exits.

Ruffle is the default player where Artix publishes a build: Linux x64, Windows x64, Windows ARM, and macOS. Linux i686 and Linux aarch64 have no player pin. Windows x86 has the Flash projector only, so that is the player used there. Each platform package bundles that OS's players. The pin list is [`players.json`](players.json). If a bundled player is missing, the first launch downloads that pin into app data and checks the SHA-256.

- **Ruffle**: Artix Experimental Launcher 2.1.0. Linux publishes `ruffle_desktop` inside an AppImage. Windows publishes `Artix Games Launcher.exe` inside a per-arch zip nested in one outer zip. macOS publishes one universal binary, `Artix Games Launcher · Ruffle`, for Apple silicon and Intel, minimum macOS 11. The player is started with `--tcp-connections allow --storage disk --letterbox on --quality <low|medium|high> --graphics <gl|vulkan|metal|dx12|default> --title AquaStar NEO --no-gui <Loader4.swf>`. `--performance-mode` exists. Its help says: the movie drawn as Flash Player draws it, at the display's logical resolution (never below the movie's own) and only at its own frame rate. `auto` (the default) turns it on for weak GPUs and when frames keep being late; `on` and `off` keep it so. AquaStar NEO does not pass the flag, so Artix's default stays. Smooth Motion (`frame_interpolation`) is a context-menu preference in the Artix build, not a command-line flag, so the launcher leaves it off. The binary is MIT or Apache-2.0. The bundled text is [`licenses/artix-ruffle-1.7.0-LICENSE.md`](licenses/artix-ruffle-1.7.0-LICENSE.md) and the credit is [`licenses/artix-ruffle-2.1.0-NOTICE.md`](licenses/artix-ruffle-2.1.0-NOTICE.md). Quality and graphics are chosen in the launcher and stored as `settings.json` in the app config directory (`ruffleQuality` and `ruffleGraphics`). High quality and Automatic graphics are the defaults on every platform; existing valid preferences are preserved. A saved engine choice that names the removed stock Ruffle build is rewritten to `ruffle` and every other setting is kept. The Mac binary links Metal. The fetch copies Homebrew `libfontconfig` beside the binary when the install name is `/opt/homebrew/opt/fontconfig/lib/libfontconfig.1.dylib`. Vulkan is offered on Linux and Windows, DirectX 12 on Windows, and Metal on macOS. Automatic passes `--graphics default` so Ruffle picks. If a backend other than the recovery backend exits abnormally within 15 seconds, or exits after printing a panic or graphics error, AquaStar NEO relaunches that game once with the recovery backend (OpenGL on Linux/Windows, or Metal on macOS) and logs it. Linux `ruffle_desktop` needs `libstdc++.so.6`.
- **Flash**: Adobe's official standalone projector 32.0.0.465, bundled the same way. The projector is x86_64. It is offered on Intel Macs, Linux, Windows, and Apple Silicon. On Apple Silicon the universal app stays arm64 and starts that Intel projector, which macOS runs under Rosetta. If Rosetta is missing, the launch fails with errno 86 and the launcher tells you to install it with `softwareupdate --install-rosetta` or to play with Ruffle. Version 32.0.0.344 is the Artix PPAPI plugin, not a projector, and Adobe's CDN does not serve a projector for that version. The Windows file is a 32-bit PE (`flashplayer_32_sa.exe`). The macOS file is `flashplayer_32_sa.dmg`. Projectors never had the 2021 time bomb. AquaStar NEO clears `com.apple.quarantine` on `Ruffle.app` and `Flash Player.app` before each launch. Linux, Windows, and macOS all launch that bundled projector and pass the Loader4 URL as the root movie. Windows removes the ShockwaveFlash window menu and titles the window AquaStar NEO, and writes that title again if Flash changes it. Linux loads a small GTK helper that hides the menu bar and the URL row and sets the same title. Artix Ruffle gets the same title from `--title`. A window that still starts as `Ruffle - <movie>` is retitled from outside the process on Windows and X11. The Mac menu bar stays, because it is the application menu. The Linux deb depends on GTK 2 (`libgtk2.0-0t64` or `libgtk2.0-0`) and `libnss3`. The AppImage carries those GTK 2 libraries in their own directory and points only the projector at it. If Flash still exits 127, the launcher names the missing library and suggests Ruffle.

Site buttons (wiki, account, news) open allow-listed HTTPS sites in their own Tauri webview window. Those windows refuse the ad hosts the Electron app cancels, plus the exchanges named by the wiki's NitroPay loader, and a document-start script hides Wikidot's ad units (`.wd-adunit`, `#ncmp__tool`) and the AQ.com Facebook box. Tauri does not expose subresource blocking on WebKitGTK, WebView2, or WKWebView, so the script removes matching script and iframe elements instead. Closing the main window kills every player process.

Classic AquaStar does not share this source tree. Its Electron code is on `main` and `dev`.

## Build and run (Linux)

For local testing, install the development libraries once:

```sh
sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libdbus-1-dev
```

From the repository root, run `bash scripts/build-local.sh --run` to compile and open a debug build. Cargo reuses compiled dependencies on later runs. HTML and JavaScript live in `ui/`; rebuild after changing them so the executable includes the updated pages. Use `--release` for an optimized build. The script builds a local executable without creating an installer or publishing a release. Missing players are downloaded on first launch, as described above.

```sh
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libgtk2.0-0 libnss3   # GTK 2 and NSS are for the Flash projector
cd src-tauri
cargo build --release          # needs a current stable Rust (1.85 is too old)
./target/release/aquastar-neo
```

`scripts/fetch-players.sh` (and `fetch-players.ps1` on Windows) reads `players.json`, checks each SHA-256, and unpacks the host OS into `src-tauri/players/`. That directory is committed with only `.gitkeep`, because the Tauri build script refuses to compile when `bundle.resources` names a path that is not on disk. The fetched binaries stay gitignored. The release workflow runs the fetch before it bundles the app. `desktop-check.yml` runs `cargo test` on pull requests and on pushes to `neo` and `neo-dev`, and `cargo check` on macOS, then runs the fetch script after the compiler.

Windows (`nsis`) and macOS (universal app) bundles are built by `.github/workflows/desktop-release.yml`. A `neo-v*` tag with `-rc`, `-alpha`, or `-beta` publishes a prerelease. A `neo-v*` tag without those suffixes publishes a stable release. Neither is marked Latest. A manual run (workflow_dispatch) only uploads the bundles as workflow artifacts so they can be tested before tagging. The Mac bundle is ad-hoc signed (`signingIdentity` `-`, hardened runtime off, minimum system 11.0). There is no Apple Developer ID certificate. `scripts/finish-macos-app.sh` signs nested player apps inside the built app, then writes the disk image. After you open the disk image, clear quarantine and then launch:

```sh
xattr -cr "/path/to/AquaStar NEO.app"
```

The Linux bundles are branded AquaStar NEO. The Debian package and AppImage are named `aquastar-neo`; release assets use `aquastar-neo_<version>_<arch>` names. Debian metadata replaces the previous `aqua-star` package. The executable is `aquastar-neo`. The Tauri application identifier stays `io.github.aquaspy.aquastar-lite` so existing settings, portal grants and desktop shortcut bindings keep working.

The same workflow also publishes `aquastar-neo_<ver>_x64-portable.zip` for Windows. `<ver>` is the `version` in `src-tauri/tauri.conf.json`. Unzip the archive and run `aquastar-neo.exe`. The archive contains `aquastar-neo.exe`, `portable.txt`, `players/`, and the bundled `media/` encoder next to the executable. When `portable.txt` is a file beside the executable, AquaStar NEO keeps its data in the `data` folder next to the executable, and Ruffle is started with `--save-directory` pointing at `data/ruffle-saves`. An installed copy leaves that flag unset. The recovery relaunch keeps the same save directory. Windows 10 and Windows 11 use the system WebView2 runtime. The zip does not run the NSIS installer. If WebView2 is missing, the app shows "Could not find the WebView2 Runtime".

Archive hashes live in [`players.json`](players.json).

## WebKitGTK notes

- The app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` unless you set it yourself. Under Xvfb this took the launcher from 399 to 273 MB PSS, and the DMA-BUF renderer is a known cause of blank windows on NVIDIA. It does not fix the blank window below.
- On Linux, unless `FONTCONFIG_FILE` is already set, the app builds a small fontconfig under `~/.cache/aquastar-lite/` (or a private `aquastar-lite-<uid>` dir in the temp dir when there is no home) and points WebKit at it. WebKitGTK scans every system font on the web-process main thread before the first paint. With a large Noto install that scan pegs a core and the window stays on the GTK background (`about:blank` never commits). The config lists one directory of symlinks to an allow-list of files (DejaVu, Liberation, Noto Sans/Serif, Noto Sans CJK, Noto Sans Thai, Noto Color Emoji, regular and bold only, at most 48) found in the usual Debian/Ubuntu, Fedora and Arch paths, plus the system alias rules from `/etc/fonts/conf.d` that add no font directories. `50-user.conf` is skipped because it adds the user font dirs. The launcher logs which config it used. Ruffle and Flash do not inherit the limit. Set `FONTCONFIG_FILE` yourself to opt out.
- Opening a webview window from a _sync_ Tauri command made the app exit silently on Linux. `open_site` is `async`.
- The Linux Flash projector is a GTK 2 app and also needs NSS (`libnss3`). A source build uses the system copies. `scripts/bundle-flash-gtk2.sh` copies the GTK 2 libraries into `src-tauri/flash-gtk2/` before an AppImage build. The deb package depends on them instead. Ruffle opens `libxkbcommon-x11.so.0` for an X11 window, so the deb also depends on `libxkbcommon-x11-0`. Artix's `ruffle_desktop` is also linked to OpenSSL 3, ALSA, fontconfig, `libstdc++.so.6`, and it dlopens `libEGL.so.1`, so the deb depends on `libssl3`, `libasound2t64` or `libasound2`, `libfontconfig1`, `libegl1`, and `libstdc++6`.

## Desktop plugins

Open **Plugins** to install a local ZIP, review permissions and enable or remove an extension. Changes apply after an explicit restart. Several plugins can contribute games, links, tools, menus and shortcuts together; AQW remains built in. Tools run on demand in isolated WebViews, with their own SDK storage and authorized public HTTPS requests. No Node runtime is bundled.

See [the authoring guide](docs/DESKTOP-PLUGINS.md) and `plugins/example-companion/`. Electron plugins use a different API.

Run the native isolation checks after changing the plugin host or permissions:

```sh
cd src-tauri
cargo test --locked extensions:: -- --test-threads=1
cargo build --locked --example extension-runtime-probe
cd ..
python3 scripts/smoke/extensions.py --binary src-tauri/target/debug/examples/extension-runtime-probe
```

Windows uses `extension-runtime-probe.exe`; Linux needs an X display (CI uses Xvfb). The probe uses synthetic account data and private plugin sessions. The `AquaStar NEO Extension Isolation` workflow runs the checks on Linux, Windows and macOS.

## Char Page Studio

The bundled AQW plugin has a **Char Page Studio** tool (`aquastar-neo --aqw --tool=studio --no-launcher`). The Studio window loads a public Char Page (`account.aq.com/CharPage?id=<name>`), lets you edit its FlashVars, and renders the character in a **separate Ruffle window**, not in the page. Two SWFs ship inside the executable (`plugins/adventure-quest-worlds/features/charpage/`): `characterB-studio.swf`, the Char Page itself, and `characterB-empty-scene.swf`, a clean compositor derived from SWF2PNG (MIT, see `empty-scene/SWF2PNG-NOTICE.md`). FlashVars reach them as `-P key=value`. The Char Page SWF calls `ExternalInterface.addCallback` before it reads them, which fails outside a browser, so the window starts Ruffle with `--dummy-external-interface`; the Flash projector cannot run that movie. Saving a PNG (3× the 715×455 stage) or a GIF (8 s, 10–60 FPS, 64–256 colors) opens a second, hidden-off-screen Ruffle window and reads it with `PrintWindow`; this is **Windows only** for now, while the preview works wherever Ruffle does. `AQUASTAR_STUDIO_SAVE_DIR=<folder>` skips the save dialog (smoke tests). The preview window is closed with the Studio window and when AquaStar NEO exits.

## Command line

`aquastar-neo --aqw` opens the launcher on a plugin's page and `aquastar-neo --aqw --no-launcher` opens its game without the launcher; `--game=<id>`, `--tool=<id>` (a tool window instead of a game), `--ruffle[<version>]`, `--flash[<version>]` and `--launcher` refine it, and Preferences > On start-up saves a game to open by default. Each plugin's command id comes from `launcherParameters.id`. See [the plugin guide](docs/DESKTOP-PLUGINS.md#command-line-and-start-up).

## Menu visibility and account sync

Preferences is the single settings destination in the launcher, with General, Adventure Quest Worlds and Keybinds sections. Completed edits save automatically. The Preferences menu action, Alt+9 and the built-in `settings` tool alias open this page, including during direct gameplay. Language applies to menus and dialogs; changes to language and saved shortcuts require restarting AquaStar NEO. AQW source overrides apply on the next game launch.

Manage plugins owns plugin installation and enablement. The Electron plugin-selection, renderer, and Ruffle updater controls are absent from this launcher. Inactive compatibility settings remain stored; changing a visible field preserves unrelated and unknown values. Main Preferences remains the authority for Ruffle quality and graphics, without importing a duplicate legacy quality value.

Preferences → General → **Restart Ruffle** and **Restart Flash** close and reopen the active game with its resolved movie and launch options. Ruffle keeps its quality, graphics selection and save directory, including the safe backend after GPU recovery. The game may return to login. The launcher stays hidden during replacement when that preference is enabled and returns if replacement fails. Stop an active recording before restarting. Restart does not clear cache or add a global keyboard shortcut.

The in-window menu bar is hidden by default on Linux and Windows. Enable **Preferences → Show menu bar** to show it; keyboard shortcuts work with either setting. macOS keeps its system application menu.

Inventory sync uses the saved account session. If the visible Account window is closed, the launcher initializes the account session in a hidden window using the same browser profile. An expired login offers **Open Account**; game login and account-site login are separate sessions.

## Game capture

The development launcher includes **Preferences → Screenshots and recording**, PNG screenshots (F2) and MP4 recording (Ctrl+J). The recording component ships with the application. Recordings contain video only; no game, system or microphone audio is captured. See [capture capabilities and native testing](docs/CAPTURE.md).

## Native Arch Linux package

Run `bash scripts/build-arch-package.sh` to generate a checksummed source snapshot and build a native `aquastar-neo-*.pkg.tar.zst` with `makepkg`, outside the checkout. It uses Arch's system libraries and upgrades the earlier `aqua-star` package when installed. See [Arch packaging](packaging/arch/README.md) for dependencies, installation, prerelease version ordering and the Arch release workflow.


### Returning to the launcher after a direct start

Reopen AquaStar NEO while its game is running, or start it with `--launcher`, to bring back the existing launcher and change Preferences. Reopening leaves direct-start auto-exit mode for that session: closing the game then keeps the launcher available. The saved start-up choice remains unchanged for the next app start. Native Arch desktop entries also provide an **Open Launcher and Preferences** action.

When **Hide the launcher during gameplay** is enabled, the launcher hides as the launch request begins, before player preparation and the 800 ms process health check. A failed launch restores the launcher. This retains the existing crash-detection window rather than shortening it to make the UI appear faster.
