# AquaStar NEO desktop plugins

Desktop plugins extend the launcher with games, links and isolated web tools. They use a new API; Electron 2.x plugins are not compatible. Multiple desktop plugins can be active together. AQW remains built in.

## Installing and managing

Open **Plugins → Install from ZIP…**, choose a package, review its requested permissions and approve installation. Install packages only from authors you trust. Restart using the displayed button to apply installations, updates, removals and enable/disable changes. Nothing restarts automatically.

**Manage plugins** installs, enables and removes plugins. Each active plugin has its own page in the launcher's sidebar, where its tools open in separate windows, its links in the default browser and its games in the player chosen on the game's card. Games do not inherit the main game's custom SWF/URL override.

Removal preserves saved data unless **Also delete saved plugin data** is selected. Updating preserves data and requires reviewing permissions again. For recovery, start AquaStar NEO with `AQUASTAR_DISABLE_PLUGINS=1`; third-party plugins will not activate.

## Package format

Use `desktop/plugins/example-companion/` as a starter. ZIP the files inside the directory, placing `plugin.json` at the archive root. Do not ZIP the parent directory. Include all resources locally; no remote scripts, frames, native libraries or executables are supported.

`plugin.json` uses `format: "aquastar-desktop-plugin"` and `apiVersion: 1`. Its `id` is a stable unique identifier and `version` is a semantic version. Optional `minAppVersion` sets the oldest compatible AquaStar NEO version. Declare contributions as follows:

- `games`: `id`, `name`, and either an HTTPS `url` or a package-relative SWF `file`.
- `links`: `id`, `name`, HTTPS `url`.
- `tools`: `id`, `name`, package-relative HTML `entry`.
- `actions`: `id`, `name`, `kind` (`game`, `link`, `tool`) and matching contribution `target`.
- `menus`: references through `action`; `shortcuts`: `action` and `accelerator`.

Declare an action for each contribution that should be accessible in the launcher. Identifiers must be unique within the package. Built-in identifiers and shortcuts are reserved; conflicting shortcuts are reported rather than replacing existing behavior.

Permissions are `storage`, `network`, `launch` and `links`. Network access additionally requires exact HTTPS origins in `origins`, such as `https://api.github.com`. Request only what the plugin needs. Storage is namespaced by plugin identity and limited to 1 MiB per plugin. Package paths cannot escape the archive directory.

## API 2: launcher layout, icons and players

`apiVersion: 2` adds optional fields. API 1 packages keep working and cannot use them.

- `icon`: package-relative PNG or SVG, at most 64 KB. AquaStar NEO reads it and hands the launcher a data URI.
- `games[].description`, `games[].icon`.
- `games[].engines`: `[{ "engine": "ruffle" | "flash", "platforms": ["windows","linux","macos"], "arch": ["x86","x86_64","aarch64"], "default": true }]`. Order is the order shown. `platforms` and `arch` are optional filters. Without `engines`, a game offers every player AquaStar NEO ships for the system. The list the user sees is always intersected with what is available on that system, so a plugin cannot offer a player AquaStar NEO does not have.
- `links[].group`: heading the launcher lists the link under.
- `searches`: `{ id, name, placeholder, urlTemplate, sanitize }`. `urlTemplate` is an HTTPS URL with exactly one `{q}`; the query is percent-encoded. `sanitize: "alphanumeric"` keeps only ASCII letters and digits. Results open in the default browser and need the `links` permission.
- `launcherParameters`: `{ "id": "aqw", "defaultGame": "aqw" }`. `id` is the plugin's command id on the command line (`--aqw`): lowercase letters, digits and hyphens, at most 32, and not one of the words AquaStar NEO already uses (`game`, `launcher`, `no-launcher`, `help`, `version`, `ruffle`, `flash` and those followed by a version). It is separate from the plugin's stable `id`, which names its saved data. `defaultGame` is what `--<id> --no-launcher` opens; without it, the first game that has a launcher action. If two plugins ask for the same command id, the first keeps it (the bundled plugin, then installed ones by id) and the other is reported.
- `launcher.blocks`: the page layout, in order. `type` is `games`, `tools`, `links` or `search`; `title` is optional; `items` lists ids of that kind (empty means all). Without `launcher`, AquaStar NEO shows games, tools, links and searches in that order. The layout is data: plugin code never runs in the launcher.

