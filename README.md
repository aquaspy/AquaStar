# AquaStar

![AquaStar](Icon/Icon_1024.png)

AquaStar is a launcher for Adventure Quest Worlds.

It is not a cheat and it is not a bot. It does not play the game for you. Electron's extra windows track tasks and inventory. Electron keeps drawing the game when its window is in the background. Lite runs the game in a separate player, and you can lower that player's quality.

Artix does not support third-party launchers. If AquaStar breaks, open an issue on this repo. The longer history is in [motivation and history](docs/MOTIVATION.md).

## Current development

**AquaStar 3.0** is the active Tauri launcher in [`lite/`](lite/README.md), developed on `dev`. It uses the system webview and starts Ruffle or the Flash projector in a separate window. It includes inventory and Buy Back sync, wiki tools, reminders, to-do, and strategy. Ruffle defaults to Automatic graphics and High quality.

**AquaStar 2.x** is the maintained Electron launcher on `2.x`, with development on `2.x-dev`. It keeps PPAPI Flash, plugins, Char Page Studio, screenshots, and screen recording. Electron is pinned to 11.5.0 for PPAPI support. Older operating systems that cannot run the 3.0 system webview stay on 2.x.

The [3.0 plan](docs/aquastar-3.0-plan.md) describes platform support and feature differences. The [repository map](docs/REPOSITORY.md) explains the shared files. Stable 3.0 publication and the merge into `main` remain pending approval; reorganizing files or branches does not publish a release.

## Install

Downloads are on the [releases page](https://github.com/aquaspy/AquaStar/releases). The release marked Latest is the stable Electron build. A version with a hyphen in it, for example 2.1.1-rc.4, is a pre-release. AquaStar 3.0 is currently available as a pre-release. Earlier Tauri builds used `lite-v` tags and the Lite name; package names below retain that historical name.

`<version>` in the names below is the version of that release.

| System | Electron | Lite |
| --- | --- | --- |
| Windows 64-bit | `AquaStar-Setup-x64.exe` or `AquaStar-Portable-x64-<version>.exe` | `aquastar-lite_<version>_x64-setup.exe` or `AquaStar.Lite_<version>_x64-portable.zip` |
| Windows 32-bit | `AquaStar-Setup-ia32.exe` or `AquaStar-Portable-ia32-<version>.exe` | No Lite build |
| macOS | `AquaStar-<version>-mac-x64.zip` | `AquaStar.Lite_<version>_universal.dmg` |
| Linux 64-bit | `AquaStar-<version>.AppImage` or `AquaStar_<version>_amd64.deb` | `aquastar-lite_<version>_amd64.AppImage` or `aquastar-lite_<version>_amd64.deb` |
| Linux 32-bit | `AquaStar-<version>-i386.AppImage` | No Lite build |
| Linux 32-bit ARM | `AquaStar-<version>-armv7l.AppImage` | No Lite build |

### Windows

The Setup file is an installer. The Portable exe is a single program you can run without installing. On Lite, unzip `AquaStar.Lite_<version>_x64-portable.zip` and run `aquastar-lite.exe`. Leave `portable.txt` and the `players` folder next to that exe. Lite then keeps its data in a `data` folder in the same place.

### macOS

Neither Mac build is notarized. The release build signs them without an Apple Developer ID. macOS puts a quarantine flag on a downloaded app, and Gatekeeper then blocks it. Gatekeeper's usual message is that the app is damaged.

For Electron, unzip the archive and move `AquaStar.app` into `/Applications`. Then, in Terminal:

```bash
xattr -cr /Applications/AquaStar.app
```

That command removes the quarantine flag from the app and everything inside it. Open the app after that.

The Electron zip is an x64 app. On Apple Silicon, macOS runs it with Rosetta, and asks you to install Rosetta if it is missing. Flash is an Intel plugin loaded inside the app. It loads only when AquaStar itself is the x64 process. Rosetta does not translate the plugin on its own. If you need to start that binary yourself:

```bash
arch -x86_64 /Applications/AquaStar.app/Contents/MacOS/AquaStar
```

Ruffle runs without the Flash plugin. In Electron, choose it in Settings.

For Lite, open the disk image and copy `aquastar-lite.app` into `/Applications`. Finder shows the name AquaStar Lite. The file name is `aquastar-lite.app`. Clear the same flag:

```bash
xattr -cr /Applications/aquastar-lite.app
```

The Lite disk image is a universal app. Ruffle is the default player. On Apple Silicon that Ruffle is Artix's arm64 `ruffle_desktop`. On an Intel Mac it is the official Ruffle 0.7.1 universal build. Ruffle defaults to Automatic graphics and High quality. Play Flash starts the bundled Intel projector. On Apple Silicon, macOS runs that projector under Rosetta while the launcher itself stays arm64. If Rosetta is not installed, the launcher says so and names `softwareupdate --install-rosetta`. Ruffle does not need Rosetta.

Lite launches the signed Flash projector and passes the Loader4 URL. The Mac menu bar stays. Artix's `ruffle_desktop` is started with `--title AquaStar Lite`. The Intel Ruffle build has no title flag, so on Windows and Linux an X11 window whose title starts with Ruffle is renamed from outside the process. The Flash window is titled AquaStar Lite on Windows and Linux.

### Linux

Mark an AppImage executable, then run it.

```bash
chmod +x AquaStar-<version>.AppImage
./AquaStar-<version>.AppImage
```

The same `chmod +x` works for `aquastar-lite_<version>_amd64.AppImage`. That AppImage carries the GTK 2 libraries the Flash projector needs.

The deb packages install with apt. From the directory that contains the file:

```bash
sudo apt install ./AquaStar_<version>_amd64.deb
```

```bash
sudo apt install ./aquastar-lite_<version>_amd64.deb
```

The Lite deb depends on GTK 2, `libgtk2.0-0t64` or `libgtk2.0-0`, on `libnss3`, and on `libxkbcommon-x11-0`. It also depends on `libssl3`, `libasound2t64` or `libasound2`, `libegl1`, and `libfontconfig1`, which Artix's `ruffle_desktop` loads. Apt installs those with the package. GTK 2 and NSS are for the Flash projector. If the projector still cannot start, Lite names the missing library and exits with code 127. Ruffle loads `libxkbcommon-x11` when it opens an X11 window.

Artix's Ruffle build is MIT or Apache-2.0. The text shipped with the binary is [lite/licenses/artix-ruffle-1.7.0-LICENSE.md](lite/licenses/artix-ruffle-1.7.0-LICENSE.md), and the credit is [lite/licenses/artix-ruffle-1.7.0-NOTICE.md](lite/licenses/artix-ruffle-1.7.0-NOTICE.md).

## Build from source

For active **3.0 development**, install Rust and the platform dependencies listed in [lite/README.md](lite/README.md), then:

```bash
git clone --branch dev https://github.com/aquaspy/AquaStar.git
cd AquaStar/lite/src-tauri
cargo build --locked
```

For a local build that can also start the launcher, run `bash lite/scripts/build-local.sh --run` from the repository root. Add `--release` for an optimized build. Packaging and player setup are covered in the Lite README.

For **Electron 2.x development**, use its maintained branch:

```bash
git clone --branch 2.x-dev https://github.com/aquaspy/AquaStar.git
cd AquaStar
npm ci
npm start
```

`npm run dist` packages Electron for the current OS. The shared tooling on `dev` also includes the legacy multi-architecture entry point, `bash scripts/build-all-arch.sh`. Release workflows require a version tag; building locally does not publish a release.
