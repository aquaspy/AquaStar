# AquaStar plugin authoring guide

AquaStar is an Electron **11.5.0** shell with PPAPI Flash. Game-specific behavior lives in **plugins**. The bundled reference implementation is **Adventure Quest Worlds** (`plugins/adventure-quest-worlds/`).

This guide is for people writing a second (or third) plugin. Architecture background: [`docs/design/plugin-architecture.md`](design/plugin-architecture.md).

---

## 1. Mental model

| Layer | Owns |
|-------|------|
| **Platform** | Flash PPAPI bootstrap, window factory, screenshots/recording, Settings shell (tabs), plugin loader/Host, ad-block |
| **Active plugin** | Primary SWF URL(s), extra launches, menus/keybinds for the game, page injections, feature windows, locales, optional Settings fields, optional web tools |
| **User** | Chooses `activePluginId`, may drop **local** plugins under AppData |

Rules that surprise people:

- **One plugin active per process.** Changing it in Settings requires an **app restart**.
- Plugins are plain **CommonJS** folders (`require`), not webpack bundles or Chromium extensions.
- After trust, a **local** plugin has the same power as app code (full Node/Electron). The Host API is the *supported* contract, not a sandbox.
- Official plugins ship **inside** the installer/portable build. Local plugins live **outside** it (AppData).

---

## 2. Where plugins live (discovery)

At startup AquaStar scans folders for `plugin.json`:

| Kind | Path | When |
|------|------|------|
| **Bundled** | `<app root>/plugins/<id>/` | Always |
| **Local** | `%AppData%/AquaStar/plugins/<id>/` (Windows) / equivalent `app.getPath('appData')/AquaStar/plugins` | Only if **Enable local plugins** is on |

`plugins/_template/` is **skipped** by discovery (name `_template`).

**Installer / portable:** electron-builder uses `asar: false` and `files: ["**/*", …]`, so everything under repo `plugins/` (except ignored junk) is copied into the app. Runtime then reads `__dirname/plugins`, not your git checkout.

**Id collision:** if a local plugin reuses a bundled `id`, it is rejected unless **Allow local plugins to override bundled ids** is enabled.

---

## 3. Quick start — minimal SWF plugin

Goal: AquaStar opens your Flash URL and Alt+N opens another window.

### 3.1 Create the folder

**Bundled (ships with the app — needs a new AquaStar release):**

```text
plugins/my-flash-game/
  plugin.json
  main.js
```

**Local (no rebuild of AquaStar):**

```text
%AppData%/AquaStar/plugins/my-flash-game/
  plugin.json
  main.js
```

Copy from `plugins/_template/` (empty skeleton) or study `plugins/example-companion/` (full demo). Contract fixture: `test/fixtures/sample-plugin/`.

### 3.2 `plugin.json`

```json
{
  "id": "my-flash-game",
  "name": "My Flash Game",
  "version": "1.0.0",
  "apiVersion": 1,
  "main": "main.js",
  "minAppVersion": "1.12.2",
  "description": "Example companion plugin",
  "author": "you",
  "permissions": ["flash-trust"],
  "capabilities": ["game-launch", "keybinds", "menus"]
}
```

`id` must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

### 3.3 `main.js`

```js
function activate(host) {
  const GAME = 'https://example.com/game/Loader.swf';

  host.setPrimaryGame({
    id: 'my-game-main',
    getUrl: function () { return GAME; },
    title: function () { return 'AquaStar - My Flash Game'; },
    isGameUrl: function (url) {
      return typeof url === 'string' && url.indexOf(GAME) === 0;
    },
    wrap: { preferDirectWmode: true, ruffleEligible: false },
    flashTrust: true
  });

  // Permission: flash-trust
  host.trustFlashUrls([GAME]);

  host.registerKeybindDefaults({ newGame: 'Alt+N' });
  host.registerKeybinds([{
    id: 'newGame',
    action: function () { host.windows.openPrimaryGame(); }
  }]);

  host.registerMenus(function (ctx) {
    return [{
      label: 'My Game',
      submenu: [{
        label: 'New Game Window',
        click: function () { ctx.actions.newGame(); }
      }]
    }];
  });
}

module.exports = { activate: activate };
```

