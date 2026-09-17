# AquaStar Plugins

AquaStar is a Flash-capable Electron 11 shell. Game-specific behavior lives in **plugins**. The bundled first plugin is **Adventure Quest Worlds** (`plugins/adventure-quest-worlds/`).

Full design: [`docs/design/plugin-architecture.md`](design/plugin-architecture.md).

## Quick start (new plugin)

1. Copy `plugins/_template/` to `plugins/my-game/` (bundled) or `%AppData%/AquaStar/plugins/my-game/` (local).
2. Edit `plugin.json`: unique `id`, `permissions`, `minAppVersion`.
3. Edit `main.js`: `host.setPrimaryGame({...})`, menus, keybinds.
4. Set `activePluginId` in Settings (or `aquastar.json`) and **restart**.

Local plugins require enabling **Enable local plugins** and trusting the plugin (Settings). Treat trusted local plugins as full Node/Electron access.

## Manifest (`plugin.json`)

| Field | Notes |
|-------|--------|
| `id` | `^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| `apiVersion` | Must be `1` |
| `main` | Relative path, no `..` |
| `minAppVersion` | Semver floor (e.g. `1.12.2`) |
| `permissions` | See below — unknown values fail load |
| `fetchAllowlist` | Required with `net-fetch` |
| `injectHostPatterns` | Required with `inject-scripts` |

### Permissions

| Permission | Host APIs |
|------------|-----------|
| `web-request` | `registerSessionRules` |
| `inject-scripts` | `registerNavigationHooks` with injection |
| `net-fetch` | `net.fetchText` (+ allowlist) |
| `flash-trust` | `trustFlashUrls` |
| `persistent-store` | `getStore` |
| `spawn-helper-process` | `windows.spawnHelperProcess` (path must stay in plugin root) |
| `unsafe-renderer` | Feature windows with `plugins: true` / `webSecurity: false` |

## Lifecycle

- `activate(host)` — once per process
- Plugin switch = **restart** (v1)
- `contributeWebBuild()` — optional; used by `npm run web:build` (Node only)

## IPC

- Bundled `adventure-quest-worlds`: **legacy channel names** (`getReminders`, …)
- Third-party: `plugin:<id>:<channel>`

## Storage

- AQW aliases forever: `aquastar_reminders.json`, `aquastar_todo.json`, `aquastar_strategy.json`, `aquastar_inventory.json`
- Others: `aquastar.<pluginId>.<ns>.json`

## Flags (`aquastar.json`)

| Flag | Default |
|------|---------|
| `pluginSystem` | `true` (set `false` or `AQUASTAR_DISABLE_PLUGINS=1` for legacy boot) |
| `activePluginId` | `adventure-quest-worlds` |
| `enableLocalPlugins` | `false` |
| `allowLocalPluginOverride` | `false` |
| `trustedLocalPlugins` | `{}` |

## Sample

See `test/fixtures/sample-plugin/` and `plugins/_template/`.
