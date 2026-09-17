const assert = require('assert');
const fs = require('fs');
const path = require('path');

const platform = require('../../res/platform');

test('Settings UI exposes active plugin selector and restart copy', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../../res/features/settings/settings.html'),
    'utf8'
  );
  const preload = fs.readFileSync(
    path.join(__dirname, '../../res/features/settings/preload_settings.js'),
    'utf8'
  );
  assert.ok(html.indexOf('buildPluginsSection') !== -1);
  assert.ok(html.indexOf('activePluginId') !== -1);
  assert.ok(html.indexOf('pluginsRestartPrompt') !== -1);
  assert.ok(html.indexOf('visibleKeybindIds') !== -1);
  assert.ok(html.indexOf('enableLocalPlugins') !== -1);
  assert.ok(html.indexOf('allowLocalPluginOverride') !== -1);
  assert.ok(html.indexOf('trustedLocalPlugins') !== -1);
  assert.ok(html.indexOf('renderTrustRows') !== -1);
  assert.ok(preload.indexOf('getPluginList') !== -1);
  assert.ok(preload.indexOf('getPluginSettings') !== -1);
});

test('platform locales include plugin selector strings', () => {
  ['en-US', 'pt-BR'].forEach((code) => {
    const messages = require(path.join(__dirname, '../../res/po', code + '.js')).settingsMessages;
    assert.ok(messages.pluginsHeading);
    assert.ok(messages.pluginsActiveLabel);
    assert.ok(messages.pluginsActiveHint);
    assert.ok(messages.pluginsRestartPrompt);
    assert.ok(messages.pluginsEnableLocalLabel);
    assert.ok(messages.pluginsAllowOverrideLabel);
    assert.ok(messages.pluginsTrustHeading);
  });
});

test('isLocalTrusted requires explicit trust for local plugins', () => {
  const localPlugin = {
    source: 'local',
    manifest: { id: 'sample', permissions: ['net-fetch'] }
  };
  assert.strictEqual(platform.isLocalTrusted(localPlugin, {}), false);
  assert.strictEqual(platform.isLocalTrusted(localPlugin, {
    trustedLocalPlugins: { sample: true }
  }), true);
  assert.strictEqual(platform.isLocalTrusted({
    source: 'bundled',
    manifest: { id: 'adventure-quest-worlds', permissions: ['net-fetch'] }
  }, {}), true);
});

test('discoverPlugins list shape matches Settings plugin picker needs', () => {
  const discovered = platform.discoverPlugins({
    bundledDir: path.join(__dirname, '../../plugins'),
    appVersion: '1.12.2',
    log: function () {}
  });
  assert.ok(discovered.plugins.length >= 1);
  const aqw = discovered.plugins.filter(function (p) {
    return p.manifest.id === 'adventure-quest-worlds';
  })[0];
  assert.ok(aqw);
  assert.strictEqual(aqw.source, 'bundled');
  assert.ok(aqw.manifest.name);
});

test('keybindings source registers getPluginList and getPluginSettings IPC', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../res/keybindings.js'), 'utf8');
  assert.ok(src.indexOf("ipcMain.handle('getPluginList'") !== -1);
  assert.ok(src.indexOf("ipcMain.handle('getPluginSettings'") !== -1);
  assert.ok(src.indexOf('setVisibleKeybindIds') !== -1);
  assert.ok(src.indexOf('visibleKeybindIds') !== -1);
});