### 3.4 Activate it

1. Run AquaStar (`npm start` in dev, or your installed build).
2. **Alt+9 → General**
   - Local plugins: enable **Load local plugins**, **Trust** your plugin, Save, restart if asked.
3. Set **Active plugin** to *My Flash Game*, Save, confirm restart.
4. Main window should load your SWF; Alt+N opens another game window.

If activation fails, AquaStar logs `[AquaStar:plugins] …` and may fall back to AQW / legacy boot.

---

## 4. Progressive features (what to add next)

Do these in order; each needs the matching **permission** in `plugin.json`.

### 4.1 Extra launches (testing build, second title)

```js
host.registerLaunches([
  {
    id: 'my-testing',
    keybindId: 'newTest',
    getUrl: function () { return 'https://example.com/game/Loader_Test.swf?ver=1'; },
    title: function () { return 'AquaStar - Testing'; },
    wrap: { preferDirectWmode: true, ruffleEligible: false },
    flashTrust: true
  }
]);
host.registerKeybindDefaults({ newTest: 'Alt+Q' });
host.registerKeybinds([{
  id: 'newTest',
  action: function () { host.windows.openLaunch('my-testing'); }
}]);
```

Include every trusted SWF URL in `host.trustFlashUrls([...])` (permission `flash-trust`).

### 4.2 Session rules (UA spoof, request logging)

Permission: `web-request`.

Electron callback shapes **must** match Chromium 87:

```js
host.registerSessionRules([
  {
    id: 'my-ua',
    urls: ['*://example.com/*'],
    onBeforeSendHeaders: function (details, ctx, callback) {
      details.requestHeaders['User-Agent'] = ctx.spoofedUA;
      callback({ requestHeaders: details.requestHeaders });
    }
  },
  {
    id: 'my-log',
    urls: ['*://example.com/game/*'],
    enabledWhen: function (settings) { return !!settings.swfLog; },
    onBeforeRequest: function (details, ctx, callback) {
      if (ctx.logLine) ctx.logLine(details.url);
      callback({ cancel: false });
    }
  }
]);
```

Rules are **register-once per process** (another reason plugin switch = restart).

### 4.3 Navigation / script injection

Permission: `inject-scripts`. Manifest **must** include `injectHostPatterns` (hostnames only).

```json
"permissions": ["inject-scripts"],
"injectHostPatterns": ["wiki.example.com", "account.example.com"]
```

```js
host.registerNavigationHooks({
  classify: function (url) {
    if (/wiki\.example\.com/i.test(url)) return 'wiki';
    return 'other';
  },
  onDidFinishLoad: async function (ctx) {
    if (ctx.isGameWindow) return;
    if (ctx.classify && ctx.classify(ctx.url) !== 'wiki') return;
    await ctx.executeJavaScriptSafely(
      'console.log("injected by my plugin")',
      'My wiki tweak'
    );
  }
});
```

The Host refuses injection when the page host is outside `injectHostPatterns`.

### 4.4 Settings fields (Active plugin tab)

```js
host.registerSettingsSection({
  id: 'my-account',
  titleKey: 'account',          // optional → settingsMessages.settingsSections.account
  title: 'Account',             // fallback
  order: 10,
  fields: [
    { key: 'playerCharacter', type: 'text', sanitize: 'alphanumeric' },
    { key: 'myFeatureFlag', type: 'boolean' }
  ]
});
```

Labels/hints: put them in your locale under `settingsMessages.optionLabels` / `optionHints`.

Values still save to **top-level** keys in `aquastar.json` (same file as the rest of Settings). Prefer unique key names (`myFeatureFlag`) so you do not clash with AQW or platform keys.

Platform already owns (General tab): active plugin, local trust, custom game URL / local SWF override, recording format, Ruffle, DevTools, show game menu.

### 4.5 Locales

```js
host.registerLocales({
  'en-US': require('./locales/en-US.js'),
  'pt-BR': require('./locales/pt-BR.js')
});
```

