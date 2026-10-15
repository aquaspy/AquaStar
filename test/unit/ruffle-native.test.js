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
