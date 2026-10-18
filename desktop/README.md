# AquaStar 3.0

A Tauri 2 launcher for AQW. The launcher UI is plain HTML/JS in the system webview. The game never runs in the webview. Rust starts it as a separate player process. The launcher stays open while a player runs, so the wiki and search stay usable. "Hide the launcher during gameplay" in the launcher (stored as `hideLauncher` in `settings.json`) hides that window until the player exits.

Ruffle is the default player on Linux, Windows, and macOS. Each platform package bundles that OS's players. The pin list is [`players.json`](players.json). If a bundled player is missing, the first launch downloads that pin into app data and checks the SHA-256.

- **Ruffle**: Artix Experimental Launcher 1.7.0's standalone `ruffle_desktop` on Linux, Windows, and Apple Silicon. Intel Macs keep the official Ruffle desktop 0.7.1 universal build, because Artix ships arm64 only and the two binaries are different builds, so they are not combined with `lipo`. Started with `--tcp-connections allow --storage disk --letterbox on --quality <low|medium|high> --graphics <gl|vulkan|metal|dx12|default> --no-gui <Loader4.swf>`. Those flags are the same ones `ruffle_desktop` accepts. `--title AquaStar` is added only for an Artix pin, because stock 0.7.1 rejects that flag. Stock 0.7.1 is the default on Intel Mac, Windows x86, Linux i686, and Linux aarch64. Smooth Motion (`frame_interpolation`) is a context-menu preference in the Artix build, not a command-line flag, so the launcher leaves it off. The Artix binary is MIT or Apache-2.0. The bundled text is [`licenses/artix-ruffle-1.7.0-LICENSE.md`](licenses/artix-ruffle-1.7.0-LICENSE.md) and the credit is [`licenses/artix-ruffle-1.7.0-NOTICE.md`](licenses/artix-ruffle-1.7.0-NOTICE.md). Quality and graphics are chosen in the launcher and stored as `settings.json` in the app config directory (`ruffleQuality` and `ruffleGraphics`). High quality and Automatic graphics are the defaults on every platform; existing valid preferences are preserved. The Artix arm64 binary links Metal, and the v0.7.1 Mac binary links Metal and does not link OpenGL. The Apple Silicon fetch rewrites `ruffle_desktop`'s Homebrew `libfontconfig` install name and copies that library beside the binary, because Artix linked `/opt/homebrew/opt/fontconfig/lib/libfontconfig.1.dylib`. Vulkan is offered on Linux and Windows, DirectX 12 on Windows, and Metal on macOS. Automatic passes `--graphics default` so Ruffle picks. If a backend other than the recovery backend exits abnormally within 15 seconds, or exits after printing a panic or graphics error, AquaStar relaunches that game once with the recovery backend (OpenGL on Linux/Windows, or Metal on macOS) and logs it.
- **Flash**: Adobe's official standalone projector 32.0.0.465, bundled the same way. The projector is x86_64. It is offered on Intel Macs, Linux, Windows, and Apple Silicon. On Apple Silicon the universal app stays arm64 and starts that Intel projector, which macOS runs under Rosetta. If Rosetta is missing, the launch fails with errno 86 and the launcher tells you to install it with `softwareupdate --install-rosetta` or to play with Ruffle. Version 32.0.0.344 is the Artix PPAPI plugin, not a projector, and Adobe's CDN does not serve a projector for that version. The Windows file is a 32-bit PE (`flashplayer_32_sa.exe`). The macOS file is `flashplayer_32_sa.dmg`. Projectors never had the 2021 time bomb. AquaStar clears `com.apple.quarantine` on `Ruffle.app` and `Flash Player.app` before each launch. Linux, Windows, and macOS all launch that bundled projector and pass the Loader4 URL as the root movie. Windows removes the ShockwaveFlash window menu and titles the window AquaStar, and writes that title again if Flash changes it. Linux loads a small GTK helper that hides the menu bar and the URL row and sets the same title. Stock Ruffle 0.7.1 has no title option, so Windows and an X11 window from that binary get AquaStar from outside the process. Artix's `ruffle_desktop` gets the same title from `--title`. The Mac menu bar stays, because it is the application menu. The Linux deb depends on GTK 2 (`libgtk2.0-0t64` or `libgtk2.0-0`) and `libnss3`. The AppImage carries those GTK 2 libraries in their own directory and points only the projector at it. If Flash still exits 127, the launcher names the missing library and suggests Ruffle.

