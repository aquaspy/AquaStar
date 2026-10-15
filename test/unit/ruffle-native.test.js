const assert = require('assert');
const native = require('../../res/ruffleNative.js');

test('Ruffle desktop gets sockets, saves and quality, and the SWF last', () => {
  const args = native.buildArgs('https://game.aq.com/game/gamefiles/Loader4.swf?ver=b', {
    width: 960,
    height: 550,
    quality: 'low',
    saveDirectory: '/tmp/saves'
  });
  assert.deepStrictEqual(args.slice(0, 2), ['--tcp-connections', 'allow']);
  assert.ok(args.join(' ').indexOf('--width 960 --height 550') !== -1);
  assert.ok(args.join(' ').indexOf('--quality low') !== -1);
  assert.ok(args.join(' ').indexOf('--save-directory /tmp/saves') !== -1);
  assert.ok(args.indexOf('--no-gui') !== -1);
  assert.strictEqual(args[args.length - 1], 'https://game.aq.com/game/gamefiles/Loader4.swf?ver=b');
});

test('Ruffle desktop ignores unknown quality values', () => {
  assert.ok(native.buildArgs('x.swf', { quality: 'best; rm -rf' }).indexOf('--quality') === -1);
});

test('Ruffle desktop maps each supported platform to its release asset', () => {
  assert.strictEqual(native.platformTarget('linux', 'x64').asset, '-linux-x86_64.tar.gz');
  assert.strictEqual(native.platformTarget('win32', 'x64').exe, 'ruffle.exe');
  assert.ok(/MacOS/.test(native.platformTarget('darwin', 'arm64').exe));
  assert.strictEqual(native.platformTarget('linux', 'arm'), null);
});

test('old Ruffle desktop versions are pruned, keeping the active and running ones', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'aq-native-'));
  const root = path.join(data, 'ruffle-native');
  ['v0.6.0', 'v0.7.0', 'v0.7.1'].forEach((tag) => {
    fs.mkdirSync(path.join(root, tag), { recursive: true });
    fs.writeFileSync(path.join(root, tag, 'ruffle'), 'bin');
  });
  fs.writeFileSync(path.join(root, 'current.json'), '{}');

  const removed = native.pruneOldVersions(data, 'v0.7.1', [path.join(root, 'v0.7.0', 'ruffle')]);
  assert.deepStrictEqual(removed, ['v0.6.0']);
  assert.deepStrictEqual(fs.readdirSync(root).sort(), ['current.json', 'v0.7.0', 'v0.7.1']);

  // Next launch: nothing running any more, so the previous version goes too.
  assert.deepStrictEqual(native.pruneOldVersions(data, 'v0.7.1', []), ['v0.7.0']);
  // Idempotent and harmless when the folder is already clean or missing.
  assert.deepStrictEqual(native.pruneOldVersions(data, 'v0.7.1', []), []);
  assert.deepStrictEqual(native.pruneOldVersions(path.join(data, 'nope'), 'v0.7.1', []), []);
  fs.rmSync(data, { recursive: true, force: true });
});

test('a locked old version is left for a later launch instead of failing', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const updater = require('../../res/ruffleUpdate.js');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'aq-native-'));
  fs.mkdirSync(path.join(data, 'ruffle-native', 'v0.7.0'), { recursive: true });
  const original = updater._removeIfPresent;
  updater._removeIfPresent = () => {
    throw new Error('EBUSY: resource busy or locked');
  };
  try {
    assert.deepStrictEqual(native.pruneOldVersions(data, 'v0.7.1', []), []);
  } finally {
    updater._removeIfPresent = original;
  }
  assert.ok(fs.existsSync(path.join(data, 'ruffle-native', 'v0.7.0')));
  fs.rmSync(data, { recursive: true, force: true });
});
