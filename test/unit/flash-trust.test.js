const assert = require('assert');
const flash = require('../../res/flash.js');

test('flash trust is a no-op without PPAPI', () => {
  assert.doesNotThrow(function () {
    flash.flashManager();
    flash.refreshTrust(['https://example.test/game.swf']);
  });
});