Export namespaces the UI expects, for example:

```js
// locales/en-US.js
exports.settingsMessages = {
  optionLabels: { playerCharacter: 'Player name' },
  optionHints: { playerCharacter: '…' },
  settingsSections: { account: 'Account' }
};
exports.menuMessages = { /* optional */ };
```

Do **not** put keys under reserved `platformMessages` — they are ignored.

### 4.6 Persistent JSON

Permission: `persistent-store`.

```js
const store = host.getStore('progress'); // → aquastar.<pluginId>.progress.json
store.write({ level: 1 });
const data = store.readOrCreate(function () { return { level: 0 }; });
```

**AQW special case:** namespaces `reminders` / `todo` / `strategy` / `inventory` keep the historic filenames `aquastar_reminders.json`, etc. Third-party plugins always get `aquastar.<id>.<ns>.json`.

**Settings / keybinds (`aquastar.json`) — hybrid:** platform chrome stays **top-level** (`settings`, `sshot`, `record`, `recordingFormat`, `customUrl`, plugin flags…). Game keybinds and plugin options live under **`plugins[<activeId>]`**, with legacy top-level fallback and dual-write on save. Register defaults with `host.registerOptionDefaults({ ... })`.

### 4.7 IPC from your feature windows

Third-party channels are prefixed: `plugin:<your-id>:<channel>`.

```js
host.ipc.handle('getProgress', function () {
  return host.getStore('progress').readOrCreate(function () { return {}; });
});
```

**Preloads with `sandbox: true` (recommended):** only `require('electron')` — do **not** `require()` other project files (Electron 11 sandboxed preloads fail and the page sees no API).

```js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aquastarPlugin', {
  getProgress: function () {
    return ipcRenderer.invoke('plugin:my-flash-game:getProgress');
  }
});
```

`res/platform/preload-bridge.js` is for documentation / non-sandboxed experiments only.

Bundled `adventure-quest-worlds` keeps **legacy unprefixed** names for compatibility (`getReminders`, …). New plugins should not rely on bare names.

### 4.8 Feature windows

```js
host.registerFeatureWindows([{
  id: 'my-tracker',
  title: 'Tracker',
  url: 'file://' + require('path').join(__dirname, 'ui/tracker.html'),
  config: { width: 800, height: 600, webPreferences: { /* … */ } }
}]);
```

If `webPreferences.plugins === true` or `webSecurity === false`, you need permission **`unsafe-renderer`**.

Open with `host.windows.openFeatureWindow('my-tracker')` once the platform wires that path for your registration (follow AQW feature windows / `res/windows/config.js` patterns for production-quality windows).

### 4.9 Helper Electron processes (advanced)

Permission: `spawn-helper-process`. Script path must stay **inside the plugin directory** (no `..`).

Used by AQW Char Page Studio. Most plugins never need this.

### 4.10 Web tools site (`npm run web:build`)

Optional. Export `contributeWebBuild` from the path in `plugin.json` → `"web": { "contribute": "web/contribute.js" }`.

See `plugins/adventure-quest-worlds/web/contribute.js` for the full contribution object (landing, tools HTML, bridges, shared kits, locale modules). Today the default site build focuses on the **default plugin (AQW)** at `tools/*`.

---

## 5. Manifest reference

| Field | Required | Notes |
|-------|----------|--------|
| `id` | yes | kebab-case id |
| `name` | yes | Shown in Settings |
| `version` | yes | Your plugin version |
| `apiVersion` | yes | Must be `1` |
| `main` | yes | Relative path to CJS entry, no `..` |
| `minAppVersion` | yes | AquaStar semver floor (e.g. `1.12.2`) |
| `permissions` | no | Unknown entries → **load failure** |
| `capabilities` | no | Advisory list for humans/UI |
| `fetchAllowlist` | if `net-fetch` | URL prefixes; `*` suffix allowed |
| `injectHostPatterns` | if `inject-scripts` | Hostnames only |
| `web.contribute` | no | Relative path to Node module |

### Permissions → Host methods

