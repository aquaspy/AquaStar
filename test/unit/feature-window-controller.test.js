const assert = require('assert');
const createController = require('../../res/windows/feature-window-controller.js');

test('feature window controller creates, focuses and releases singleton windows', () => {
  class FakeWindow {
    constructor(config) {
      this.config = config;
      this.destroyed = false;
      this.handlers = {};
      this.focused = 0;
    }
    isDestroyed() {
      return this.destroyed;
    }
    focus() {
      this.focused++;
    }
    setMenuBarVisibility(value) {
      this.menuVisible = value;
    }
    setTitle(value) {
      this.title = value;
    }
    loadURL(value) {
      this.url = value;
    }
    on(name, handler) {
      this.handlers[name] = handler;
    }
    close() {
      this.destroyed = true;
      this.handlers.closed();
    }
  }
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
