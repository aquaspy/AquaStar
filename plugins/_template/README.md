# AquaStar plugin template

Copy this folder to `plugins/<your-id>/` (bundled) or `%AppData%/AquaStar/plugins/<your-id>/` (local, after local plugins are enabled).

1. Edit `plugin.json`: set a unique `id` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), name, version, and permissions.
2. Edit `main.js`: point `setPrimaryGame` at your SWF URL and register menus/keybinds.
3. Restart AquaStar with your plugin selected (plugin selector lands in a later PR).

Full contract: `docs/design/plugin-architecture.md`.