| Permission | Gates |
|------------|--------|
| `web-request` | `registerSessionRules` |
| `inject-scripts` | `registerNavigationHooks` when it injects |
| `net-fetch` | `net.fetchText` (+ allowlist) |
| `flash-trust` | `trustFlashUrls` |
| `persistent-store` | `getStore` |
| `spawn-helper-process` | `windows.spawnHelperProcess` |
| `unsafe-renderer` | Feature windows with Flash plugins / `webSecurity: false` |

Missing permission → throw during `activate` → activation fails.

---

## 6. Host API cheat sheet

Available on `host` inside `activate(host)`:

**Identity / paths:** `pluginId`, `pluginRoot`, `pluginDataDirectory`, `appRootPath`, `appDataDirectory`, `appVersion`

**Game:** `setPrimaryGame(cfg)`, `registerLaunches([...])`, `trustFlashUrls([...])`

**Chrome:** `registerKeybindDefaults(obj)`, `registerKeybinds([...])`, `registerMenus(fn)`, `registerMenuPages({ appUsefulPages, gameMenuPages })`, `registerFeatureWindows([...])`, `registerSettingsSection(section)`, `registerLocales(catalog)`

**Network / pages:** `registerSessionRules([...])`, `registerNavigationHooks(hooks)`, `net.fetchText(url)`

**IPC / storage:** `ipc.handle` / `ipc.on` / `ipc.removeHandler`, `getStore(ns)`

**Windows:** `windows.openPrimaryGame()`, `windows.openLaunch(id)`, `windows.openFeatureWindow(id)`, `windows.openUrl(url, mode)`, `windows.openExternal(url)`, `windows.spawnHelperProcess(opts)`

Use `openExternal` / menu `openMode: 'external'` for modern sites such as **github.com**. Electron 11 ships Chromium 87, which cannot load GitHub’s current frontend (import maps / bare `react` specifiers → broken CSS/JS).

**Logging:** `host.log(msg)`

### Keybind ids reserved by the platform

Do not register: `settings`, `fullscreen`, `sshot`, `record`, `reload`, `reloadCache`, `help`, `about`, `forward`, `backward`.

### Menu `openMode` (important UX)

| Surface | Typical `openMode` | Behavior |
|---------|--------------------|----------|
| App menu “useful pages” | `in-place` | `loadURL` in the focused window |
| Keybind / game menu open page | `new-window` | new BrowserWindow |

Copy AQW’s split if you expose the same link both as menu item and shortcut — see `plugins/adventure-quest-worlds/menus.js`.

---

## 7. Recommended layout for a non-trivial plugin

```text
plugins/my-flash-game/
  plugin.json
  main.js                 # activate() only wires modules
  urls.js
  session.js
  menus.js
  keybinds.js
  injections/
    navigation.js
  locales/
    en-US.js
    pt-BR.js
  features/
    tracker/
      tracker.js          # ipcMain side effects on require
      tracker.html
      preload_tracker.js
  web/
    contribute.js         # optional
```

Keep `activate()` thin: require submodules and call `host.*`, same pattern as AQW.

---

## 8. Development workflow

### Bundled plugin (in this repo)

```bash
npm install
# edit plugins/my-flash-game
npm start
# Alt+9 → select plugin → restart
npm test
```

Ship it: commit under `plugins/`, bump AquaStar if needed, tag a release. Portable + NSIS/AppImage all receive the folder via electron-builder.

### Local plugin (against an installed AquaStar)

1. Create `%AppData%/AquaStar/plugins/my-flash-game/`.
2. Enable local plugins + trust in Settings → General.
3. Select as active plugin → restart.
4. Iterate by editing files on disk and restarting AquaStar (no `npm start` required).

`minAppVersion` must be ≤ the installed app version.

### Debugging

- Watch the terminal / console for `[AquaStar:plugins]`.
- Manifest errors appear at discovery (unknown permission, bad `main`, etc.).
- Duplicate `ipcMain.handle` channels crash Electron 11 — do not register the same channel twice.
- Flash trust: if the SWF is blank/blocked, confirm `trustFlashUrls` and `flash-trust` permission.
- Settings fields missing: confirm `registerSettingsSection` ran and locales merged; open the **plugin** tab (not General).

