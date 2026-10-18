# AquaStar

![AquaStar](Icon/Icon_1024.png)

AquaStar is a launcher for Adventure Quest Worlds.

It is not a cheat and it is not a bot. It does not play the game for you. Electron's extra windows track tasks and inventory. Electron keeps drawing the game when its window is in the background. Lite runs the game in a separate player, and you can lower that player's quality.

Artix does not support third-party launchers. If AquaStar breaks, open an issue on this repo. The longer history is in [motivation and history](docs/MOTIVATION.md).

## Maintained Electron 2.x

This branch maintains the Electron launcher: `2.x` is the stable line and `2.x-dev` is development. AquaStar 3.0 is the Tauri launcher developed on [`dev`](https://github.com/aquaspy/AquaStar/tree/dev); use that branch for its current UI, features, and build instructions. The `lite/` tree here is historical. See the [repository map](docs/REPOSITORY.md).

## The two editions

**AquaStar Electron** is the app maintained on this branch. It is Electron 11 with the PPAPI Flash plugin, so the game runs in Flash Player. Settings can switch a game window to Ruffle instead. That Ruffle build runs inside the page. Settings lists it as "Ruffle (Experimental)". Restart AquaStar after you switch to Ruffle.

Inventory reads your items and BuyBack from account.aq.com after you log in there once with Alt+A. The wiki can then mark items you already own. Reminders track daily and weekly tasks per character. There is a to-do list, a strategy window, a char page screenshot, Char Page Studio, game screenshots, and screen recording. Settings is Alt+9, and the shortcuts can be changed there. Other Flash games can be loaded from a custom URL or a local SWF in Settings. A plugin can add another game. The bundled plugin is Adventure Quest Worlds. See [docs/PLUGINS.md](docs/PLUGINS.md).

Electron runs on Windows 7 and later, in 64-bit and 32-bit builds. Linux builds cover 64-bit, 32-bit, and 32-bit ARM. The Mac build is 64-bit Intel.

**AquaStar Lite** is the Tauri app. It does not bundle Chromium. The launcher window is the system webview. Lite starts a bundled player as its own process. The default player is the standalone Ruffle desktop from Artix's Experimental Launcher 1.7.0. Intel Macs use the official Ruffle 0.7.1 universal build, because that Artix build is Apple Silicon only. Flash is Adobe's standalone projector 32.0.0.465, also bundled. This historical Lite snapshot does not sync inventory; current 3.0 development on `dev` includes inventory sync. Reminders, the to-do list, the strategy window, and char page tools stay in Electron. Wiki, account, and news open in their own windows. You can hide the launcher while a player is running.

Lite runs on Windows 10 and Windows 11, macOS 11 and later, and 64-bit Linux. Windows needs the system WebView2 runtime. The portable zip does not install that runtime. If it is missing, the app says "Could not find the WebView2 Runtime".

## Which one should I pick

Pick Electron for inventory sync, the task windows, char page tools, plugins, or a build for Windows 7, Windows 8.1, or 32-bit Windows.

Pick Lite for the launcher that does not bundle Chromium. The game runs in Ruffle or the Flash projector, in its own process. Lite publishes a Linux deb named aquastar-lite, a Windows portable zip, and a Mac disk image.

On Apple Silicon, both editions can play with Ruffle. Electron Flash is the x64 app under Rosetta. Lite Flash is the Intel projector, which the universal app starts on its own when Rosetta is installed. The macOS steps explain both.

## Install

Downloads are on the [releases page](https://github.com/aquaspy/AquaStar/releases). The release marked Latest is the stable Electron build. A version with a hyphen in it, for example 2.1.1-rc.4, is a pre-release. Lite is published only as a pre-release. Its tag starts with `lite-v`.

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

The Lite disk image is a universal app. Ruffle is the default player. On Apple Silicon that Ruffle is Artix's arm64 `ruffle_desktop`. On an Intel Mac it is the official Ruffle 0.7.1 universal build. On macOS, Ruffle's default graphics backend is Metal. Play Flash starts the bundled Intel projector. On Apple Silicon, macOS runs that projector under Rosetta while the launcher itself stays arm64. If Rosetta is not installed, the launcher says so and names `softwareupdate --install-rosetta`. Ruffle does not need Rosetta.

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

Electron is pinned to 11.5.0. That is the last Electron release whose Chromium still loads PPAPI Flash.

```bash
git clone --branch 2.x-dev https://github.com/aquaspy/AquaStar.git
cd AquaStar
npm install
npm start
```

`npm run dist` packages a build for the OS you are on. The release workflow builds the published installers when a version tag is pushed. `bash scripts/build-all-arch.sh` is the old local script that builds several architectures at once.

Lite's build and packaging notes are in [lite/README.md](lite/README.md).