Global preferences (hiding the launcher, the menu bar, language, Ruffle quality and graphics, plugin management) stay in AquaStar NEO and are not part of a layout a plugin declares.

The launcher reads the result of the `launcher_model` command: for each active plugin, its blocks with games (each with the players available here, the default and the saved choice), tools, link groups and searches. `play_game` opens a game with a chosen player and `launcher_search` runs a search.

## Command line and start-up

Every plugin with `launcherParameters` can be started from the command line, and the same words work for all of them. The launcher lists them: on the plugin page (the command under each game and each tool) and under Preferences > Command line.


```
aquastar-neo --aqw                           show the launcher on that plugin's page
aquastar-neo --aqw --no-launcher             open its default game straight away, with no launcher window
aquastar-neo --aqw --game=dragonfable --no-launcher        another game of the plugin
aquastar-neo --aqw --ruffle1.7 --no-launcher   pick the player and its version (also --ruffle=1.7, --flash, --flash32)
aquastar-neo --aqw --tool=inventory --no-launcher   open a tool instead of a game (any tool the plugin lists)
aquastar-neo --aqw --launcher                show the launcher even if a start-up game is saved
aquastar-neo --example-plugin                a plugin without games shows its page
aquastar-neo --no-launcher                   open the game saved under Preferences > On start-up
```

A command that names a plugin shows the launcher on its page; `--no-launcher` skips the launcher and goes straight to the plugin's default game, and AquaStar NEO then closes when the game does. `--game`, `--tool` and the player options only take effect together with `--no-launcher` (without it the launcher says so). With `--tool=<id>` it opens that tool's window instead and closes when the last window is closed. A tool is any `tools[]` entry of the plugin that has a launcher action (every tool of the bundled plugin), so each plugin's tools get commands without declaring anything. `--game` and `--tool` cannot be combined; the game wins. `--launcher` shows the launcher even when a start-up game is saved. A player or version AquaStar NEO does not ship for the system (`--ruffle9.9`), an unknown plugin, game or tool, or a game or tool without a launcher action falls back to the launcher with a message instead of failing silently. Players are chosen from the game's `engines`; a version matches whole components (`1.7` matches `1.7.0`).

**Preferences > On start-up** saves one game to open every time AquaStar NEO starts without arguments, which gives the behaviour of the old Electron app: no launcher, straight into the game. `--launcher` or naming a plugin overrides it. A second `aquastar-neo --...` while AquaStar NEO is running is carried out by the running instance.

### Built-in example plugin

`example-companion` also ships inside the executable (`src/extensions/builtin.rs` embeds `desktop/plugins/example-companion/`). Unlike AQW it is an ordinary package: same manifest rules, permissions and isolated tool windows. It is written to `extensions/builtin/example-companion/` at start-up, listed as built in, and cannot be disabled or removed. An installed package with the same id is ignored, and a ZIP with that id is refused at review. It stays available in safe mode. Its saved data is kept under the same id.

### The bundled plugin

AQW is described by `desktop/plugins/adventure-quest-worlds/plugin.json` and compiled into the binary. It is listed like any plugin but cannot be disabled or removed. Only it may use `tools[].builtin` (windows implemented by AquaStar NEO: `inventory`, `reminders`, `todo`, `strategy`, `studio`, and the `settings` alias for launcher Preferences), `games[].resolver` (host movie resolvers such as the live AQW loader and the custom SWF/URL override) and `links` blocks with `source: "menu:useful"`. Packages that use these are rejected, and the ids `adventure-quest-worlds` and `aquastar` stay reserved for the host.

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

Tool windows use nonpersistent web sessions; use SDK storage for durable data. Browser storage is not a persistence contract. Tools cannot access the filesystem, processes, other plugins, account information or arbitrary AquaStar NEO commands. An external game's SWF runs in its player; the SDK's permissions are not a sandbox for that SWF.

## Lifecycle and testing

Tools are created on demand and have no background execution. Installed changes apply after restart, allowing already-open tools to finish using the active version. Package updates must keep the same `id`; changing it creates a distinct plugin and distinct saved data.

Test installation, update, removal with and without data, disable/enable, safe mode and simultaneous tools from two plugins. Verify offline/error states and keyboard use. Test on Windows, Linux and macOS: a working browser preview alone cannot establish native WebView isolation.
