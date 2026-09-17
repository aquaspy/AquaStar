const assert = require('assert');
const fs = require('fs');
const path = require('path');

const platform = require('../../res/platform');

test('settings registry exposes AQW account section fields', () => {
  platform.settingsRegistry.clear();
  platform.settingsRegistry.adoptHostState({
    settingsSections: [{
      id: 'aqw-account',
      title: 'Account & Inventory',
      titleKey: 'account',
      order: 10,
      fields: [
        { key: 'playerCharacter', type: 'text' },
        { key: 'autoSync', type: 'boolean' }
      ]
    }]
  }, { id: 'adventure-quest-worlds', name: 'Adventure Quest Worlds' });

  const layout = platform.settingsRegistry.buildSettingsLayout({
    includeLegacyAqwFallback: false
  });
  assert.strictEqual(layout.plugin.id, 'adventure-quest-worlds');
  assert.strictEqual(layout.pluginSections.length, 1);
  assert.strictEqual(layout.pluginSections[0].id, 'aqw-account');
  const keys = layout.pluginSections[0].fields.map((f) => f.key);
  assert.deepStrictEqual(keys, ['playerCharacter', 'autoSync']);
});

test('settings registry falls back to legacy AQW sections when empty', () => {
  platform.settingsRegistry.clear();
  const layout = platform.settingsRegistry.buildSettingsLayout();
  assert.ok(layout.pluginSections.some((s) => s.id === 'aqw-account'));
  const keys = layout.pluginSections[0].fields.map((f) => f.key);
  assert.ok(keys.indexOf('playerCharacter') !== -1);
  assert.ok(keys.indexOf('autoSync') !== -1);
});

test('Settings UI uses tabs and plugin section rendering', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../../res/features/settings/settings.html'),
    'utf8'
  );
  const preload = fs.readFileSync(
    path.join(__dirname, '../../res/features/settings/preload_settings.js'),
    'utf8'
  );
  assert.ok(html.indexOf('data-tab="general"') !== -1);
  assert.ok(html.indexOf('data-tab="plugin"') !== -1);
  assert.ok(html.indexOf('data-tab="keybinds"') !== -1);
  assert.ok(html.indexOf('panel-general') !== -1);
  assert.ok(html.indexOf('buildPluginSectionsPanel') !== -1);
  assert.ok(html.indexOf('PLATFORM_OPTION_TYPES') !== -1);
  assert.ok(html.indexOf('playerCharacter') === -1 ||
    html.indexOf("PLATFORM_OPTION_TYPES") !== -1);
  // playerCharacter must not be a platform option key
  assert.ok(!/PLATFORM_OPTION_TYPES\s*=\s*\{[^}]*playerCharacter/.test(html));
  assert.ok(preload.indexOf('getSettingsLayout') !== -1);
});

test('AQW activate registers settings section', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../plugins/adventure-quest-worlds/main.js'),
    'utf8'
  );
  assert.ok(src.indexOf('registerSettingsSection') !== -1);
  assert.ok(src.indexOf('aqw-account') !== -1);
  assert.ok(src.indexOf('playerCharacter') !== -1);
});

test('platform locales include settings tab strings and generic SWF copy', () => {
  ['en-US', 'pt-BR'].forEach((code) => {
    const messages = require('../../res/po/' + code + '.js').settingsMessages;
    assert.ok(messages.tabGeneral);
    assert.ok(messages.tabKeybinds);
    assert.ok(messages.pluginSettingsEmpty);
    assert.ok(messages.customSwfHeading);
    assert.ok(messages.customSwfHint.indexOf('AQW') === -1);
    assert.ok(messages.customSwfInactiveLabel.indexOf('AQW') === -1);
  });
});
