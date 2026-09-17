const assert = require('assert');
const fs = require('fs');
const path = require('path');

const platform = require('../../res/platform');
const root = path.join(__dirname, '../../plugins/example-companion');

test('example-companion manifest validates', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  const result = platform.manifestSchema.validateManifest(raw, { appVersion: '1.12.2' });
  assert.strictEqual(result.ok, true, (result.errors || []).join('; '));
});

test('example-companion ships compiled boxmover.swf and AS3 source', () => {
  assert.ok(fs.existsSync(path.join(root, 'assets', 'boxmover.swf')));
  assert.ok(fs.existsSync(path.join(root, 'assets', 'rectangle.swf')));
  assert.ok(fs.existsSync(path.join(root, 'flash', 'BoxMover.as')));
  assert.ok(fs.existsSync(path.join(root, 'flash', 'build.bat')));
  const swf = fs.readFileSync(path.join(root, 'assets', 'boxmover.swf'));
  assert.ok(['CWS', 'FWS', 'ZWS'].indexOf(swf.slice(0, 3).toString('ascii')) !== -1);
  assert.ok(swf.length > 500, 'boxmover.swf must be a real compiled movie, not a stub');
});

test('instances only wraps real .swf URLs with swf_wrapper', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../res/instances.js'), 'utf8');
  assert.ok(src.indexOf('_looksLikeSwfUrl') !== -1);
  assert.ok(src.indexOf('_looksLikeSwfUrl(originalPath)') !== -1);
});

test('example-companion activate registers core Host capabilities', async () => {
  const plugin = {
    root: root,
    manifest: JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8')),
    source: 'bundled'
  };
  const opened = [];
  const activated = await platform.activatePlugin(plugin, {
    appVersion: '1.12.2',
    appDataDirectory: path.join(__dirname, '../tmp-example-plugin-data'),
    clearRequireCache: true,
    log: function () {},
    deps: {
      openPrimaryGame: function () { opened.push('primary'); return {}; },
      openUrl: function (u) { opened.push(u); return {}; },
      openFeatureWindow: function (id) { opened.push(id); return {}; },
      fetchText: function () {
        return Promise.resolve({
          ok: true,
          html: JSON.stringify({
            full_name: 'aquaspy/AquaStar',
            stargazers_count: 1,
            description: 'test'
          })
        });
      }
    }
  });

  const state = activated.host._getState();
  assert.ok(state.primaryGame);
  const primaryUrl = state.primaryGame.getUrl();
  assert.ok(primaryUrl.indexOf('boxmover.swf') !== -1);
  assert.strictEqual(state.primaryGame.isGameUrl(primaryUrl), true);
  assert.strictEqual(state.primaryGame.isGameUrl(primaryUrl.replace('boxmover', 'nope')), false);
  assert.ok(state.sessionRules.length >= 1);
  assert.ok(state.navigationHooks && state.navigationHooks.onDidFinishLoad);
  assert.ok(state.menuProviders && state.menuProviders.appUsefulPages);
  assert.ok(state.keybinds.some(function (b) { return b.id === 'openGithub'; }));
  assert.ok(state.keybinds.some(function (b) { return b.id === 'openPluginsDocs'; }));
  assert.ok(state.settingsSections.some(function (s) { return s.id === 'example-demo'; }));
  assert.ok(state.featureWindows.some(function (w) { return w.id === 'example-dashboard'; }));
  assert.ok(state.optionDefaults.demoPlayerName);

  const pages = state.menuProviders.appUsefulPages({});
  // Modern GitHub must open externally on Electron 11 / Chromium 87.
  assert.ok(pages.some(function (p) { return p.openMode === 'external'; }));
  assert.ok(pages.every(function (p) {
    return !p.url || p.openMode === 'external' || p.url.indexOf('github.com') === -1;
  }));

  state.keybinds.filter(function (b) { return b.id === 'newStage'; })[0].action();
  assert.ok(opened.indexOf('primary') !== -1);
});

test('discoverPlugins finds example-companion bundled plugin', () => {
  const discovered = platform.discoverPlugins({
    bundledDir: path.join(__dirname, '../../plugins'),
    appVersion: '1.12.2',
    log: function () {}
  });
  const ids = discovered.plugins.map(function (p) { return p.manifest.id; });
  assert.ok(ids.indexOf('example-companion') !== -1);
  assert.ok(ids.indexOf('my-flash-game') === -1);
});
