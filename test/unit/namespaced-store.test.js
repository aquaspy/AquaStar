const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createNamespacedStore, resolveStoreFileName } = require('../../res/platform/storage/namespaced-store.js');

test('a plugin keeps permanent legacy filenames by declaring storeAliases in its manifest', () => {
  // The platform no longer knows any plugin: aliases come from the manifest the loader reads.
  const manifest = require('../../plugins/adventure-quest-worlds/plugin.json');
  const aliases = manifest.storeAliases;
  assert.strictEqual(resolveStoreFileName(manifest.id, 'reminders', aliases), 'aquastar_reminders.json');
  assert.strictEqual(resolveStoreFileName(manifest.id, 'todo', aliases), 'aquastar_todo.json');
  assert.strictEqual(resolveStoreFileName(manifest.id, 'strategy', aliases), 'aquastar_strategy.json');
  assert.strictEqual(resolveStoreFileName(manifest.id, 'inventory', aliases), 'aquastar_inventory.json');
  // Names it did not alias still get the namespaced file.
  assert.strictEqual(
    resolveStoreFileName(manifest.id, 'launcher-config', aliases),
    'aquastar.' + manifest.id + '.launcher-config.json'
  );
});

test('without aliases every plugin uses aquastar.<pluginId>.<ns>.json (no plugin is special)', () => {
  assert.strictEqual(
    resolveStoreFileName('dragon-fable-lite', 'reminders'),
    'aquastar.dragon-fable-lite.reminders.json'
  );
  assert.strictEqual(
    resolveStoreFileName('adventure-quest-worlds', 'reminders'),
    'aquastar.adventure-quest-worlds.reminders.json'
  );
});

test('explicit aliases override permanent and default filenames', () => {
  assert.strictEqual(
    resolveStoreFileName('adventure-quest-worlds', 'reminders', {
      reminders: 'custom_reminders.json'
    }),
    'custom_reminders.json'
  );
  assert.strictEqual(resolveStoreFileName('other-plugin', 'prefs', { prefs: 'prefs.json' }), 'prefs.json');
});

test('namespaced store read/write/readOrCreate bind to resolved path', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aquastar-ns-store-'));
  try {
    const aqw = createNamespacedStore({
      appDataDirectory: directory,
      pluginId: 'adventure-quest-worlds',
      aliases: require('../../plugins/adventure-quest-worlds/plugin.json').storeAliases
    });
    assert.strictEqual(aqw.resolveStorePath('reminders'), path.join(directory, 'aquastar_reminders.json'));

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
