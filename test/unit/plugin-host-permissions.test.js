const assert = require('assert');
const path = require('path');
const { createPluginHost } = require('../../res/platform/plugin-host.js');

function baseManifest(extra) {
  const manifest = {
    id: 'perm-test',
    name: 'Perm Test',
    version: '1.0.0',
    apiVersion: 1,
    main: 'main.js',
    minAppVersion: '1.12.2',
    permissions: [],
    capabilities: []
  };
  Object.keys(extra || {}).forEach(function (key) {
    manifest[key] = extra[key];
  });
  return manifest;
}

function makeHost(manifest, deps) {
  return createPluginHost({
    manifest: manifest,
    pluginRoot: path.join(__dirname, '../fixtures/sample-plugin'),
    appVersion: '1.12.2',
    appDataDirectory: path.join(__dirname, '../tmp-plugin-data'),
    deps: deps || {}
  });
}

test('PluginHost throws when registerSessionRules lacks web-request', () => {
  const host = makeHost(baseManifest());
  assert.throws(function () {
    host.registerSessionRules([{ id: 'r1', urls: ['*://example.com/*'] }]);
  }, /without permission "web-request"/);
});

test('PluginHost allows registerSessionRules with web-request', () => {
  const host = makeHost(baseManifest({ permissions: ['web-request'] }));
  host.registerSessionRules([{
    id: 'r1',
    urls: ['*://example.com/*'],
    onBeforeRequest: function (details, ctx, callback) {
      callback({ cancel: false });
    }
  }]);
  assert.strictEqual(host._getState().sessionRules.length, 1);
});

test('PluginHost rejects duplicate session rule ids', () => {
  const host = makeHost(baseManifest({ permissions: ['web-request'] }));
  host.registerSessionRules([{ id: 'dup', urls: ['*://a/*'] }]);
  assert.throws(function () {
    host.registerSessionRules([{ id: 'dup', urls: ['*://b/*'] }]);
  }, /Duplicate session rule id/);
});

test('PluginHost requires inject-scripts for navigation injection hooks', () => {
  const host = makeHost(baseManifest());
  assert.throws(function () {
    host.registerNavigationHooks({
      onDidFinishLoad: function () {}
    });
  }, /without permission "inject-scripts"/);

  const allowed = makeHost(baseManifest({
    permissions: ['inject-scripts'],
    injectHostPatterns: ['example.com']
  }));
  allowed.registerNavigationHooks({ onDidFinishLoad: function () {} });
  assert.ok(allowed._getState().navigationHooks.onDidFinishLoad);
});

test('PluginHost requires flash-trust for trustFlashUrls', () => {
  const host = makeHost(baseManifest());
  assert.throws(function () {
    host.trustFlashUrls(['https://example.com/game.swf']);
  }, /without permission "flash-trust"/);
});

test('PluginHost requires persistent-store for getStore', () => {
  const host = makeHost(baseManifest());
  assert.throws(function () {
    host.getStore('x');
  }, /without permission "persistent-store"/);

  const allowed = makeHost(baseManifest({ permissions: ['persistent-store'] }));
  const store = allowed.getStore('x');
  store.write({ a: 1 });
  assert.deepStrictEqual(store.read(), { a: 1 });
});

test('PluginHost requires spawn-helper-process and keeps scripts inside plugin root', () => {
  const host = makeHost(baseManifest());
  assert.throws(function () {
    host.windows.spawnHelperProcess({
      argvFlag: '--charpage-studio',
      scriptRelativePath: 'processes/studio.js'
    });
  }, /without permission "spawn-helper-process"/);

  const allowed = makeHost(baseManifest({ permissions: ['spawn-helper-process'] }));
  const stub = allowed.windows.spawnHelperProcess({
    argvFlag: '--charpage-studio',
    scriptRelativePath: 'main.js'
  });
  assert.ok(stub.scriptPath.indexOf('sample-plugin') !== -1);

  assert.throws(function () {
    allowed.windows.spawnHelperProcess({
      argvFlag: '--x',
      scriptRelativePath: '../escape.js'
    });
  }, /inside the plugin root|escaped plugin root|relative path/);
});

test('PluginHost net.fetchText enforces fetchAllowlist', async () => {
  const host = makeHost(baseManifest({
    permissions: ['net-fetch'],
    fetchAllowlist: ['https://allowed.example/*']
  }));

  const denied = await host.net.fetchText('https://evil.example/page');
  assert.strictEqual(denied.ok, false);
  assert.ok(/fetchAllowlist/.test(denied.error));

  const calls = [];
  const wired = makeHost(baseManifest({
    permissions: ['net-fetch'],
    fetchAllowlist: ['https://allowed.example/*']
  }), {
    fetchText: function (url) {
      calls.push(url);
      return Promise.resolve({ ok: true, html: '<ok/>' });
    }
  });
  const ok = await wired.net.fetchText('https://allowed.example/item');
  assert.strictEqual(ok.ok, true);
  assert.deepStrictEqual(calls, ['https://allowed.example/item']);
});

test('PluginHost namespaces third-party IPC channels', () => {
  const recorded = [];
  const host = createPluginHost({
    manifest: baseManifest({ id: 'third-party-game' }),
    pluginRoot: path.join(__dirname, '../fixtures/sample-plugin'),
    deps: {
      ipcHandle: function (channel, listener) {
        recorded.push({ channel: channel, listener: listener });
      }
    }
  });
  host.ipc.handle('ping', function () { return 'pong'; });
  assert.strictEqual(recorded[0].channel, 'plugin:third-party-game:ping');
});

test('PluginHost keeps legacy IPC names for adventure-quest-worlds', () => {
  const recorded = [];
  const host = createPluginHost({
    manifest: baseManifest({
      id: 'adventure-quest-worlds',
      apiVersion: 1
    }),
    pluginRoot: path.join(__dirname, '../fixtures/sample-plugin'),
    legacyIpc: true,
    deps: {
      ipcHandle: function (channel) {
        recorded.push(channel);
      }
    }
  });
  host.ipc.handle('getReminders', function () { return {}; });
  assert.strictEqual(recorded[0], 'getReminders');
});

test('PluginHost rejects platform-reserved keybind ids', () => {
  const host = makeHost(baseManifest());
  assert.throws(function () {
    host.registerKeybinds([{ id: 'settings', action: function () {} }]);
  }, /reserved for the platform/);
});

test('PluginHost requires unsafe-renderer for plugins:true feature windows', () => {
  const host = makeHost(baseManifest());
  assert.throws(function () {
    host.registerFeatureWindows([{
      id: 'wiki',
      title: 'Wiki',
      url: 'https://example.com',
      config: { webPreferences: { plugins: true } }
    }]);
  }, /without permission "unsafe-renderer"/);

  const allowed = makeHost(baseManifest({ permissions: ['unsafe-renderer'] }));
  allowed.registerFeatureWindows([{
    id: 'wiki',
    title: 'Wiki',
    url: 'https://example.com',
    config: { webPreferences: { plugins: true } }
  }]);
  assert.strictEqual(allowed._getState().featureWindows.length, 1);
});
