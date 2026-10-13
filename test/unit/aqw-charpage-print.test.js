const assert = require('assert');

const print = require('../../plugins/adventure-quest-worlds/features/charpage/print.js');
const navigation = require('../../plugins/adventure-quest-worlds/injections/navigation.js');

test('movieRect keeps the original 715x455 proportion, centered when the window is wider', () => {
  // Same ratio: the movie fills the window.
  assert.deepStrictEqual(print.movieRect([715, 455]), { x: 0, y: 0, width: 715, height: 455 });
  // Wider window: scale by height, center horizontally.
  assert.deepStrictEqual(print.movieRect([1430, 455]), { x: 358, y: 0, width: 715, height: 455 });
  assert.deepStrictEqual(print.movieRect([3840, 2160]), {
    x: Math.round((3840 - 715 * (2160 / 455)) / 2), y: 0,
    width: Math.round(715 * (2160 / 455)), height: 2160
  });
  // Taller window: scale by width, anchored at the top.
  assert.deepStrictEqual(print.movieRect([715, 900]), { x: 0, y: 0, width: 715, height: 455 });
  assert.deepStrictEqual(print.movieRect([1000, 1000]), { x: 0, y: 0, width: 1000, height: Math.round(455 * (1000 / 715)) });
});

function harness(url, flashExists) {
  const events = [];
  const focused = {
    webContents: { getURL: function () { return url; } },
    on: function (name, fn) { focused['_' + name] = fn; }
  };
  const printWindows = [];
  function FakeBrowserWindow(config) {
    const w = this;
    printWindows.push(w);
    w.config = config;
    w.handlers = {};
    w.setMenuBarVisibility = function (v) { events.push('menubar:' + v); };
    w.loadURL = function (u) { events.push('load:' + u); };
    w.getSize = function () { return [3840, 2160]; };
    w.webContents = { on: function (name, fn) { w.handlers[name] = fn; } };
  }
  FakeBrowserWindow.getFocusedWindow = function () { return focused; };

  const timers = [];
  const realSetTimeout = global.setTimeout;
  global.setTimeout = function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; };

  const charPagePrint = print.createCharPagePrint({
    BrowserWindow: FakeBrowserWindow,
    windowConfig: { marker: 'print-config' },
    classify: navigation.createNavigationHooks().classify,
    executeJavaScript: function () { return Promise.resolve(flashExists); },
    notify: function (win, text, resetAfter) { events.push('notify:' + text + (resetAfter === false ? ':sticky' : '')); },
    takeScreenshot: function (win, rect, destroy) { events.push('shot:' + JSON.stringify(rect) + ':' + destroy); },
    getMessages: function () { return { invalid: 'INVALID', loading: 'LOADING', building: 'BUILDING', done: 'DONE' }; }
  });
  return {
    run: charPagePrint, events: events, focused: focused, printWindows: printWindows, timers: timers,
    restore: function () { global.setTimeout = realSetTimeout; }
  };
}

test('char page print: ignores windows that are not a Char Page', async () => {
  const h = harness('https://www.aq.com/', true);
  try {
    h.run();
    await Promise.resolve();
    assert.deepStrictEqual(h.events, []);
    assert.strictEqual(h.printWindows.length, 0);
  } finally { h.restore(); }
});

test('char page print: tells the user when the page has no Flash', async () => {
  const h = harness('https://account.aq.com/CharPage?id=Hero', false);
  try {
    h.run();
    await new Promise(function (r) { setImmediate(r); });
    assert.deepStrictEqual(h.events, ['notify:INVALID']);
    assert.strictEqual(h.printWindows.length, 0);
  } finally { h.restore(); }
});

test('char page print: loads the page hidden, waits, crops to the movie, saves, then reports done', async () => {
  const url = 'https://account.aq.com/CharPage?id=Hero';
  const h = harness(url, true);
  try {
    h.run();
    await new Promise(function (r) { setImmediate(r); });
    assert.strictEqual(h.printWindows.length, 1);
    assert.deepStrictEqual(h.printWindows[0].config, { marker: 'print-config' });
    assert.deepStrictEqual(h.events.slice(0, 3), ['menubar:false', 'notify:LOADING:sticky', 'load:' + url]);

    // Once the page loaded: "building" is shown and the capture is scheduled after the delay.
    h.printWindows[0].handlers['did-finish-load']();
    assert.ok(h.events.indexOf('notify:BUILDING:sticky') !== -1);
    assert.strictEqual(h.timers.length, 1);
    assert.strictEqual(h.timers[0].ms, 5000);
    h.timers[0].fn();
    const rect = print.movieRect([3840, 2160]);
    assert.ok(h.events.indexOf('shot:' + JSON.stringify(rect) + ':true') !== -1, 'screenshot is cropped and destroys the window');
    assert.strictEqual(h.events[h.events.length - 1], 'notify:DONE');
  } finally { h.restore(); }
});

test('char page print: closing the focused window stops further progress messages', async () => {
  const h = harness('https://account.aq.com/CharPage?id=Hero', true);
  try {
    h.run();
    await new Promise(function (r) { setImmediate(r); });
    h.focused._closed();
    const before = h.events.length;
    h.printWindows[0].handlers['did-finish-load']();
    h.timers[0].fn();
    const after = h.events.slice(before);
    assert.ok(after.every(function (e) { return e.indexOf('notify:') !== 0; }), 'no notify after close: ' + after.join(','));
  } finally { h.restore(); }
});