Site buttons (wiki, account, news) open allow-listed HTTPS sites in their own Tauri webview window. Those windows refuse the ad hosts the Electron app cancels, plus the exchanges named by the wiki's NitroPay loader, and a document-start script hides Wikidot's ad units (`.wd-adunit`, `#ncmp__tool`) and the AQ.com Facebook box. Tauri does not expose subresource blocking on WebKitGTK, WebView2, or WKWebView, so the script removes matching script and iframe elements instead. Closing the main window kills every player process.

Nothing in the Electron app depends on it.

## Build and run (Linux)

For local testing, install the development libraries once:

```sh
sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libdbus-1-dev
```

From the repository root, run `bash desktop/scripts/build-local.sh --run` to compile and open a debug build. Cargo reuses compiled dependencies on later runs. HTML and JavaScript live in `desktop/ui/`; rebuild after changing them so the executable includes the updated pages. Use `--release` for an optimized build. The script builds a local executable without creating an installer or publishing a release. Missing players are downloaded on first launch, as described above.

```sh
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libgtk2.0-0 libnss3   # GTK 2 and NSS are for the Flash projector
cd desktop/src-tauri
cargo build --release          # needs a current stable Rust (1.85 is too old)
./target/release/aquastar-lite
```

`desktop/scripts/fetch-players.sh` (and `fetch-players.ps1` on Windows) reads `players.json`, checks each SHA-256, and unpacks the host OS into `desktop/src-tauri/players/`. That directory is committed with only `.gitkeep`, because the Tauri build script refuses to compile when `bundle.resources` names a path that is not on disk. The fetched binaries stay gitignored. The release workflow runs the fetch before it bundles the app. `desktop-check.yml` runs `cargo test` on pull requests that touch `desktop/`, and `cargo check` on macOS, then runs the fetch script after the compiler.

Windows (`nsis`) and macOS (universal app) bundles are built by `.github/workflows/desktop-release.yml`. A `v3.*-*` tag publishes a pre-release; `v3.*` stable tags publish a stable release without changing Latest. Historical `lite-v*` prerelease tags remain supported. A manual run (workflow_dispatch) only uploads the bundles as workflow artifacts so they can be tested before tagging. The Mac bundle is ad-hoc signed (`signingIdentity` `-`, hardened runtime off, minimum system 11.0). There is no Apple Developer ID certificate. `desktop/scripts/finish-macos-app.sh` signs nested player apps inside the built app, then writes the disk image. After you open the disk image, clear quarantine and then launch:

```sh
xattr -cr "/path/to/AquaStar.app"
```

The Linux packages use the `AquaStar_<version>_<arch>.deb` filename and Debian package name `aqua-star`, which remains separate from Electron's `aquastar`. Prerelease control versions use Debian's `~` separator so a future stable release upgrades correctly. The executable and application identifier retain their historical internal names to preserve profiles and integration compatibility.

The same workflow also publishes `AquaStar_<ver>_x64-portable.zip` for Windows. `<ver>` is the `version` in `desktop/src-tauri/tauri.conf.json`. Unzip the archive. Run `aquastar-lite.exe`. The archive contains `aquastar-lite.exe`, `portable.txt`, and `players/` next to the executable. When `portable.txt` is a file beside the executable, AquaStar keeps its data in the `data` folder next to the executable, and Ruffle is started with `--save-directory` pointing at `data/ruffle-saves`. An installed copy leaves that flag unset. The recovery relaunch keeps the same save directory. Windows 10 and Windows 11 use the system WebView2 runtime. The zip does not run the NSIS installer. If WebView2 is missing, the app shows "Could not find the WebView2 Runtime".

