# AquaStar

![AquaStar](https://raw.githubusercontent.com/aquaspy/AquaStar/dev/Icon/Icon_1024.png)

AquaStar is a desktop launcher and companion for AdventureQuest Worlds, with support for DragonFable. It provides inventory tools, wiki access, reminders, tasks, and strategy planning. It does not automate gameplay.

The project maintains two lines. **3.x** is the Tauri launcher, with the game running in a separate standalone player. **2.x** is the Electron launcher, with the game inside its window. Both lines remain available so you can choose the features and system support you need.

## Project goals

- Keep AQW and its companion tools accessible from one launcher.
- Use the system webview in 3.x instead of bundling Chromium for the launcher.
- Preserve inventory, Buy Back, wiki, reminders, to-do, and strategy workflows across both lines.
- Maintain 2.x for its embedded player, capture tools, Electron plugin compatibility, and older operating systems.
- Keep game SWFs unchanged and use pinned player downloads with checksum verification in 3.x.
- Test candidate releases before replacing the current stable release.

Artix does not support third-party launchers. Report AquaStar issues in this repository. See the [project history](https://github.com/aquaspy/AquaStar/blob/dev/docs/MOTIVATION.md) for background.

## Choose a version

| Feature                                        | AquaStar 2.x                                  | AquaStar 3.x                                                                                                               |
| ---------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Launcher                                       | Electron 11.5.0, pinned for PPAPI support     | Tauri 2 with the system webview                                                                                            |
| Game window                                    | Embedded in the Electron window               | Separate standalone player window                                                                                          |
| Default player                                 | Flash through PPAPI                           | Ruffle standalone                                                                                                          |
| Alternative player                             | Ruffle Web inside the game page               | Adobe Flash standalone projector                                                                                           |
| Ruffle build                                   | Browser build embedded in Electron            | Artix/AE patched standalone Ruffle 1.7.0 on Windows x64, Linux x64, and Apple Silicon. Official Ruffle 0.7.1 on Intel Macs |
| Ruffle defaults                                | High quality, automatic browser renderer      | High quality, Automatic graphics backend                                                                                   |
| AQW and DragonFable                            | Yes                                           | Yes                                                                                                                        |
| Inventory and Buy Back sync                    | Yes, after logging in to the AQW account site | Yes, after logging in to the AQW account site                                                                              |
| Wiki item ownership and hover previews         | Yes                                           | Yes                                                                                                                        |
| Reminders, to-do, and strategy                 | Yes                                           | Yes                                                                                                                        |
| Useful Pages, wiki search, and character pages | Yes                                           | Yes                                                                                                                        |
| Custom SWF and URL overrides                   | Yes                                           | Yes                                                                                                                        |
| Configurable supported shortcuts               | Yes                                           | Yes, with a smaller action set                                                                                             |
| Game screenshots and screen recording          | Yes                                           | PNG screenshots and MP4 recording with game audio where supported; [capture guide](docs/CAPTURE.md)                                                                                                               |
| Char Page Studio and character-page printing   | Yes                                           | Char Page Studio (own Ruffle window; PNG/GIF saving on Windows). Alt+K character-page printing is not included            |
| Plugins                                        | Electron plugin host and local plugins        | Desktop plugin API v2: games, links and isolated web tools; incompatible with Electron plugins                             |
| Launcher interface                             | Embedded game and companion windows           | Play, Tools, Useful Pages, Plugins, and Preferences                                                                        |

In 3.x, the launcher can stay open during gameplay or hide until the player exits. Its supported tools reuse the compatible JSON profile files from 2.x. The standalone player remains a separate window.

Both lines use the saved login for the AQW account site to sync inventory and Buy Back; the Account window does not need to stay open. Signing in to the game is separate from signing in to the account site.

The 3.x launcher supports several desktop plugins at once, installed from local ZIP packages. They can add games, links, interactive tools, menus and shortcuts through a restricted API. They do not reuse Electron plugins or receive access to your account session. See the [desktop plugin guide](https://github.com/aquaspy/AquaStar/blob/dev/docs/DESKTOP-PLUGINS.md).

On Linux and Windows, the 3.x menu bar is hidden by default. Enable **Preferences → Show menu bar** to display it; keyboard shortcuts remain available while it is hidden. macOS keeps its system application menu.

### System support

| System  | 2.x                                                                  | 3.x                                                               |
| ------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Windows | x64 and 32-bit packages, including the legacy Windows 7 and 8.1 line | Windows 10 or later, x64 packages                                 |
| macOS   | Intel x64 application; Apple Silicon uses Rosetta                    | macOS 11 or later, universal launcher for Intel and Apple Silicon |
| Linux   | x64, i386, and armv7l packages                                       | x64 packages on systems with WebKitGTK 4.1                        |

The [3.0 platform matrix](https://github.com/aquaspy/AquaStar/blob/dev/docs/aquastar-3.0-plan.md#platform-matrix) distinguishes published package targets from other player pins and possible ports. A player pin does not mean an installer exists for that architecture. There is no Android build.

On Apple Silicon, 3.x runs the launcher and Artix Ruffle natively. The Flash projector is Intel and requires Rosetta. Intel Macs use the pinned official Ruffle build. The macOS builds are not notarized; installation details are in the [3.x build and player guide](https://github.com/aquaspy/AquaStar/blob/dev/desktop/README.md).

## Downloads

**[Download AquaStar 2.1.0](https://github.com/aquaspy/AquaStar/releases/tag/v2.1.0)**, the current stable Electron release.

Choose the installer or portable package for your system and architecture. The macOS ZIP contains an Intel application; Apple Silicon uses Rosetta. On Linux, mark an AppImage executable before opening it, or install the Debian package with your package manager.

**[Try AquaStar 3.0.0-rc.5](https://github.com/aquaspy/AquaStar/releases/tag/v3.0.0-rc.5)**, the Tauri pre-release. Recording on macOS still needs real-world testing. RC5 has a Wayland capture issue; a tested correction is available on `dev` and requires a newer build. AquaStar 2.1.0 remains the stable release. Local build instructions are in the [3.x guide](https://github.com/aquaspy/AquaStar/blob/dev/desktop/README.md).

The older AquaStar Lite prototype has been replaced by the 3.x line. The project maintains two lines: Electron 2.x and Tauri 3.x.

The 3.x stable release and application merge into `main` remain pending testing and approval.

## Branches

| Branch                                                        | Role                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `main`                                                        | Default branch and release integration; the 3.x application merge is pending |
| [`dev`](https://github.com/aquaspy/AquaStar/tree/dev)         | Active 3.x development                                                       |
| [`2.x`](https://github.com/aquaspy/AquaStar/tree/2.x)         | Maintained Electron 2.x line                                                 |
| [`2.x-dev`](https://github.com/aquaspy/AquaStar/tree/2.x-dev) | Electron maintenance development                                             |

The old `electron-2.x` branch was renamed to `2.x`. The agreed obsolete branches have been removed after a verified history backup.

## Repository structure

The following paths describe the current development branches. `main` retains the earlier Electron application sources until the application merge.

| Path                                                            | Contents                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `desktop/src-tauri/`                                            | 3.x Rust application, commands, native configuration, and game manifests |
| `desktop/ui/`                                                   | 3.x launcher and companion tool pages                                    |
| `desktop/scripts/`, `desktop/players.json`, `desktop/licenses/` | 3.x builds, smoke checks, pinned players, and notices                    |
| `main.js`, `res/`                                               | Electron entry point and platform code                                   |
| `plugins/`                                                      | Electron plugins and shared first-party assets used by 3.x               |
| `FlashPlayer/`, `Icon/`, `build/`                               | Runtime and packaging resources; `build/` contains tracked icons         |
| `scripts/`                                                      | Shared checks and Electron packaging scripts                             |
| `test/`                                                         | JavaScript regression tests and fixtures                                 |
| `docs/`                                                         | Architecture, plans, examples, and project history                       |
| `docs/design/icon-sources/`                                     | Editable logo source files                                               |
| `.github/workflows/`                                            | Tests, builds, releases, and smoke workflows                             |

The active Tauri application is in `desktop/` on `dev`. The maintenance branches contain only the Electron line; their retired Tauri snapshots have been removed. The shared asset paths remain in place because the Tauri application consumes some Electron feature assets and locales.

Generated dependencies, compiler output, logs, and installers stay outside version control. A local workspace can group builds, SDK files, worktrees, backups, and reports beside the checkout. See the [repository map](https://github.com/aquaspy/AquaStar/blob/dev/docs/REPOSITORY.md).

## Develop and build

For 3.x, install Rust and the [platform build dependencies](https://github.com/aquaspy/AquaStar/blob/dev/desktop/README.md), then:

```bash
git clone --branch dev https://github.com/aquaspy/AquaStar.git
cd AquaStar
bash desktop/scripts/build-local.sh --release --run
```

For Electron 2.x:

```bash
git clone --branch 2.x-dev https://github.com/aquaspy/AquaStar.git
cd AquaStar
npm ci
npm start
```

`npm run dist` packages Electron for the current operating system. `bash scripts/build-all-arch.sh` is the legacy multi-architecture packaging entry point. Local builds do not publish a release.

Run the JavaScript tests and plugin checks from a development checkout:

```bash
npm ci
npm test
npm run smoke:plugins
npm run lint
npm run format:check
```

Run the Rust tests on `dev` with the native build dependencies installed:

```bash
cargo test --locked --manifest-path desktop/src-tauri/Cargo.toml -- --test-threads=1
```

The [desktop plugin guide](https://github.com/aquaspy/AquaStar/blob/dev/docs/DESKTOP-PLUGINS.md) documents the new 3.x API and example package. The [plugin guide](https://github.com/aquaspy/AquaStar/blob/2.x-dev/docs/PLUGINS.md) covers the Electron plugin API. The [3.0 plan](https://github.com/aquaspy/AquaStar/blob/dev/docs/aquastar-3.0-plan.md) records migration scope, platform limits, and release gates. Third-party player license notices are included with their packages and in [desktop/licenses](https://github.com/aquaspy/AquaStar/tree/dev/desktop/licenses).
