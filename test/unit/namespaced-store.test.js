const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createNamespacedStore,
  resolveStoreFileName,
  AQW_ALIASES
} = require('../../res/platform/storage/namespaced-store.js');

test('AQW aliases map to permanent aquastar_*.json filenames', () => {
  assert.strictEqual(
    resolveStoreFileName('adventure-quest-worlds', 'reminders'),
    'aquastar_reminders.json'
  );
  assert.strictEqual(
    resolveStoreFileName('adventure-quest-worlds', 'todo'),
    AQW_ALIASES.todo
  );
  assert.strictEqual(
    resolveStoreFileName('adventure-quest-worlds', 'strategy'),
    'aquastar_strategy.json'
  );
  assert.strictEqual(
    resolveStoreFileName('adventure-quest-worlds', 'inventory'),
    'aquastar_inventory.json'
  );
});

test('non-AQW plugins use aquastar.<pluginId>.<ns>.json', () => {
  assert.strictEqual(
    resolveStoreFileName('dragon-fable-lite', 'reminders'),
    'aquastar.dragon-fable-lite.reminders.json'
  );
  assert.strictEqual(
    resolveStoreFileName('adventure-quest-worlds', 'custom-meta'),
    'aquastar.adventure-quest-worlds.custom-meta.json'
  );
});

test('explicit aliases override permanent and default filenames', () => {
  assert.strictEqual(
    resolveStoreFileName('adventure-quest-worlds', 'reminders', {
      reminders: 'custom_reminders.json'
    }),
    'custom_reminders.json'
  );
  assert.strictEqual(
    resolveStoreFileName('other-plugin', 'prefs', { prefs: 'prefs.json' }),
    'prefs.json'
  );
});

test('namespaced store read/write/readOrCreate bind to resolved path', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aquastar-ns-store-'));
  try {
    const aqw = createNamespacedStore({
      appDataDirectory: directory,
      pluginId: 'adventure-quest-worlds'
    });
    assert.strictEqual(
      aqw.resolveStorePath('reminders'),
      path.join(directory, 'aquastar_reminders.json')
    );

    const reminders = aqw.getStore('reminders');
    assert.deepStrictEqual(
      reminders.readOrCreate(() => ({ version: 1, quests: [] })),
      { version: 1, quests: [] }
    );
    assert.deepStrictEqual(reminders.read(), { version: 1, quests: [] });
    reminders.write({ version: 2, quests: ['daily'] });
    assert.deepStrictEqual(reminders.read(), { version: 2, quests: ['daily'] });
    assert.ok(fs.existsSync(path.join(directory, 'aquastar_reminders.json')));

    const other = createNamespacedStore({
      appDataDirectory: directory,
      pluginId: 'sample-plugin'
    });
    const meta = other.getStore('meta');
    meta.write({ ok: true });
    assert.ok(fs.existsSync(path.join(directory, 'aquastar.sample-plugin.meta.json')));
    assert.deepStrictEqual(meta.read(), { ok: true });
  } finally {
    fs.readdirSync(directory).forEach((name) => {
      fs.unlinkSync(path.join(directory, name));
    });
    fs.rmdirSync(directory);
  }
});

test('createNamespacedStore rejects missing appDataDirectory or pluginId', () => {
  assert.throws(function () {
    createNamespacedStore({ pluginId: 'x' });
  }, /appDataDirectory/);
  assert.throws(function () {
    createNamespacedStore({ appDataDirectory: os.tmpdir() });
  }, /pluginId/);
  assert.throws(function () {
    createNamespacedStore({
      appDataDirectory: os.tmpdir(),
      pluginId: 'x'
    }).getStore('');
  }, /namespace/);
});
