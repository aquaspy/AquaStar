# AquaStar

![AquaStar](https://raw.githubusercontent.com/aquaspy/AquaStar/dev/Icon/Icon_1024.png)

AquaStar is a desktop launcher and companion for AdventureQuest Worlds, with support for DragonFable. It provides inventory tools, wiki access, reminders, tasks, and strategy planning. It does not automate gameplay.

Classic AquaStar is this Electron app. The game runs inside its window. Stable releases are on `main`. Development is on `dev`. AquaStar NEO is a separate Tauri launcher. Its source is on the [`neo`](https://github.com/aquaspy/AquaStar/tree/neo) and [`neo-dev`](https://github.com/aquaspy/AquaStar/tree/neo-dev) branches, and it is not in this tree. The game runs in a separate player.

## Project goals

- Keep AQW and its companion tools accessible from one launcher.
- Use the system webview in AquaStar NEO instead of bundling Chromium for that launcher.
- Preserve inventory, Buy Back, wiki, reminders, to-do, and strategy workflows across both products.
- Keep this Electron app for its embedded player, capture tools, Electron plugin compatibility, and older operating systems.
- Keep game SWFs unchanged. NEO uses pinned player downloads with checksum verification.
- Test candidate releases before replacing the current stable release.

Artix does not support third-party launchers. Report AquaStar issues in this repository. See the [project history](https://github.com/aquaspy/AquaStar/blob/dev/docs/MOTIVATION.md) for background.

## Choose a version

| Feature                                        | Classic AquaStar                             | AquaStar NEO                                                                                                               |
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
| Game screenshots and screen recording          | Yes                                           | Yes, video only                                                                                                            |
| Char Page Studio and character-page printing   | Yes                                           | Char Page Studio (own Ruffle window; PNG/GIF saving on Windows). Alt+K character-page printing is not included            |
| Plugins                                        | Electron plugin host and local plugins        | Desktop plugin API v2: games, links and isolated web tools; incompatible with Electron plugins                             |
| Launcher interface                             | Embedded game and companion windows           | Play, Tools, Useful Pages, Plugins, and Preferences                                                                        |

In NEO, the launcher can stay open during gameplay or hide until the player exits. Its supported tools reuse the compatible JSON profile files from classic AquaStar. The standalone player remains a separate window.

Both lines use the saved login for the AQW account site to sync inventory and Buy Back; the Account window does not need to stay open. Signing in to the game is separate from signing in to the account site.

NEO supports several plugins at once, installed from local ZIP packages. They can add games, links, interactive tools, menus and shortcuts through a restricted API. They do not reuse Electron plugins or receive access to your account session. See the [NEO plugin guide](https://github.com/aquaspy/AquaStar/blob/neo/docs/DESKTOP-PLUGINS.md).

On Linux and Windows, the NEO menu bar is hidden by default. Enable **Preferences → Show menu bar** to display it; keyboard shortcuts remain available while it is hidden. macOS keeps its system application menu.

### System support

| System  | Classic AquaStar                                                    | AquaStar NEO                                                      |
| ------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Windows | x64 and 32-bit packages, including the legacy Windows 7 and 8.1 line | Windows 10 or later, x64 packages                                 |
| macOS   | Intel x64 application; Apple Silicon uses Rosetta                    | macOS 11 or later, universal launcher for Intel and Apple Silicon |
| Linux   | x64, i386, and armv7l packages                                       | x64 packages on systems with WebKitGTK 4.1                        |

The [NEO platform matrix](https://github.com/aquaspy/AquaStar/blob/neo/docs/neo-plan.md#platform-matrix) distinguishes published package targets from other player pins and possible ports. A player pin does not mean an installer exists for that architecture. There is no Android build.

On Apple Silicon, NEO runs the launcher and Artix Ruffle natively. The Flash projector is Intel and requires Rosetta. Intel Macs use the pinned official Ruffle build. The macOS builds are not notarized. Installation details are in the [NEO guide](https://github.com/aquaspy/AquaStar/blob/neo/README.md).

## Downloads

**[Download AquaStar 2.1.0](https://github.com/aquaspy/AquaStar/releases/tag/v2.1.0)**, the current stable Electron release.

Choose the installer or portable package for your system and architecture. The macOS ZIP contains an Intel application; Apple Silicon uses Rosetta. On Linux, mark an AppImage executable before opening it, or install the Debian package with your package manager.

AquaStar NEO is developed on [`neo-dev`](https://github.com/aquaspy/AquaStar/tree/neo-dev). Stable NEO is [`neo`](https://github.com/aquaspy/AquaStar/tree/neo). Its version sequence starts at 1.0.0. Release tags use `neo-v*`. Those releases are not marked Latest. Latest stays this classic Electron release. Older `v3.0.0-*` tags remain as history. Build instructions are in the [NEO guide](https://github.com/aquaspy/AquaStar/blob/neo/README.md).

## Branches

| Branch                                                        | Role                                      |
| ------------------------------------------------------------- | ----------------------------------------- |
| `main`                                                        | Classic Electron stable. This is the default branch. |
| [`dev`](https://github.com/aquaspy/AquaStar/tree/dev)         | Classic Electron development              |
| [`neo`](https://github.com/aquaspy/AquaStar/tree/neo)         | AquaStar NEO stable                       |
| [`neo-dev`](https://github.com/aquaspy/AquaStar/tree/neo-dev) | AquaStar NEO development                  |

`main` and `dev` contain this Electron app. `neo` and `neo-dev` contain AquaStar NEO.

## Repository structure

This checkout is the classic Electron app.

| Path                        | Contents                                                         |
| --------------------------- | ---------------------------------------------------------------- |
| `main.js`, `res/`           | Electron entry point and platform code                           |
| `plugins/`                  | Electron plugins and first-party assets                          |
| `FlashPlayer/`, `Icon/`, `build/` | Runtime and packaging resources. `build/` contains tracked icons |
| `scripts/`                  | Checks and Electron packaging scripts                            |
| `test/`                     | JavaScript regression tests and fixtures                         |
| `docs/`                     | Architecture, plans, examples, and project history               |
| `docs/design/icon-sources/` | Editable logo source files                                       |
| `.github/workflows/`        | Electron tests, builds, and releases                             |

AquaStar NEO has its own tree on `neo` and `neo-dev`. It does not live in this checkout.

Generated dependencies, compiler output, logs, and installers stay outside version control. A local workspace can group builds, SDK files, worktrees, backups, and reports beside the checkout. See the [repository map](https://github.com/aquaspy/AquaStar/blob/dev/docs/REPOSITORY.md).

## Develop and build

Classic AquaStar:

```bash
git clone --branch dev https://github.com/aquaspy/AquaStar.git
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

AquaStar NEO is built from the `neo-dev` branch. See the [NEO guide](https://github.com/aquaspy/AquaStar/blob/neo-dev/README.md).

The [plugin guide](docs/PLUGINS.md) covers the Electron plugin API. The [NEO plugin guide](https://github.com/aquaspy/AquaStar/blob/neo/docs/DESKTOP-PLUGINS.md) covers the NEO API. The [NEO plan](https://github.com/aquaspy/AquaStar/blob/neo/docs/neo-plan.md) records NEO scope and release gates.
