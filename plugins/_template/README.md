# AquaStar plugin template

Starter stub for a new Flash-game companion plugin.

## Setup

1. Copy this folder to:
   - **Bundled:** `plugins/<your-id>/` (ships inside the next AquaStar release), or
   - **Local:** `%AppData%/AquaStar/plugins/<your-id>/` (no rebuild; enable + trust in Settings)
2. Rename `id` in `plugin.json` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`).
3. Point `setPrimaryGame` in `main.js` at your SWF URL; adjust permissions if you add features.
4. In AquaStar: **Alt+9 → General** → select the plugin → Save → restart.

## Docs

The short steps above are not enough for real plugins. Read the full guide:

**[`docs/PLUGINS.md`](../../docs/PLUGINS.md)** — discovery, packaging, Host API, session rules, injections, Settings sections, locales, storage, IPC, web build, debugging.

Also useful:

- Design: [`docs/design/plugin-architecture.md`](../../docs/design/plugin-architecture.md)
- Minimal fixture: `test/fixtures/sample-plugin/`
- Full example: `plugins/adventure-quest-worlds/`
