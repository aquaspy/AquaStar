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

test('example-companion ships stage, SWF asset, and AS3 source', () => {
  assert.ok(fs.existsSync(path.join(root, 'stage', 'index.html')));
  assert.ok(fs.existsSync(path.join(root, 'assets', 'rectangle.swf')));
  assert.ok(fs.existsSync(path.join(root, 'flash', 'BoxMover.as')));
  const swf = fs.readFileSync(path.join(root, 'assets', 'rectangle.swf'));
  assert.strictEqual(String.fromCharCode(swf[0], swf[1], swf[2]), 'FWS');
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
  assert.ok(state.primaryGame.getUrl().indexOf('stage') !== -1);
  assert.ok(state.sessionRules.length >= 1);
  assert.ok(state.navigationHooks && state.navigationHooks.onDidFinishLoad);
  assert.ok(state.menuProviders && state.menuProviders.appUsefulPages);
  assert.ok(state.keybinds.some(function (b) { return b.id === 'openGithub'; }));
  assert.ok(state.keybinds.some(function (b) { return b.id === 'openPluginsDocs'; }));
  assert.ok(state.settingsSections.some(function (s) { return s.id === 'example-demo'; }));
  assert.ok(state.featureWindows.some(function (w) { return w.id === 'example-dashboard'; }));
  assert.ok(state.optionDefaults.demoPlayerName);

  const pages = state.menuProviders.appUsefulPages({});
  assert.ok(pages.some(function (p) { return p.openMode === 'in-place'; }));

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
