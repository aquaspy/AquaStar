const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCustomSwf } = require('../../res/customSwf.js');

test('a SWF beside the .app is found when the working directory is not', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aq-swf-'));
  const appData = path.join(root, 'data');
  const cwd = path.join(root, 'cwd');
  const beside = path.join(root, 'beside');
  fs.mkdirSync(appData);
  fs.mkdirSync(cwd);
  fs.mkdirSync(beside);
  fs.writeFileSync(path.join(beside, 'custom-game.swf'), 'swf');
  const swf = createCustomSwf({
    appDataDirectory: appData,
    appCurrentDirectory: cwd,
    bundleDirectory: beside,
    toFileUrl: function (file) {
      return 'file://' + file;
    }
  });
  assert.strictEqual(swf.activePath(), path.join(beside, 'custom-game.swf'));
  fs.rmSync(root, { recursive: true, force: true });
});
