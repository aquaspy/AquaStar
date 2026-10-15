# AquaStar Lite (proof of concept)

A Tauri 2 launcher for AQW. The launcher UI is plain HTML/JS in the system webview. The game never runs in the webview. Rust starts it as a separate player process:

- **Ruffle**: official Ruffle desktop 0.7.1, downloaded on first use and checked against a pinned SHA-256. Started with `--tcp-connections allow --storage disk --letterbox on --no-gui <Loader4.swf>`.
- **Flash**: Linux uses Adobe's own standalone projector 32.0.0.465 (`fpdownload.macromedia.com`, SHA-256 pinned). Projectors never had the 2021 time bomb, and it opens the AQW login in 2026. On Windows the PoC expects the Clean Flash 34 standalone player (`flashplayer_sa.exe`) bundled next to the exe. macOS is Ruffle only.

Site buttons (wiki, account, news) open allow-listed HTTPS sites in their own Tauri webview window. Closing the main window kills every player process.

This is throwaway. Nothing in the Electron app depends on it.

## Build and run (Linux)

```sh
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libgtk2.0-0   # libgtk2.0-0 is for the Flash projector
cd lite/src-tauri
cargo build --release          # needs a current stable Rust (1.85 is too old)
./target/release/aquastar-lite
```

Windows and macOS builds have their config in place (`nsis`, `dmg` targets, per-platform pinned Ruffle builds) but have not been built yet. Use `cargo tauri build` on the target OS.

## Pinned players

| Player | SHA-256 | VirusTotal |
| --- | --- | --- |
| ruffle-0.7.1-linux-x86_64.tar.gz | 67950dfd…dd99 | 0 detections |
| ruffle-0.7.1-windows-x86_64.zip | a5f6df98…a94e | 0 detections |
| ruffle-0.7.1-macos-universal.tar.gz | 7a86a09b…a4e | 0 detections |
| flash_player_sa_linux.x86_64.tar.gz (32.0.0.465) | 883f7aa2…96c3 | 0/74 |
| Clean Flash 34.0.0.330 flashplayer_sa.exe | 7d492db8…e979 | 0/75 |

## WebKitGTK notes

- The app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` unless you set it yourself. Under Xvfb this took the launcher from 399 to 273 MB PSS, and the DMA-BUF renderer is a known cause of blank windows on NVIDIA. It still needs a check on a real GPU.
- Opening a webview window from a *sync* Tauri command made the app exit silently on Linux. `open_site` is `async`.
- The Linux Flash projector is a GTK2 app, so it needs `libgtk2.0-0`.
