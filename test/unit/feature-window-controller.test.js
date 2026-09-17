const assert = require('assert');
const path = require('path');
const createController = require('../../res/windows/feature-window-controller.js');

function FakeWindow(config) {
  this.config = config;
  this.destroyed = false;
  this.handlers = {};
  this.focused = 0;
}
FakeWindow.prototype.isDestroyed = function () { return this.destroyed; };
FakeWindow.prototype.focus = function () { this.focused++; };
FakeWindow.prototype.setMenuBarVisibility = function (value) { this.menuVisible = value; };
FakeWindow.prototype.setTitle = function (value) { this.title = value; };
FakeWindow.prototype.loadURL = function (value) { this.url = value; };
FakeWindow.prototype.on = function (name, handler) { this.handlers[name] = handler; };
FakeWindow.prototype.close = function () {
  this.destroyed = true;
  this.handlers.closed();
};

test('feature window controller creates, focuses and releases singleton windows', () => {
  const controller = createController(
    { settings: { config: { width: 1 }, title: 'Settings', url: 'file:///settings.html' } },
    FakeWindow
  );
  const first = controller.open('settings');
  assert.strictEqual(first.title, 'Settings');
  assert.strictEqual(first.menuVisible, false);
  assert.strictEqual(controller.open('settings'), first);
  assert.strictEqual(first.focused, 1);
  first.close();
  assert.strictEqual(controller.get('settings'), null);
  assert.notStrictEqual(controller.open('settings'), first);
});

test('feature window controller opens ad-hoc defs and resolves relative preload', () => {
  const pluginRoot = path.join(__dirname, '../fixtures/sample-plugin');
  const controller = createController({}, FakeWindow);
  const win = controller.open('tracker', {
    title: 'Tracker',
    url: 'file:///tracker.html',
    config: {
      width: 800,
      webPreferences: { preload: 'preload.js', contextIsolation: true }
    }
  }, pluginRoot);

  assert.strictEqual(win.title, 'Tracker');
  assert.strictEqual(win.url, 'file:///tracker.html');
  assert.strictEqual(
    win.config.webPreferences.preload,
    path.join(pluginRoot, 'preload.js')
  );

  // Absolute preload paths are left alone.
  const abs = path.join(pluginRoot, 'abs-preload.js');
  const resolved = createController.resolveFeatureDefinition({
    config: { webPreferences: { preload: abs } }
  }, pluginRoot);
  assert.strictEqual(resolved.config.webPreferences.preload, abs);
});
