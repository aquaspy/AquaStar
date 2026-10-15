# AquaStar Lite (proof of concept)

A Tauri 2 launcher for AQW. The launcher UI is plain HTML/JS in the system webview. The game never runs in the webview. Rust starts it as a separate player process:

- **Ruffle**: official Ruffle desktop 0.7.1, downloaded on first use and checked against a pinned SHA-256. Started with `--tcp-connections allow --storage disk --letterbox on --quality <low|medium|high> --graphics <gl|vulkan|metal|dx12|default> --no-gui <Loader4.swf>`. Quality and graphics are chosen in the launcher and stored as `settings.json` in the app config directory (`ruffleQuality` / `ruffleGraphics`, same values as the Electron app). OpenGL is the default. Vulkan is offered on Linux and Windows, DirectX 12 on Windows, and Metal on macOS. Automatic passes `--graphics default` so Ruffle picks. If a non-OpenGL backend exits abnormally within 15 seconds, or exits after printing a panic or graphics error, Lite relaunches that game once with OpenGL and logs it.
- **Flash**: Adobe's official standalone projector 32.0.0.465, downloaded on first use and checked against a pinned SHA-256. This is the default Play button on Linux, Windows, and macOS. Version 32.0.0.344 is the Artix PPAPI plugin, not a projector, and Adobe's CDN does not serve a projector for that version. The Windows file is a 32-bit PE (`flashplayer_32_sa.exe`). The macOS file is `flashplayer_32_sa.dmg`. Projectors never had the 2021 time bomb.

Site buttons (wiki, account, news) open allow-listed HTTPS sites in their own Tauri webview window. Closing the main window kills every player process.

Nothing in the Electron app depends on it.

## Build and run (Linux)

```sh
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libgtk2.0-0   # libgtk2.0-0 is for the Flash projector
cd lite/src-tauri
cargo build --release          # needs a current stable Rust (1.85 is too old)
./target/release/aquastar-lite
```

Windows (`nsis`) and macOS (`dmg`, universal) bundles are built by `.github/workflows/lite-release.yml`. A `lite-v*` tag publishes a pre-release; a manual run (workflow_dispatch) only uploads the bundles as workflow artifacts so they can be tested before tagging. `lite-check.yml` runs `cargo test` on pull requests that touch `lite/`.

The same workflow also publishes `AquaStar.Lite_<ver>_x64-portable.zip` for Windows. `<ver>` is the `version` in `lite/src-tauri/tauri.conf.json`. Unzip the archive. Run `aquastar-lite.exe`. The archive contains `aquastar-lite.exe` and `portable.txt`. When `portable.txt` is a file beside the executable, AquaStar Lite keeps its data in the `data` folder next to the executable, and Ruffle is started with `--save-directory` pointing at `data/ruffle-saves`. An installed copy leaves that flag unset. The OpenGL relaunch keeps the same save directory. Windows 10 and Windows 11 use the system WebView2 runtime. The zip does not run the NSIS installer. If WebView2 is missing, the app shows "Could not find the WebView2 Runtime".

## Pinned players

| Player | SHA-256 | VirusTotal |
| --- | --- | --- |
| ruffle-0.7.1-linux-x86_64.tar.gz | 67950dfd…dd99 | 0 detections |
| ruffle-0.7.1-windows-x86_64.zip | a5f6df98…a94e | 0 detections |
| ruffle-0.7.1-macos-universal.tar.gz | 7a86a09b…a4e | 0 detections |
| flash_player_sa_linux.x86_64.tar.gz (32.0.0.465) | 883f7aa2…96c3 | 0/74 |
| flashplayer_32_sa.exe (32.0.0.465, 32-bit) | a4b333ac…66f0 | not read (captcha) |
| flashplayer_32_sa.dmg (32.0.0.465) | 236ecef5…023a | not read (captcha) |

## WebKitGTK notes

- The app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` unless you set it yourself. Under Xvfb this took the launcher from 399 to 273 MB PSS, and the DMA-BUF renderer is a known cause of blank windows on NVIDIA. It does not fix the blank window below.
- On Linux, unless `FONTCONFIG_FILE` is already set, the app builds a small fontconfig under `~/.cache/aquastar-lite/` (or a private `aquastar-lite-<uid>` dir in the temp dir when there is no home) and points WebKit at it. WebKitGTK scans every system font on the web-process main thread before the first paint. With a large Noto install that scan pegs a core and the window stays on the GTK background (`about:blank` never commits). The config lists one directory of symlinks to an allow-list of files (DejaVu, Liberation, Noto Sans/Serif, Noto Sans CJK, Noto Sans Thai, Noto Color Emoji, regular and bold only, at most 48) found in the usual Debian/Ubuntu, Fedora and Arch paths, plus the system alias rules from `/etc/fonts/conf.d` that add no font directories. `50-user.conf` is skipped because it adds the user font dirs. The launcher logs which config it used. Ruffle and Flash do not inherit the limit. Set `FONTCONFIG_FILE` yourself to opt out.
- Opening a webview window from a *sync* Tauri command made the app exit silently on Linux. `open_site` is `async`.
- The Linux Flash projector is a GTK2 app, so it needs `libgtk2.0-0`.
