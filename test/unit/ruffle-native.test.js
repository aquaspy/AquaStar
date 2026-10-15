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

test('Ruffle desktop uses OpenGL by default and passes a chosen backend', () => {
  const args = native.buildArgs('x.swf', {});
  assert.strictEqual(args[args.indexOf('--graphics') + 1], 'gl');
  const vk = native.buildArgs('x.swf', { graphics: 'vulkan' });
  assert.strictEqual(vk[vk.indexOf('--graphics') + 1], 'vulkan');
  const bad = native.buildArgs('x.swf', { graphics: 'vulkan --evil' });
  assert.strictEqual(bad[bad.indexOf('--graphics') + 1], 'gl');
});

test('a crashing non-GL backend falls back to OpenGL, other exits do not', () => {
  const f = native.shouldFallbackToGl;
  assert.strictEqual(f({ graphics: 'vulkan', code: 101, elapsedMs: 2000 }), true);
  assert.strictEqual(f({ graphics: 'vulkan', code: null, signal: 'SIGABRT', elapsedMs: 3000 }), true);
  assert.strictEqual(f({ graphics: 'default', code: 101, elapsedMs: 600000, panicked: true }), true);
  assert.strictEqual(f({ graphics: 'vulkan', code: 1, elapsedMs: 600000 }), false);
  assert.strictEqual(f({ graphics: 'vulkan', code: 0, elapsedMs: 1000 }), false);
  assert.strictEqual(
    f({ graphics: 'vulkan', code: null, signal: 'SIGTERM', elapsedMs: 1000, killedByUs: true }),
    false
  );
  assert.strictEqual(f({ graphics: 'gl', code: 101, elapsedMs: 1000, panicked: true }), false);
  assert.ok(native.looksLikePanic("thread 'main' panicked at wgpu-core: Out of Memory"));
  assert.ok(!native.looksLikePanic('INFO loaded movie'));
});

test('graphics choices default to OpenGL and are filtered per platform', () => {
  const graphics = require('../../res/ruffleGraphics.js');
  const constSrc = require('fs').readFileSync(require('path').join(__dirname, '../../res/const.js'), 'utf8');
  assert.ok(/ruffleGraphics:\s*'gl'/.test(constSrc));
  assert.strictEqual(graphics.normalize('nope'), 'gl');
  const ids = (p) => graphics.choicesFor(p).map((c) => c.id);
  assert.deepStrictEqual(ids('linux'), ['gl', 'vulkan', 'default']);
  assert.deepStrictEqual(ids('darwin'), ['gl', 'metal', 'default']);
  assert.deepStrictEqual(ids('win32'), ['gl', 'vulkan', 'dx12', 'default']);
});

function makeBundle(appRoot, tag) {
  const fs = require('fs');
  const path = require('path');
  const exe = native.bundledExePath(appRoot);
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  fs.writeFileSync(exe, 'bin');
  fs.chmodSync(exe, 0o755);
  if (tag)
    fs.writeFileSync(path.join(appRoot, 'RuffleNative', 'ruffle-native-version.json'), JSON.stringify({ tag: tag }));
  return exe;
}

test('Ruffle desktop release tags compare by version', () => {
  assert.ok(native.compareTags('v0.7.2', 'v0.7.1') > 0);
  assert.ok(native.compareTags('v0.7.1', 'v0.10.0') < 0);
  assert.strictEqual(native.compareTags('v0.7.1', 'v0.7.1'), 0);
  assert.ok(native.compareTags('nightly-2026-10-20', 'v0.7.1') > 0);
});

test('every bundled Ruffle desktop pin matches its platform asset and has a SHA-256', () => {
  const manifest = require('../../res/ruffleNativeBundle.json');
  Object.keys(manifest.targets).forEach((key) => {
    const [platform, arch] = key.split('-');
    const target = manifest.targets[key];
    assert.ok(/^[0-9a-f]{64}$/.test(target.sha256), key);
    assert.ok(target.url.indexOf('/' + manifest.tag + '/') !== -1, key);
    assert.ok(target.url.endsWith(native.platformTarget(platform, arch).asset), key);
  });
  assert.ok(manifest.unsupported['linux-armv7l']);
});

test('the bundled Ruffle desktop is used offline and a newer download wins over it', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aq-app-'));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'aq-native-'));
  const exe = makeBundle(appRoot, 'v0.7.1');

  // Nothing downloaded and no auto-update: no network, the bundle is used.
  let used = await native.ensureInstalled(data, false, appRoot);
  assert.strictEqual(used.exe, exe);
  assert.strictEqual(used.bundled, true);

  // An older download (e.g. left over from before bundling) loses to the bundle and is pruned.
  const root = path.join(data, 'ruffle-native');
  const writeDownload = (tag) => {
    fs.mkdirSync(path.join(root, tag), { recursive: true });
    const bin = path.join(root, tag, path.basename(exe));
    fs.writeFileSync(bin, 'bin');
    fs.chmodSync(bin, 0o755);
    fs.writeFileSync(path.join(root, 'current.json'), JSON.stringify({ tag: tag, exe: bin }));
    return bin;
  };
  writeDownload('v0.7.0');
  used = await native.ensureInstalled(data, false, appRoot);
  assert.strictEqual(used.exe, exe);
  assert.ok(!fs.existsSync(path.join(root, 'v0.7.0')));

  // A newer auto-updated download is preferred; the bundle stays on disk untouched.
  const newer = writeDownload('v0.8.0');
  used = await native.ensureInstalled(data, false, appRoot);
  assert.strictEqual(used.exe, newer);
  native.pruneOldVersions(data, 'v0.8.0', []);
  assert.ok(fs.existsSync(exe));

  fs.rmSync(appRoot, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
});

test('a package without a bundle (dev checkout, armv7l) reports no bundled copy', () => {
  const os = require('os');
  assert.strictEqual(native.readBundled(os.tmpdir() + '/aq-no-such-app'), null);
});