Archive hashes live in [`players.json`](players.json).

## WebKitGTK notes

- The app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` unless you set it yourself. Under Xvfb this took the launcher from 399 to 273 MB PSS, and the DMA-BUF renderer is a known cause of blank windows on NVIDIA. It does not fix the blank window below.
- On Linux, unless `FONTCONFIG_FILE` is already set, the app builds a small fontconfig under `~/.cache/aquastar-lite/` (or a private `aquastar-lite-<uid>` dir in the temp dir when there is no home) and points WebKit at it. WebKitGTK scans every system font on the web-process main thread before the first paint. With a large Noto install that scan pegs a core and the window stays on the GTK background (`about:blank` never commits). The config lists one directory of symlinks to an allow-list of files (DejaVu, Liberation, Noto Sans/Serif, Noto Sans CJK, Noto Sans Thai, Noto Color Emoji, regular and bold only, at most 48) found in the usual Debian/Ubuntu, Fedora and Arch paths, plus the system alias rules from `/etc/fonts/conf.d` that add no font directories. `50-user.conf` is skipped because it adds the user font dirs. The launcher logs which config it used. Ruffle and Flash do not inherit the limit. Set `FONTCONFIG_FILE` yourself to opt out.
- Opening a webview window from a _sync_ Tauri command made the app exit silently on Linux. `open_site` is `async`.
- The Linux Flash projector is a GTK 2 app and also needs NSS (`libnss3`). A source build uses the system copies. `desktop/scripts/bundle-flash-gtk2.sh` copies the GTK 2 libraries into `src-tauri/flash-gtk2/` before an AppImage build. The deb package depends on them instead. Ruffle opens `libxkbcommon-x11.so.0` for an X11 window, so the deb also depends on `libxkbcommon-x11-0`. Artix's `ruffle_desktop` is also linked to OpenSSL 3, ALSA, fontconfig, and it dlopens `libEGL.so.1`, so the deb depends on `libssl3`, `libasound2t64` or `libasound2`, `libfontconfig1`, and `libegl1`.

## Desktop plugins

Open **Plugins** to install a local ZIP, review permissions and enable or remove an extension. Changes apply after an explicit restart. Several plugins can contribute games, links, tools, menus and shortcuts together; AQW remains built in. Tools run on demand in isolated WebViews, with their own SDK storage and authorized public HTTPS requests. No Node runtime is bundled.

See [the authoring guide](../docs/DESKTOP-PLUGINS.md) and `plugins/example-companion/`. Electron 2.x plugins use a different API and are not imported.

Run the native isolation checks after changing the plugin host or permissions:

```sh
cd desktop/src-tauri
cargo test --locked extensions:: -- --test-threads=1
cargo build --locked --example extension-runtime-probe
cd ../..
python3 desktop/scripts/smoke/extensions.py --binary desktop/src-tauri/target/debug/examples/extension-runtime-probe
```

Windows uses `extension-runtime-probe.exe`; Linux needs an X display (CI uses Xvfb). The probe uses synthetic account data and private plugin sessions. The `AquaStar Extension Isolation` workflow runs the checks on Linux, Windows and macOS.

## Menu visibility and account sync

The in-window menu bar is hidden by default on Linux and Windows. Enable **Preferences → Show menu bar** to show it; keyboard shortcuts work with either setting. macOS keeps its system application menu.

Inventory sync uses the saved account session. If the visible Account window is closed, the launcher initializes the account session in a hidden window using the same browser profile. An expired login offers **Open Account**; game login and account-site login are separate sessions.
