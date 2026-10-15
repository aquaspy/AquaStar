const assert = require('assert');
const flash = require('../../res/flash.js');

test('PPAPI Flash is refused on Apple Silicon and offered on Intel Macs', () => {
  assert.strictEqual(flash.ppapiFlashSupported('darwin', 'arm64'), false);
  assert.strictEqual(flash.ppapiFlashSupported('darwin', 'x64'), true);
  assert.strictEqual(flash.ppapiFlashSupported('linux', 'x64'), true);
  assert.strictEqual(flash.ppapiFlashSupported('win32', 'x64'), true);
});
