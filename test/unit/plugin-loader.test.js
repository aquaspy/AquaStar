const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const platform = require('../../res/platform');
const schema = platform.manifestSchema;

const fixtureRoot = path.join(__dirname, '../fixtures/sample-plugin');
const repoRoot = path.join(__dirname, '../..');

function silentLog() {}

test('manifest schema accepts the sample plugin fixture', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'plugin.json'), 'utf8'));
  const result = schema.validateManifest(raw, { appVersion: '1.12.2' });
  assert.strictEqual(result.ok, true, (result.errors || []).join('; '));
});

test('manifest schema rejects unknown permissions and path escapes', () => {
  const badPerm = schema.validateManifest({
    id: 'bad-plugin',
    name: 'Bad',
    version: '1.0.0',
    apiVersion: 1,
    main: 'main.js',
    minAppVersion: '1.12.2',
    permissions: ['rootkit']
  }, { appVersion: '1.12.2' });
  assert.strictEqual(badPerm.ok, false);
  assert.ok(badPerm.errors.some(function (e) { return /Unknown permission/.test(e); }));

  const badMain = schema.validateManifest({
    id: 'bad-plugin',
    name: 'Bad',
    version: '1.0.0',
    apiVersion: 1,
    main: '../escape.js',
    minAppVersion: '1.12.2'
  }, { appVersion: '1.12.2' });
  assert.strictEqual(badMain.ok, false);
  assert.ok(badMain.errors.some(function (e) { return /main must be a relative path/.test(e); }));
});

test('manifest schema requires fetchAllowlist when net-fetch is declared', () => {
  const result = schema.validateManifest({
    id: 'needs-allowlist',
    name: 'Needs',
    version: '1.0.0',
    apiVersion: 1,
    main: 'main.js',
    minAppVersion: '1.12.2',
    permissions: ['net-fetch']
  }, { appVersion: '1.12.2' });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(function (e) { return /fetchAllowlist/.test(e); }));
});

test('discoverPlugins finds the sample fixture and skips _template', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aquastar-plugins-'));
  const bundled = path.join(tmp, 'bundled');
  fs.mkdirSync(bundled);
  // Copy fixture into a fake bundled tree.
  const dest = path.join(bundled, 'sample-swf');
  fs.mkdirSync(dest);
  fs.copyFileSync(path.join(fixtureRoot, 'plugin.json'), path.join(dest, 'plugin.json'));
  fs.copyFileSync(path.join(fixtureRoot, 'main.js'), path.join(dest, 'main.js'));

  // Mimic repo layout: also ensure real _template is skipped when scanning plugins/
  const discovered = platform.discoverPlugins({
    bundledDir: path.join(repoRoot, 'plugins'),
    appVersion: '1.12.2',
    log: silentLog
  });
  const ids = discovered.plugins.map(function (p) { return p.manifest.id; });
  assert.ok(ids.indexOf('my-flash-game') === -1, '_template must be skipped');

  const fromTmp = platform.discoverPlugins({
    bundledDir: bundled,
    appVersion: '1.12.2',
    log: silentLog
  });
  assert.strictEqual(fromTmp.plugins.length, 1);
  assert.strictEqual(fromTmp.plugins[0].manifest.id, 'sample-swf');
});

test('activatePlugin loads sample fixture and registers primary game', async () => {
  const discovered = platform.discoverPlugins({
    bundledDir: path.dirname(fixtureRoot),
    appVersion: '1.12.2',
    log: silentLog
  });
  // discoverPlugins lists dirs with plugin.json; fixtures/ has sample-plugin/
  // Rename expectation: folder name need not match id; find by id.
  let plugin = null;
  for (let i = 0; i < discovered.plugins.length; i++) {
    if (discovered.plugins[i].manifest.id === 'sample-swf') plugin = discovered.plugins[i];
  }
  // If discover scanned fixtures/ and found sample-plugin:
  if (!plugin) {
    plugin = {
      root: fixtureRoot,
      manifest: JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'plugin.json'), 'utf8')),
      source: 'bundled'
    };
    const validated = schema.validateManifest(plugin.manifest, { appVersion: '1.12.2' });
    assert.strictEqual(validated.ok, true);
  }

  const opened = [];
  const activated = await platform.activatePlugin(plugin, {
    appVersion: '1.12.2',
    appDataDirectory: path.join(os.tmpdir(), 'aquastar-plugin-data'),
    clearRequireCache: true,
    log: silentLog,
    deps: {
      openPrimaryGame: function () {
        opened.push('primary');
        return { id: 'fake-window' };
      }
    }
  });

  const state = activated.host._getState();
  assert.ok(state.primaryGame);
  assert.strictEqual(state.primaryGame.id, 'sample-main');
  assert.strictEqual(state.primaryGame.getUrl(), 'https://example.com/game.swf');
  assert.strictEqual(state.keybinds.length, 1);
  assert.strictEqual(state.keybinds[0].id, 'newGame');
  assert.ok(state.trustedFlashUrls.indexOf('https://example.com/game.swf') !== -1);
  assert.deepStrictEqual(state.stores.meta.read(), { activated: true });

  // Keybind action should call the injected openPrimaryGame.
  state.keybinds[0].action();
  assert.deepStrictEqual(opened, ['primary']);
});

test('local plugin id collision with bundled fails unless override is allowed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aquastar-collision-'));
  const bundled = path.join(tmp, 'bundled');
  const local = path.join(tmp, 'local');
  fs.mkdirSync(path.join(bundled, 'sample-swf'), { recursive: true });
  fs.mkdirSync(path.join(local, 'sample-swf'), { recursive: true });
  const files = ['plugin.json', 'main.js'];
  files.forEach(function (name) {
    fs.copyFileSync(path.join(fixtureRoot, name), path.join(bundled, 'sample-swf', name));
    fs.copyFileSync(path.join(fixtureRoot, name), path.join(local, 'sample-swf', name));
  });

  const blocked = platform.discoverPlugins({
    bundledDir: bundled,
    localDir: local,
    enableLocalPlugins: true,
    allowLocalPluginOverride: false,
    appVersion: '1.12.2',
    log: silentLog
  });
  assert.ok(blocked.errors.some(function (e) { return /conflicts with bundled/.test(e); }));
  assert.strictEqual(blocked.plugins.length, 1);
  assert.strictEqual(blocked.plugins[0].source, 'bundled');

  const allowed = platform.discoverPlugins({
    bundledDir: bundled,
    localDir: local,
    enableLocalPlugins: true,
    allowLocalPluginOverride: true,
    appVersion: '1.12.2',
    log: silentLog
  });
  assert.strictEqual(allowed.plugins.length, 1);
  assert.strictEqual(allowed.plugins[0].source, 'local');
});

test('resolvePluginFlags defaults pluginSystem on (PR 2+) unless disabled', () => {
  const flags = platform.resolvePluginFlags({}, {});
  assert.strictEqual(flags.pluginSystem, true);
  assert.strictEqual(flags.enableLocalPlugins, false);
  assert.strictEqual(flags.allowLocalPluginOverride, false);
  assert.strictEqual(flags.activePluginId, 'adventure-quest-worlds');

  const explicitOff = platform.resolvePluginFlags({ pluginSystem: false }, {});
  assert.strictEqual(explicitOff.pluginSystem, false);

  const disabled = platform.resolvePluginFlags({ pluginSystem: true }, {
    AQUASTAR_DISABLE_PLUGINS: '1'
  });
  assert.strictEqual(disabled.pluginSystem, false);
});
