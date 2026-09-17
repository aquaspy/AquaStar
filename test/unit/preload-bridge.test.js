const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('preload-bridge module documents plugin channel helper', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../res/platform/preload-bridge.js'),
    'utf8'
  );
  assert.ok(src.indexOf('pluginChannel') !== -1);
  assert.ok(src.indexOf('exposePluginApi') !== -1);
  assert.ok(src.indexOf('plugin:') !== -1);
  assert.ok(src.indexOf('contextBridge.exposeInMainWorld') !== -1);
});
