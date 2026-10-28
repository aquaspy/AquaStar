const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const EventEmitter = require('events');

function boot(platformName) {
  const app = new EventEmitter();
  let ready = false,
    finishActivation,
    windows = [],
    creates = 0,
    activations = 0,
    sessionReads = 0;
  Object.assign(app, {
    requestSingleInstanceLock: () => true,
    quit() {},
    getLocale: () => 'en',
    whenReady: () =>
      new Promise((resolve) => {
        if (ready) resolve();
        else app.once('ready', resolve);
      })
  });
  const session = {};
  Object.defineProperty(session, 'defaultSession', {
    get() {
      sessionReads++;
      if (!ready) throw new Error('Session can only be received when app is ready');
      return { setPermissionRequestHandler() {}, setSpellCheckerLanguages() {}, getUserAgent: () => 'test' };
    }
  });
  const platform = {
    readPluginFlagsFromDisk: () => ({ flags: { pluginSystem: true }, settings: {} }),
    pluginRuntime: {
      setDependencies() {},
      createHostWindowDeps() {},
      getPrimaryUrl: () => 'https://example.test/game.swf'
    },
    activateSelected: () => {
      activations++;
      return new Promise((resolve) => {
        finishActivation = () => resolve(null);
      });
    },
    applySessionRules() {},
    createPlatformSessionRules: () => []
  };
  const deps = {
    electron: {
      app,
      session,
      BrowserWindow: { getAllWindows: () => windows },
      Menu: { setApplicationMenu() {}, buildFromTemplate: () => [] },
      dialog: {}
    },
    './res/platform/helper-process.js': { resolveHelperScript: () => ({ requested: false }) },
    './res/platform/sandbox-fallback.js': { applyFallback() {} },
    './res/platform/ruffle-origin.js': { registerScheme() {}, install() {} },
    './res/flash.js': { flashManager() {} },
    './res/keybindings.js': { addKeybinding: () => ({}) },
    './res/ipc/recording.js': {},
    './res/instances.js': {
      newBrowserWindow() {
        creates++;
        const win = new EventEmitter();
        windows.push(win);
        return win;
      },
      applyWindowMenu() {}
    },
    './res/windows/menu.js': { darwinApplicationMenu: () => [] },
    './res/socketProxy.js': {},
    './res/ruffleUpdate.js': {},
    './res/const.js': { appDataDirectory: '/tmp', appVersion: 'test', setLocale() {} },
    './res/locale.js': {},
    './res/platform': platform
  };
  vm.runInNewContext('(function () {\n' + fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8') + '\n})()', {
    require: (id) => (Object.prototype.hasOwnProperty.call(deps, id) ? deps[id] : require(id)),
    process: { argv: [], env: {}, platform: platformName },
    __dirname: '/app',
    console
  });
  return {
    app,
    get creates() {
      return creates;
    },
    get activations() {
      return activations;
    },
    get sessionReads() {
      return sessionReads;
    },
    ready() {
      ready = true;
      app.emit('ready');
    },
    finishActivation() {
      finishActivation();
    },
    closeAll() {
      windows = [];
    }
  };
}
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

test('macOS early activation waits for readiness and shared plugin initialization', async () => {
  const h = boot('darwin');
  h.app.emit('activate');
  h.app.emit('activate');
  assert.strictEqual(h.sessionReads, 0);
  h.ready();
  await settle();
  h.app.emit('activate');
  h.app.emit('activate');
  assert.strictEqual(h.activations, 1);
  assert.strictEqual(h.creates, 0);
  h.finishActivation();
  await settle();
  assert.strictEqual(h.creates, 1);
  h.app.emit('activate');
  await settle();
  assert.strictEqual(h.creates, 1);
  h.closeAll();
  h.app.emit('activate');
  h.app.emit('activate');
  await settle();
  assert.strictEqual(h.creates, 2);
  assert.strictEqual(h.activations, 1);
});
for (const platform of ['win32', 'linux']) {
  test(platform + ' normal startup creates one window after plugin initialization', async () => {
    const h = boot(platform);
    h.ready();
    await settle();
    assert.strictEqual(h.creates, 0);
    assert.strictEqual(h.activations, 1);
    h.finishActivation();
    await settle();
    assert.strictEqual(h.creates, 1);
  });
}
