# Repository map

This is the maintained Electron 2.x source tree. Use `2.x-dev` for maintenance development and `2.x` for its stable line. Current Tauri 3.0 development lives on `dev`; the `lite/` snapshot on this branch is historical.

| Path | Purpose |
| --- | --- |
| `main.js`, `res/` | Electron entry point, platform, settings, and window code |
| `plugins/` | Bundled game plugins, features, locales, and tools |
| `FlashPlayer/`, `Icon/`, `build/` | Runtime Flash binaries and packaging resources; `build/` contains source-controlled icons |
| `scripts/` | Build and verification tooling; `build-all-arch.sh` is the legacy multi-architecture entry point |
| `test/` | Regression tests and fixtures |
| `lite/` | Historical Tauri snapshot; use `dev` for current 3.0 work |
| `docs/` | Guides, plans, and historical documentation |
| `docs/design/icon-sources/` | Editable Krita logo sources |
| `docs/examples/aquastar.json` | Example profile; real profiles belong in application data |
| `.github/` | CI and release workflows |
| `LICENSE.md` | Original project license notice |

The root runtime and plugin paths remain intact. The 3.0 branch also consumes shared plugin assets, so moving those paths requires coordinating their consumers and packaging rules across the lines. No SWFs or bundled runtime binaries were removed.

## Branch contract

- `main`: stable 3.x line after a separately approved merge.
- `dev`: 3.x development.
- `2.x`: maintained 2.x stable line, renamed from `electron-2.x`.
- `2.x-dev`: 2.x development.
- `cursor/electron-mac-zip-symlinks-99c5`: preserved exception with maintenance commits pending review.

The agreed branch cleanup was authorized. File organization does not authorize a release tag, a change to GitHub Latest, or a merge into `main`. Those release actions remain pending explicit approval.

## Generated files

Keep dependencies and build output out of source control: `node_modules/`, `dist/`, `work/`, `work-*/`, `releases/`, `web-dist/`, and Tauri compiler output. Local diagnostic files belong in ignored `logs/`; the application does not maintain a repository log buffer. Screenshots and recordings belong in the application's configured output directory.

Local test builds, SDK files, and branch-history backups belong beside the checkouts. Retain backups until the kept branches and builds have been verified. Runtime assets, players, Flash binaries, and SWFs are not disposable build output.
