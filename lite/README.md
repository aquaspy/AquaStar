# AquaStar Lite (proof of concept)

A Tauri 2 launcher for AQW. The launcher UI is plain HTML/JS in the system webview. The game never runs in the webview. Rust starts it as a separate player process. The launcher window hides while a player runs, and the window comes back when the last player exits.

Ruffle is the default player on Linux, Windows, and macOS. Each platform package bundles that OS's players. The pin list is [`players.json`](players.json). If a bundled player is missing, the first launch downloads that pin into app data and checks the SHA-256.

- **Ruffle**: official Ruffle desktop 0.7.1. Started with `--tcp-connections allow --storage disk --letterbox on --quality <low|medium|high> --graphics <gl|vulkan|metal|dx12|default> --no-gui <Loader4.swf>`. Quality and graphics are chosen in the launcher and stored as `settings.json` in the app config directory (`ruffleQuality` and `ruffleGraphics`, same values as the Electron app). OpenGL is the default on Linux and Windows. Metal is the default on macOS, because the v0.7.1 Mac binary links Metal and does not link OpenGL. Vulkan is offered on Linux and Windows, DirectX 12 on Windows, and Metal on macOS. Automatic passes `--graphics default` so Ruffle picks. If a backend other than that platform default exits abnormally within 15 seconds, or exits after printing a panic or graphics error, Lite relaunches that game once with the platform default (OpenGL, or Metal on macOS) and logs it.
- **Flash**: Adobe's official standalone projector 32.0.0.465, bundled the same way. Apple Silicon does not offer Flash. The projector is x86_64, so it is offered on Intel Macs, Linux, and Windows. A launch that fails with errno 86 (bad CPU type) tells you to use Ruffle or Rosetta. Version 32.0.0.344 is the Artix PPAPI plugin, not a projector, and Adobe's CDN does not serve a projector for that version. The Windows file is a 32-bit PE (`flashplayer_32_sa.exe`). The macOS file is `flashplayer_32_sa.dmg`. Projectors never had the 2021 time bomb. Lite clears `com.apple.quarantine` on `Ruffle.app` and `Flash Player.app` before each launch. On Windows and macOS, Lite copies the player into app data and appends a loader SWF (trailer magic `0xFA123456` plus the SWF length) so the projector opens the game without its URL bar. The bundled binary is not modified. The Linux player does not read that trailer, so Lite hides its GTK menu bar and URL row instead and still passes the Loader4 URL.

Site buttons (wiki, account, news) open allow-listed HTTPS sites in their own Tauri webview window. Closing the main window kills every player process.

Nothing in the Electron app depends on it.

## Build and run (Linux)

```sh
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libgtk2.0-0   # libgtk2.0-0 is for the Flash projector
cd lite/src-tauri
cargo build --release          # needs a current stable Rust (1.85 is too old)
./target/release/aquastar-lite
```

`lite/scripts/fetch-players.sh` (and `fetch-players.ps1` on Windows) reads `players.json`, checks each SHA-256, and unpacks the host OS into `lite/src-tauri/players/`. That directory is committed with only `.gitkeep`, because the Tauri build script refuses to compile when `bundle.resources` names a path that is not on disk. The fetched binaries stay gitignored. The release workflow runs the fetch before it bundles the app. `lite-check.yml` runs `cargo test` on pull requests that touch `lite/`, and `cargo check` on macOS, then runs the fetch script after the compiler.

Windows (`nsis`) and macOS (universal app) bundles are built by `.github/workflows/lite-release.yml`. A `lite-v*` tag publishes a pre-release. A manual run (workflow_dispatch) only uploads the bundles as workflow artifacts so they can be tested before tagging. The Mac bundle is ad-hoc signed (`signingIdentity` `-`, hardened runtime off, minimum system 11.0). There is no Apple Developer ID certificate. `lite/scripts/finish-macos-app.sh` signs nested player apps inside the built app, then writes the disk image. After you open the disk image, clear quarantine and then launch:

```sh
xattr -cr "/path/to/aquastar-lite.app"
```

The same workflow also publishes `AquaStar.Lite_<ver>_x64-portable.zip` for Windows. `<ver>` is the `version` in `lite/src-tauri/tauri.conf.json`. Unzip the archive. Run `aquastar-lite.exe`. The archive contains `aquastar-lite.exe`, `portable.txt`, and `players/` next to the executable. When `portable.txt` is a file beside the executable, AquaStar Lite keeps its data in the `data` folder next to the executable, and Ruffle is started with `--save-directory` pointing at `data/ruffle-saves`. An installed copy leaves that flag unset. The OpenGL relaunch keeps the same save directory. Windows 10 and Windows 11 use the system WebView2 runtime. The zip does not run the NSIS installer. If WebView2 is missing, the app shows "Could not find the WebView2 Runtime".

Archive hashes live in [`players.json`](players.json).

## WebKitGTK notes

- The app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` unless you set it yourself. Under Xvfb this took the launcher from 399 to 273 MB PSS, and the DMA-BUF renderer is a known cause of blank windows on NVIDIA. It does not fix the blank window below.
- On Linux, unless `FONTCONFIG_FILE` is already set, the app builds a small fontconfig under `~/.cache/aquastar-lite/` (or a private `aquastar-lite-<uid>` dir in the temp dir when there is no home) and points WebKit at it. WebKitGTK scans every system font on the web-process main thread before the first paint. With a large Noto install that scan pegs a core and the window stays on the GTK background (`about:blank` never commits). The config lists one directory of symlinks to an allow-list of files (DejaVu, Liberation, Noto Sans/Serif, Noto Sans CJK, Noto Sans Thai, Noto Color Emoji, regular and bold only, at most 48) found in the usual Debian/Ubuntu, Fedora and Arch paths, plus the system alias rules from `/etc/fonts/conf.d` that add no font directories. `50-user.conf` is skipped because it adds the user font dirs. The launcher logs which config it used. Ruffle and Flash do not inherit the limit. Set `FONTCONFIG_FILE` yourself to opt out.
- Opening a webview window from a *sync* Tauri command made the app exit silently on Linux. `open_site` is `async`.
- The Linux Flash projector is a GTK2 app, so it needs `libgtk2.0-0`.
