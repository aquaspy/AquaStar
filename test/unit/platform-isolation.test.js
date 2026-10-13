const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');

// Everything that is the platform's: the entry point, res/, and the build tooling that
// serves every plugin. Vendored code (the Ruffle player) is not ours to police.
function platformFiles() {
  const files = [
    path.join(root, 'main.js'),
    path.join(root, 'scripts', 'build-web.js'),
    path.join(root, 'scripts', 'make-locale-templates.js')
  ];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full === path.join(root, 'res', 'ruffle')) return;
        walk(full);
      } else if (/\.(js|html|css|json)$/.test(entry.name)) {
        files.push(full);
      }
    });
  })(path.join(root, 'res'));
  return files;
}

// Names of the bundled game and of what only it does. If one of these shows up in platform
// code, the platform has started to know a game again: it belongs in that game's plugin.
const GAME_SPECIFIC = new RegExp(
  [
    'aqw',
    'adventure[ -]?quest',
    'aq\\.com',
    'artix',
    'dragon ?fable',
    'aqlite',
    'charpage',
    'char page',
    'wikidot',
    'wikiview',
    'reminders?\\b',
    'to-?do\\b',
    'inventory',
    'strategy',
    'spider',
    'loader[0-9]'
  ].join('|'),
  'i'
);

test('the platform (main.js, res/, shared build tooling) names no game, host or feature of a plugin', () => {
  const offenders = [];
  platformFiles().forEach(function (file) {
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach(function (line, i) {
        if (GAME_SPECIFIC.test(line)) {
          offenders.push(path.relative(root, file) + ':' + (i + 1) + ': ' + line.trim().slice(0, 100));
        }
      });
  });
  assert.deepStrictEqual(offenders, [], 'game-specific code leaked into the platform:\n' + offenders.join('\n'));
});

test('the platform never requires a plugin by path or id', () => {
  const offenders = [];
  platformFiles()
    .filter(function (f) {
      return /\.js$/.test(f);
    })
    .forEach(function (file) {
      const src = fs.readFileSync(file, 'utf8');
      // Plugins are discovered from the plugins directory; nothing may require one directly.
      if (/require\([^)]*plugins\/[a-z-]+\//.test(src)) offenders.push(path.relative(root, file));
    });
  assert.deepStrictEqual(offenders, []);
});

test('the bundled game plugin is the default because its manifest says so, not by name', () => {
  const manifest = require('../../plugins/adventure-quest-worlds/plugin.json');
  assert.strictEqual(manifest.bundledDefault, true);
  const platform = require('../../res/platform');
  const discovered = platform.discoverPlugins({
    bundledDir: path.join(root, 'plugins'),
    enableLocalPlugins: false,
    appVersion: '1.12.2'
  });
  const chosen = platform.pickBundledDefault(discovered.plugins);
  assert.ok(chosen && chosen.manifest.id === manifest.id);
  // Exactly one bundled plugin may claim to be the default.
  const claimants = discovered.plugins.filter(function (p) {
    return p.source === 'bundled' && p.manifest.bundledDefault === true;
  });
  assert.strictEqual(claimants.length, 1);
});

function fakePlugin(id, source, extra) {
  return { source: source, root: '/x/' + id, manifest: Object.assign({ id: id }, extra || {}) };
}

test('plugin selection: the bundled default wins unless another plugin is requested', () => {
  const loader = require('../../res/platform/plugin-loader.js');
  const game = fakePlugin('some-game', 'bundled', { bundledDefault: true });
  const other = fakePlugin('other-game', 'bundled');
  const local = fakePlugin('my-local', 'local');
  const all = [other, local, game];

  assert.strictEqual(loader.selectPlugin(all, {}).selected, game, 'no request -> bundled default');
  assert.strictEqual(loader.selectPlugin(all, { activePluginId: 'other-game' }).selected, other);
  assert.strictEqual(loader.selectPlugin(all, { activePluginId: 'my-local' }).selected, local);
  const missing = loader.selectPlugin(all, { activePluginId: 'does-not-exist' });
  assert.strictEqual(missing.selected, game, 'unknown id -> bundled default');
  assert.ok(missing.notes[0].indexOf('does-not-exist') !== -1);
});

test('safe mode ignores the requested plugin and local plugins: only the bundled default runs', () => {
  const loader = require('../../res/platform/plugin-loader.js');
  const game = fakePlugin('some-game', 'bundled', { bundledDefault: true });
  const other = fakePlugin('other-game', 'bundled');
  const local = fakePlugin('my-local', 'local');
  const all = [other, local, game];

  ['other-game', 'my-local', 'does-not-exist'].forEach(function (requested) {
    const choice = loader.selectPlugin(all, { activePluginId: requested }, { safeMode: true });
    assert.strictEqual(choice.selected, game, 'safe mode must pick the default for ' + requested);
    assert.deepStrictEqual(choice.plugins, [game]);
  });
  // Without any declared default, safe mode still never reaches a local plugin.
  const noDefault = loader.selectPlugin([local, other], { activePluginId: 'my-local' }, { safeMode: true });
  assert.strictEqual(noDefault.selected, other);
  assert.strictEqual(loader.selectPlugin([local], {}, { safeMode: true }).selected, null);
});

test('a local plugin can never become the bundled default', () => {
  const loader = require('../../res/platform/plugin-loader.js');
  const imposter = fakePlugin('imposter', 'local', { bundledDefault: true });
  assert.strictEqual(loader.pickBundledDefault([imposter]), null);
});
