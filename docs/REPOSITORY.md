# Repository map

AquaStar 3.0 lives in `desktop/`. The root still contains the Electron platform and shared game assets, because the Tauri build reads several of those assets directly. Moving these runtime paths requires a separate migration of their consumers and packaging rules.

| Path | Purpose |
| --- | --- |
| `desktop/src-tauri/` | Tauri launcher, Rust commands, capabilities, and native configuration |
| `desktop/ui/` | Shipped 3.0 launcher and tool pages |
| `desktop/src-tauri/games/`, `desktop/players.json`, `desktop/licenses/` | Game manifests, pinned standalone players, and their notices |
| `desktop/plugins/` | Desktop plugin manifests: `adventure-quest-worlds/` is the bundled AQW plugin compiled into the binary; `example-companion/` is the starter for packages |
| `desktop/scripts/` | Local Tauri builds, player preparation, packaging, and smoke checks |
| `main.js`, `res/` | Electron entry point and platform code |
| `plugins/` | Electron plugins and shared first-party assets consumed by 3.0 |
| `FlashPlayer/`, `Icon/`, `build/` | Runtime binaries and packaging resources; `build/` contains source-controlled icons, not compiler output |
| `scripts/` | Shared tooling and Electron packaging; `build-all-arch.sh` is the legacy multi-architecture entry point |
| `test/` | JavaScript regression tests and fixtures |
| `docs/` | Plans, contributor guides, and historical documentation |
| `docs/design/` | UI and architecture documents, previews, and editable icon sources in `icon-sources/` |
| `docs/examples/aquastar.json` | Example Electron profile; runtime profiles belong in the application's data directory |
| `.github/` | CI and release workflows |
| `LICENSE.md` | Original project license notice |

`docs/design/launcher-3.0-preview.html` and `docs/design/launcher-3.1-plugins-preview.html` are design artifacts. The second shows the plugin-driven launcher that the `launcher_model` command feeds; it is not wired to the shipped UI yet. The installed launcher is built from `desktop/ui/`, which now implements the approved design.

## Branch contract

- `main`: stable 3.x line after the separately approved merge.
- `dev`: 3.x development.
- `2.x`: maintained 2.x stable line, replacing `electron-2.x`.
- `2.x-dev`: 2.x development.

The user authorized the agreed branch cleanup. This repository organization does not itself merge into `main`, tag a stable release, or change GitHub Latest. Those release actions remain pending explicit approval under the [3.0 plan](aquastar-3.0-plan.md).

## Generated files

Keep generated output out of version control: `node_modules/`, `dist/`, `work/`, `work-*/`, `releases/`, `web-dist/`, `desktop/src-tauri/target/`, and downloaded player caches. Local diagnostic output belongs in ignored `logs/`; the application does not maintain a log buffer in the repository. Screenshots and recordings belong in the application's configured output directory.

Local test builds, SDK files, and branch-history backups can live beside the checkout instead of inside the source tree. Keep backups until the retained branches and local test builds have been verified. Do not remove bundled players, Flash binaries, SWFs, or shared assets as part of artifact cleanup.
