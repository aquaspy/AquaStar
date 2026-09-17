const assert = require('assert');
const { createDispatcher, PLATFORM_RESERVED } = require('../../res/platform/keybind-dispatcher.js');

test('keybind dispatcher runs platform reserved before plugin', () => {
  const calls = [];
  const d = createDispatcher({
    platformActions: {
      settings: function () { calls.push('platform-settings'); },
      sshot: function () { calls.push('platform-sshot'); }
    },
    pluginBindings: [
      {
        id: 'settings',
        action: function () { calls.push('plugin-settings'); }
      },
      {
        id: 'newAqw',
        action: function () { calls.push('plugin-newAqw'); }
      }
    ]
  });
  d.run('settings');
  d.run('newAqw');
  d.run('sshot');
  assert.deepStrictEqual(calls, [
    'platform-settings',
    'plugin-newAqw',
    'platform-sshot'
  ]);
  assert.ok(PLATFORM_RESERVED.settings);
  assert.ok(d.listPluginIds().indexOf('newAqw') !== -1);
  assert.ok(d.listPluginIds().indexOf('settings') === -1);
});

test('keybindings.js prefers pluginRuntime bindings when present', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../res/keybindings.js'), 'utf8');
  assert.ok(src.indexOf('listKeybindBindings') !== -1);
  assert.ok(src.indexOf('activeDispatcher') !== -1);
  assert.ok(src.indexOf('registerLegacyAqwKeybinds') !== -1);
});
