const assert = require('assert');
const path = require('path');

const platform = require('../../res/platform');
const runtime = platform.pluginRuntime;

function fakeHost(state, pluginRoot) {
  return {
    pluginRoot: pluginRoot || path.join(__dirname, '../fixtures/sample-plugin'),
    _getState: function () { return state; }
  };
}

test('plugin-runtime getPrimaryUrl prefers customUrl then primary getUrl', () => {
  runtime.clear();
  const opened = [];
  runtime.setDependencies({
    instances: {
      newBrowserWindow: function (url, isMain) {
        opened.push({ url: url, isMain: !!isMain });
        return { id: opened.length };
      }
    },
    constant: {
      mainPath: 'https://fallback.example/game.swf',
      isOldAqlite: false
    },
    BrowserWindow: { getFocusedWindow: function () { return null; } }
  });

  runtime.adopt(fakeHost({
    primaryGame: {
      id: 'p1',
      getUrl: function () { return 'https://plugin.example/game.swf'; },
      isGameUrl: function (url) { return url.indexOf('https://plugin.example/game.swf') === 0; }
    },
    launches: [{
      id: 'alt',
      getUrl: function () { return 'https://plugin.example/alt.swf'; },
      flashTrust: true
    }],
    trustedFlashUrls: ['https://plugin.example/game.swf'],
    keybinds: [],
    keybindDefaults: { newGame: 'Alt+N' },
    featureWindows: []
  }), { id: 'sample', name: 'Sample' });

  assert.strictEqual(runtime.getPrimaryUrl(), 'https://plugin.example/game.swf');
  assert.strictEqual(runtime.isGameUrl('https://plugin.example/game.swf'), true);
  assert.strictEqual(runtime.isGameUrl('https://plugin.example/alt.swf'), true);
  assert.strictEqual(runtime.isGameUrl('https://evil.example/x.swf'), false);

  runtime.openPrimaryGame({ isMainWin: true });
  runtime.openLaunch('alt');
  runtime.openUrl('https://plugin.example/page', 'new-window');
  assert.strictEqual(opened.length, 3);
  assert.strictEqual(opened[0].url, 'https://plugin.example/game.swf');
  assert.strictEqual(opened[0].isMain, true);
  assert.strictEqual(opened[1].url, 'https://plugin.example/alt.swf');
  assert.strictEqual(opened[2].url, 'https://plugin.example/page');

  const trusted = runtime.getTrustedFlashUrls();
  assert.ok(trusted.indexOf('https://plugin.example/game.swf') !== -1);
  assert.ok(trusted.indexOf('https://plugin.example/alt.swf') !== -1);
});

test('plugin-runtime openUrl in-place uses focused window loadURL', () => {
  runtime.clear();
  let loaded = null;
  runtime.setDependencies({
    instances: {
      newBrowserWindow: function () { throw new Error('should not open new window'); }
    },
    constant: { mainPath: 'https://x', isOldAqlite: false },
    BrowserWindow: {
      getFocusedWindow: function () {
        return {
          isDestroyed: function () { return false; },
          loadURL: function (url) { loaded = url; }
        };
      }
    }
  });
  runtime.adopt(fakeHost({
    primaryGame: { getUrl: function () { return 'https://x'; }, isGameUrl: function () { return false; } },
    launches: [],
    trustedFlashUrls: [],
    keybinds: [],
    keybindDefaults: {},
    featureWindows: []
  }), { id: 'x' });

  runtime.openUrl('https://in-place.example/', 'in-place');
  assert.strictEqual(loaded, 'https://in-place.example/');
});

test('createHostWindowDeps exposes wired window helpers', () => {
  runtime.clear();
  const deps = runtime.createHostWindowDeps();
  assert.strictEqual(typeof deps.openPrimaryGame, 'function');
  assert.strictEqual(typeof deps.openLaunch, 'function');
  assert.strictEqual(typeof deps.openUrl, 'function');
  assert.strictEqual(typeof deps.openFeatureWindow, 'function');
});

test('main.js boots primary URL from pluginRuntime', () => {
  const fs = require('fs');
  const mainSrc = fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8');
  assert.ok(mainSrc.indexOf('pluginRuntime.getPrimaryUrl') !== -1);
  assert.ok(mainSrc.indexOf('createHostWindowDeps') !== -1);
  assert.ok(mainSrc.indexOf('pluginRuntime.adopt') !== -1);
});
