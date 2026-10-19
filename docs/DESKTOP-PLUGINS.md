# AquaStar 3.x desktop plugins

Desktop plugins extend the launcher with games, links and isolated web tools. They use a new API; Electron 2.x plugins are not compatible. Multiple desktop plugins can be active together. AQW remains built in.

## Installing and managing

Open **Plugins → Install from ZIP…**, choose a package, review its requested permissions and approve installation. Install packages only from authors you trust. Restart using the displayed button to apply installations, updates, removals and enable/disable changes. Nothing restarts automatically.

The manager lists each plugin's tools, games and links. Actions open tools in separate windows, links in the default browser and games in the selected external player. Games do not inherit the main game's custom SWF/URL override.

Removal preserves saved data unless **Also delete saved plugin data** is selected. Updating preserves data and requires reviewing permissions again. For recovery, start AquaStar with `AQUASTAR_DISABLE_PLUGINS=1`; third-party plugins will not activate.

## Package format

Use `desktop/plugins/example-companion/` as a starter. ZIP the files inside the directory, placing `plugin.json` at the archive root. Do not ZIP the parent directory. Include all resources locally; no remote scripts, frames, native libraries or executables are supported.

`plugin.json` uses `format: "aquastar-desktop-plugin"` and `apiVersion: 1`. Its `id` is a stable unique identifier and `version` is a semantic version. Optional `minAppVersion` sets the oldest compatible AquaStar version. Declare contributions as follows:

- `games`: `id`, `name`, and either an HTTPS `url` or a package-relative SWF `file`.
- `links`: `id`, `name`, HTTPS `url`.
- `tools`: `id`, `name`, package-relative HTML `entry`.
- `actions`: `id`, `name`, `kind` (`game`, `link`, `tool`) and matching contribution `target`.
- `menus`: references through `action`; `shortcuts`: `action` and `accelerator`.

Declare an action for each contribution that should be accessible in the launcher. Identifiers must be unique within the package. Built-in identifiers and shortcuts are reserved; conflicting shortcuts are reported rather than replacing existing behavior.

Permissions are `storage`, `network`, `launch` and `links`. Network access additionally requires exact HTTPS origins in `origins`, such as `https://api.github.com`. Request only what the plugin needs. Storage is namespaced by plugin identity and limited to 1 MiB per plugin. Package paths cannot escape the archive directory.

## API 2: launcher layout, icons and players

`apiVersion: 2` adds optional fields. API 1 packages keep working and cannot use them.

- `icon`: package-relative PNG or SVG, at most 64 KB. AquaStar reads it and hands the launcher a data URI.
- `games[].description`, `games[].icon`.
- `games[].engines`: `[{ "engine": "ruffle" | "flash", "platforms": ["windows","linux","macos"], "arch": ["x86","x86_64","aarch64"], "default": true }]`. Order is the order shown. `platforms` and `arch` are optional filters. Without `engines`, a game offers every player AquaStar ships for the system. The list the user sees is always intersected with what is available on that system, so a plugin cannot offer a player AquaStar does not have.
- `links[].group`: heading the launcher lists the link under.
- `searches`: `{ id, name, placeholder, urlTemplate, sanitize }`. `urlTemplate` is an HTTPS URL with exactly one `{q}`; the query is percent-encoded. `sanitize: "alphanumeric"` keeps only ASCII letters and digits. Results open in the default browser and need the `links` permission.
- `launcher.blocks`: the page layout, in order. `type` is `games`, `tools`, `links` or `search`; `title` is optional; `items` lists ids of that kind (empty means all). Without `launcher`, AquaStar shows games, tools, links and searches in that order. The layout is data: plugin code never runs in the launcher.

Global preferences (hiding the launcher, the menu bar, language, Ruffle quality and graphics, plugin management) stay in AquaStar and are not part of a layout a plugin declares.

The launcher reads the result of the `launcher_model` command: for each active plugin, its blocks with games (each with the players available here, the default and the saved choice), tools, link groups and searches. `play_game` opens a game with a chosen player and `launcher_search` runs a search.

### The bundled plugin

AQW is described by `desktop/plugins/adventure-quest-worlds/plugin.json` and compiled into the binary. It is listed like any plugin but cannot be disabled or removed. Only it may use `tools[].builtin` (windows implemented by AquaStar), `games[].resolver` (host movie resolvers such as the live AQW loader and the custom SWF/URL override) and `links` blocks with `source: "menu:useful"`. Packages that use these are rejected, and the ids `adventure-quest-worlds` and `aquastar` stay reserved for the host.

## Tool SDK

The host injects a frozen `window.aquastar` API. Every method is asynchronous:

```js
const api = window.aquastar;
await api.storage.set('note', { text: 'Hello' });
const note = await api.storage.get('note');
await api.storage.remove('note');
const response = await api.net.fetch({ url: 'https://api.github.com/repos/aquaspy/AquaStar' });
const body = JSON.parse(response.body); // { status, body } response
await api.actions.run('open-project');
const host = await api.host.info();
```

Use separate JavaScript files linked with `<script src="main.js"></script>`. Inline scripts, `eval`, remote scripts, frames and direct network requests are blocked. Use `net.fetch` for GET requests to declared public HTTPS origins. Redirects are rejected; authorize and request the final URL. The host enforces a 2 MiB response limit and a 15-second timeout, and does not provide account cookies or credentials.

Tool windows use nonpersistent web sessions; use SDK storage for durable data. Browser storage is not a persistence contract. Tools cannot access the filesystem, processes, other plugins, account information or arbitrary AquaStar commands. An external game's SWF runs in its player; the SDK's permissions are not a sandbox for that SWF.

## Lifecycle and testing

Tools are created on demand and have no background execution. Installed changes apply after restart, allowing already-open tools to finish using the active version. Package updates must keep the same `id`; changing it creates a distinct plugin and distinct saved data.

Test installation, update, removal with and without data, disable/enable, safe mode and simultaneous tools from two plugins. Verify offline/error states and keyboard use. Test on Windows, Linux and macOS: a working browser preview alone cannot establish native WebView isolation.
