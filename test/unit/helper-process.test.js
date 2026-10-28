const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const helper = require('../../res/platform/helper-process.js');

test('helper scripts inside the bundled plugins tree are accepted', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aquastar-helper-'));
  const script = path.join(root, 'plugins', 'demo', 'helper.js');
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(script, 'module.exports = {};\n');
  const resolved = helper.resolveHelperScript(['--aquastar-helper=' + script], root);
  assert.strictEqual(resolved.error, null);
  assert.strictEqual(resolved.script, fs.realpathSync(script));
  fs.rmSync(root, { recursive: true, force: true });
});

test('helper scripts outside the bundled plugins tree are refused', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aquastar-helper-'));
  fs.mkdirSync(path.join(root, 'plugins'));
  const outside = path.join(root, 'not-a-plugin.js');
  fs.writeFileSync(outside, 'module.exports = {};\n');
  const resolved = helper.resolveHelperScript(['--aquastar-helper=' + outside], root);
  assert.strictEqual(resolved.script, null);
  assert.ok(resolved.error.indexOf('outside bundled plugins') !== -1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('an asar member is accepted when realpath cannot see the archive', () => {
  const script = path.resolve('/app/resources/app.asar/plugins/demo/helper.js');
  const plugins = path.resolve('/app/resources/app.asar/plugins');
  const io = {
    realpathSync: function () {
      const error = new Error('EINVAL, realpath');
      error.code = 'EINVAL';
      throw error;
    },
    existsSync: function (file) {
      return file === script || file === plugins;
    }
  };
  assert.strictEqual(helper.resolveExisting(script, io), script);
  assert.throws(function () {
    helper.resolveExisting(path.resolve('/app/resources/app.asar/missing.js'), io);
  });
});