### Flags in `aquastar.json`

| Flag | Default | Meaning |
|------|---------|---------|
| `pluginSystem` | `true` | `false` or env `AQUASTAR_DISABLE_PLUGINS=1` → legacy boot |
| `activePluginId` | `adventure-quest-worlds` | Which plugin’s `activate` runs |
| `enableLocalPlugins` | `false` | Scan AppData plugins |
| `allowLocalPluginOverride` | `false` | Local may replace bundled id |
| `trustedLocalPlugins` | `{}` | `{ "my-flash-game": true }` |

---

## 9. What “done” looks like for a solid plugin

Checklist:

- [ ] Valid `plugin.json` (`apiVersion: 1`, permissions match Host calls)
- [ ] `setPrimaryGame` + `isGameUrl` + `trustFlashUrls`
- [ ] At least one way to open a new game window (keybind and/or menu)
- [ ] No use of platform-reserved keybind ids
- [ ] Locales for any Settings fields you register
- [ ] Restart-tested from Settings plugin picker
- [ ] If local: trust flow tested on a clean AppData
- [ ] If bundled: present under `plugins/` in a `npm run pack` / release artifact

---

## 10. Reference implementations

| Path | Role |
|------|------|
| `plugins/_template/` | Starter stub (minimal) |
| `plugins/example-companion/` | **Worked example** — shipped `boxmover.swf` (arrows move a square), GitHub/docs keybinds, menus, session, injection, settings, dashboard |
| `test/fixtures/sample-plugin/` | Contract-test fixture (minimal) |
| `plugins/adventure-quest-worlds/` | Full production plugin (AQW) |

Start from **`example-companion`** to see every Host surface wired. Use **`_template`** only when you want an empty skeleton. For production complexity, copy patterns from AQW.

---

## 11. Security model (honest)

Plugins run **in-process** as CommonJS in Electron’s main (and their own preloads). That is **full trust** once enabled — the Host is a *supported API*, not a hard sandbox.

What the Host already confines:

| API | Guard |
|-----|--------|
| `getStore(ns)` | JSON only under appData (`aquastar.<pluginId>.<ns>.json` or AQW aliases) |
| `net.fetchText` | Requires `net-fetch` + manifest `fetchAllowlist` + default UA |
| `windows.openExternal` | `http(s):` only |
| `windows.spawnHelperProcess` | Script path must stay inside `pluginRoot` |
| `readPluginText(rel)` | Relative path, no `..`, must resolve under `pluginRoot` |
| Session / inject | Declared permissions + allowlists / host patterns |
| Local `require` | **Local plugins only:** blocks `fs` / `child_process` / `worker_threads` / `cluster` and path escapes outside `pluginRoot` (caller must be under the plugin). Bundled plugins are not gated. |

i18n helpers: `host.getLocaleId()`, `host.getLocaleStrings(ns)`, `host.getAppIconPath()`.

Sandboxed preload helper: `require('res/platform').buildSandboxedPreloadSource({ pluginId, methods })`.

What plugins can still do if malicious (in-process CJS, especially **bundled**):

- Bypass Host with allowed builtins / `electron`
- Register arbitrary `ipcMain` handlers if they obtain a reference

Mitigations in practice:

1. **Bundled plugins** = reviewed code in this repo  
2. **Local plugins** = off by default + trust prompt + require gate  
3. Prefer Host APIs (`getStore`, `readPluginText`, `net.fetchText`) over raw Node  
4. Do not open modern sites like **github.com** inside Electron 11 — use `openExternal`  
5. CI: `npm run smoke:plugins`

## 12. Non-goals (do not expect these yet)

- Plugin marketplace / remote install / auto-update of plugins
- Multiple plugins active in one process
- Strong sandbox / OS-level confinement for untrusted third-party code
- Hot-reload without restart
- Separate `.aqplugin` installer format (distribution is still “a folder”)
