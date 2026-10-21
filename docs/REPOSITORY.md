# Repository map

This is classic AquaStar, the Electron app. `main` is the stable branch. `dev` is development. AquaStar NEO lives on `neo` and `neo-dev` and is not in this tree.

| Path | Purpose |
| --- | --- |
| `main.js`, `res/` | Electron entry point, platform, settings, and window code |
| `plugins/` | Bundled game plugins, features, locales, and tools |
| `FlashPlayer/`, `Icon/`, `build/` | Runtime Flash binaries and packaging resources; `build/` contains source-controlled icons |
| `scripts/` | Build and verification tooling; `build-all-arch.sh` is the legacy multi-architecture entry point |
| `test/` | Regression tests and fixtures |
| `docs/` | Guides, plans, and historical documentation |
| `docs/design/icon-sources/` | Editable Krita logo sources |
| `docs/examples/aquastar.json` | Example profile; real profiles belong in application data |
| `.github/` | CI and release workflows |
| `LICENSE.md` | Original project license notice |

This tree does not contain the NEO launcher. NEO keeps its own copies of the plugin assets it needs.

## Branch contract

- `main`: classic Electron stable. This is the default branch.
- `dev`: classic Electron development.
- `neo`: AquaStar NEO stable.
- `neo-dev`: AquaStar NEO development.

Electron workflows in this tree run on `main` and `dev`. They do not build NEO. A release tag, a change to GitHub Latest, or a merge from `dev` into `main` still needs its own approval.

## Generated files

Keep dependencies and build output out of source control: `node_modules/`, `dist/`, `work/`, `work-*/`, `releases/`, `web-dist/`, and Tauri compiler output. Local diagnostic files belong in ignored `logs/`; the application does not maintain a repository log buffer. Screenshots and recordings belong in the application's configured output directory.

Local test builds, SDK files, and branch-history backups belong beside the checkouts. Retain backups until the kept branches and builds have been verified. Runtime assets, players, Flash binaries, and SWFs are not disposable build output.
