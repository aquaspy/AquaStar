const assert = require('assert');
const fs = require('fs');
const path = require('path');
const flash = require('../../res/flash.js');

test('PPAPI Flash is not offered on any platform', () => {
  assert.strictEqual(flash.ppapiFlashSupported('darwin', 'arm64'), false);
  assert.strictEqual(flash.ppapiFlashSupported('darwin', 'x64'), false);
  assert.strictEqual(flash.ppapiFlashSupported('linux', 'x64'), false);
  assert.strictEqual(flash.ppapiFlashSupported('win32', 'x64'), false);
});

test('the platform does not register a PPAPI plugin or the Flash trust package', () => {
  const root = path.join(__dirname, '../..');
  const files = ['main.js', 'res/flash.js', 'package.json'];
  files.forEach(function (rel) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.strictEqual(text.indexOf('ppapi-flash-path'), -1, rel);
    assert.strictEqual(text.indexOf('nw-flash-trust'), -1, rel);
  });
  assert.strictEqual(fs.existsSync(path.join(root, 'FlashPlayer')), false);
});
