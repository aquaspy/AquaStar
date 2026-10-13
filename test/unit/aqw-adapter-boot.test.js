const assert = require('assert');
const fs = require('fs');
const path = require('path');

const platform = require('../../res/platform');
const aqwMainPath = path.join(__dirname, '../../plugins/adventure-quest-worlds/main.js');
const mainJsPath = path.join(__dirname, '../../main.js');

test('AQW plugin manifest validates against current app version', () => {
  const raw = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../../plugins/adventure-quest-worlds/plugin.json'),
    'utf8'
  ));
  const result = platform.manifestSchema.validateManifest(raw, { appVersion: '1.12.2' });
  assert.strictEqual(result.ok, true, (result.errors || []).join('; '));
});

test('AQW adapter lists the legacy feature modules once', () => {
  // Avoid requiring Electron-backed modules: read the source for the export list.
  const src = fs.readFileSync(aqwMainPath, 'utf8');
  assert.ok(src.indexOf('features') !== -1 && src.indexOf('reminders') !== -1);
  assert.ok(src.indexOf('todo') !== -1);
  assert.ok(src.indexOf('inventory') !== -1);
  assert.ok(src.indexOf('strategy') !== -1);
  assert.ok(src.indexOf('charpage') !== -1 && src.indexOf('studio.js') !== -1);
  assert.ok(src.indexOf('wikiFetch.js') !== -1);
  assert.ok(src.indexOf('LEGACY_FEATURE_MODULES') !== -1);
});

test('main.js has no AQW feature code: the plugin adapter owns it', () => {
  const src = fs.readFileSync(mainJsPath, 'utf8');
  const beforeReady = src.split("app.on('ready'")[0];
  assert.ok(beforeReady.indexOf("require('./res/platform')") !== -1);
  assert.ok(beforeReady.indexOf("require('./res/ipc/recording.js')") !== -1);
  // Feature modules, locales and wikiFetch are required by the plugin's activate(), never here.
  assert.strictEqual(src.indexOf('features/reminders'), -1);
  assert.strictEqual(src.indexOf('wikiFetch'), -1);
  assert.strictEqual(src.indexOf('loadLegacyFeatureModules'), -1);
  assert.strictEqual(src.indexOf('mergeAqwLocalesFromDisk'), -1);
  assert.ok(src.indexOf('activatePlugins') !== -1);
  assert.ok(src.indexOf('activateSelected') !== -1);
});

test('main.js carries no AQW/Artix URLs or User-Agent policy', () => {
  const src = fs.readFileSync(mainJsPath, 'utf8');
  assert.strictEqual(src.indexOf('aq.com'), -1);
  assert.strictEqual(src.indexOf('dragonfable'), -1);
  assert.strictEqual(src.indexOf('artixmode'), -1);
  assert.strictEqual(src.indexOf('spoofedUA'), -1);
  assert.strictEqual(src.indexOf('launcherUserAgent'), -1);
  assert.strictEqual(src.indexOf('constant.mainPath'), -1);
  // Only the platform's own UA is handed to session rules.
  assert.ok(src.indexOf('defaultUserAgent') !== -1);
});

test('legacy channel inventory covers expected AQW and platform channels', () => {
  // Each side lists only what it owns: the platform its channels, the plugin its own.
  const channels = platform.legacyChannels.ALL_MAIN_PROCESS_CHANNELS
    .concat(require('../../plugins/adventure-quest-worlds/channels.js').AQW_FEATURE_CHANNELS);
  assert.strictEqual(platform.legacyChannels.AQW_FEATURE_CHANNELS, undefined, 'platform must not list plugin channels');
  assert.ok(channels.indexOf('getReminders') !== -1);
  assert.ok(channels.indexOf('fetchWikiPage') !== -1);
  assert.ok(channels.indexOf('getKeybindings') !== -1);
  assert.ok(channels.indexOf('charpage-studio-load-character') !== -1);
  // Helper-process-only channels must stay out of the main inventory.
  assert.ok(channels.indexOf('charpage-studio-messages') === -1);
  assert.ok(channels.indexOf('charpage-studio-capture-gif') === -1);

  const unique = {};
  channels.forEach(function (ch) {
    assert.strictEqual(unique[ch], undefined, 'duplicate channel in inventory: ' + ch);
    unique[ch] = true;
  });
});

test('discoverPlugins finds bundled adventure-quest-worlds', () => {
  const discovered = platform.discoverPlugins({
    bundledDir: path.join(__dirname, '../../plugins'),
    appVersion: '1.12.2',
    log: function () {}
  });
  const aqw = discovered.plugins.filter(function (p) {
    return p.manifest.id === 'adventure-quest-worlds';
  })[0];
  assert.ok(aqw, 'bundled AQW plugin missing');
  assert.strictEqual(aqw.source, 'bundled');
});

test('AQW activate registers feature windows for reminders/todo/inventory/strategy', () => {
  const src = fs.readFileSync(aqwMainPath, 'utf8');
  const windowsSrc = fs.readFileSync(path.join(__dirname, '../../plugins/adventure-quest-worlds/windows.js'), 'utf8');
  assert.ok(src.indexOf('registerFeatureWindows') !== -1);
  assert.ok(windowsSrc.indexOf("id: 'reminders'") !== -1);
  assert.ok(windowsSrc.indexOf("id: 'todo'") !== -1);
  assert.ok(windowsSrc.indexOf("id: 'inventory'") !== -1);
  assert.ok(windowsSrc.indexOf("id: 'strategy'") !== -1);
  // Settings remains platform-owned; studio stays a helper process.
  assert.ok(windowsSrc.indexOf("id: 'settings'") === -1);
  assert.ok(windowsSrc.indexOf("id: 'charPageStudio'") === -1);
  // And none of these windows are defined in the platform any more.
  const platformConfig = fs.readFileSync(path.join(__dirname, '../../res/windows/config.js'), 'utf8');
  ['reminders', 'todo', 'inventory', 'strategy'].forEach(function (id) {
    assert.strictEqual(platformConfig.indexOf("'" + id + "'"), -1, id + ' must not be in platform config');
  });
});
