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

test('main.js does not eagerly require AQW feature modules alongside plugin activate', () => {
  const src = fs.readFileSync(mainJsPath, 'utf8');
  // Top-level requires must not include feature modules (only via loadLegacyFeatureModules
  // or the plugin activate path).
  const beforeReady = src.split("app.on('ready'")[0];
  assert.ok(beforeReady.indexOf("require('./res/platform')") !== -1);
  assert.ok(beforeReady.indexOf("require('./res/ipc/recording.js')") !== -1);
  assert.strictEqual(
    /require\('\.\/plugins\/adventure-quest-worlds\/features\/reminders\/reminders\.js'\)/.test(beforeReady) &&
      beforeReady.indexOf('function loadLegacyFeatureModules') === -1,
    false
  );
  // Feature requires live only inside the legacy fallback helper.
  const legacyFn = src.match(/function loadLegacyFeatureModules\([\s\S]*?\n\}/);
  assert.ok(legacyFn, 'loadLegacyFeatureModules helper missing');
  assert.ok(legacyFn[0].indexOf('plugins/adventure-quest-worlds/features/reminders/reminders.js') !== -1);
  assert.ok(legacyFn[0].indexOf('wikiFetch.js') !== -1);
  assert.ok(src.indexOf('activateBundledPluginsOrLegacy') !== -1);
  assert.ok(src.indexOf('activateSelected') !== -1);
});

test('legacy channel inventory covers expected AQW and platform channels', () => {
  const channels = platform.legacyChannels.ALL_MAIN_PROCESS_CHANNELS;
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
