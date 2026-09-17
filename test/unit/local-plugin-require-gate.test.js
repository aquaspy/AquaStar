const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const pluginLoader = require('../../res/platform/plugin-loader.js');
const schema = require('../../res/platform/manifest-schema.js');

function silentLog() {}

function writeLocalPlugin(dir, mainSource) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    id: 'gate-probe',
    name: 'Gate Probe',
    version: '1.0.0',
    apiVersion: 1,
    main: 'main.js',
    minAppVersion: '1.12.2',
    permissions: []
  }));
  fs.writeFileSync(path.join(dir, 'main.js'), mainSource);
}

test('withLocalRequireGate blocks fs from inside the plugin root', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aquastar-gate-fs-'));
  const pluginFile = path.join(tmp, 'probe.js');
  fs.writeFileSync(pluginFile, 'module.exports = function () { return require("fs"); };');

  const probe = pluginLoader.withLocalRequireGate(tmp, function () {
    // Load via path so Module.parent/filename is under tmp.
    delete require.cache[pluginFile];
    return require(pluginFile);
  });

  assert.throws(function () {
    pluginLoader.withLocalRequireGate(tmp, function () {
      probe();
    });
  }, /Local plugin require blocked: "fs"/);

  // Outside the gate, fs still works.
  assert.strictEqual(typeof require('fs').readFileSync, 'function');
});

test('withLocalRequireGate allows path and blocks relative escapes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aquastar-gate-path-'));
  const pluginFile = path.join(tmp, 'probe.js');
  fs.writeFileSync(pluginFile, [
    'module.exports = {',
    '  loadPath: function () { return require("path"); },',
    '  escape: function () { return require("../../res/const.js"); }',
    '};'
  ].join('\n'));

  const probe = pluginLoader.withLocalRequireGate(tmp, function () {
    delete require.cache[pluginFile];
    return require(pluginFile);
  });

  const pathMod = pluginLoader.withLocalRequireGate(tmp, function () {
    return probe.loadPath();
  });
  assert.strictEqual(typeof pathMod.join, 'function');

  assert.throws(function () {
    pluginLoader.withLocalRequireGate(tmp, function () {
      probe.escape();
    });
  }, /path escapes plugin root/);
});

test('activatePlugin does not install the require gate for bundled plugins', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aquastar-gate-bundled-'));
  writeLocalPlugin(tmp, [
    'const Module = require("module");',
    'function activate(host) {',
    '  host._requireDuringActivate = Module.prototype.require;',
    '  require("fs");',
    '  require("path");',
    '}',
    'module.exports = { activate: activate };'
  ].join('\n'));

  const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'plugin.json'), 'utf8'));
  const validated = schema.validateManifest(manifest, { appVersion: '1.12.2' });
  assert.strictEqual(validated.ok, true);

  const originalRequire = Module.prototype.require;
  const activated = await pluginLoader.activatePlugin({
    root: tmp,
    manifest: validated.manifest,
    source: 'bundled'
  }, {
    appVersion: '1.12.2',
    appDataDirectory: path.join(tmp, 'data'),
    clearRequireCache: true,
    log: silentLog,
    platformSettings: {}
  });

  assert.strictEqual(
    activated.host._requireDuringActivate,
    originalRequire,
    'bundled activate must not wrap Module.prototype.require'
  );
  assert.strictEqual(Module.prototype.require, originalRequire);
});

test('activatePlugin installs the require gate for local plugins', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aquastar-gate-local-'));
  writeLocalPlugin(tmp, [
    'const Module = require("module");',
    'function activate(host) {',
    '  host._requireDuringActivate = Module.prototype.require;',
    '  require("path");',
    '  try {',
    '    require("fs");',
    '    host._fsBlocked = false;',
    '  } catch (e) {',
    '    host._fsBlocked = true;',
    '    host._fsError = e && e.message;',
    '  }',
    '}',
    'module.exports = { activate: activate };'
  ].join('\n'));

  const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'plugin.json'), 'utf8'));
  const validated = schema.validateManifest(manifest, { appVersion: '1.12.2' });
  assert.strictEqual(validated.ok, true);

  const originalRequire = Module.prototype.require;
  const activated = await pluginLoader.activatePlugin({
    root: tmp,
    manifest: validated.manifest,
    source: 'local'
  }, {
    appVersion: '1.12.2',
    appDataDirectory: path.join(tmp, 'data'),
    clearRequireCache: true,
    log: silentLog,
    platformSettings: {
      trustedLocalPlugins: { 'gate-probe': true }
    }
  });

  assert.notStrictEqual(
    activated.host._requireDuringActivate,
    originalRequire,
    'local activate must wrap Module.prototype.require'
  );
  assert.strictEqual(activated.host._fsBlocked, true);
  assert.ok(/Local plugin require blocked: "fs"/.test(activated.host._fsError));
  assert.strictEqual(
    Module.prototype.require,
    originalRequire,
    'require gate must be restored after activate'
  );
});
