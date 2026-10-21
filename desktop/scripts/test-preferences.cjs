const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function extract(source, name, next) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = source.indexOf(`\n${next}(`, start);
  assert.notEqual(end, -1, `missing function after ${name}`);
  return source.slice(start, end);
}

const ui = path.join(__dirname, '../ui');
const main = fs.readFileSync(path.join(ui, 'main.js'), 'utf8');
const preferenceSource = fs.readFileSync(path.join(ui, 'preferences.js'), 'utf8');
const mainContext = { GLOBAL_PANELS: ['preferences', 'extensions'], view: 'preferences', savedView: () => 'adventure-quest-worlds' };
vm.createContext(mainContext);
vm.runInContext(extract(main, 'wantedView', 'async function loadModel'), mainContext);

assert.equal(mainContext.wantedView(true, true, 'adventure-quest-worlds'), 'preferences', 'a delayed initial model response must preserve a newer Preferences selection');
assert.equal(mainContext.wantedView(false, false, 'adventure-quest-worlds'), 'preferences', 'a plugins refresh must preserve the current view');
mainContext.view = null;
assert.equal(mainContext.wantedView(true, false, 'adventure-quest-worlds'), 'adventure-quest-worlds', 'initial startup intent must still be honored');

const prefContext = {};
vm.createContext(prefContext);
const keybindStart = preferenceSource.indexOf('function keybindFromEvent(');
const withDisabledStart = preferenceSource.indexOf('\n  async function withDisabledEvent(', keybindStart);
const saveFieldStart = preferenceSource.indexOf('\n  async function saveField(', withDisabledStart);
assert.ok(keybindStart >= 0 && withDisabledStart > keybindStart && saveFieldStart > withDisabledStart);
vm.runInContext(`${preferenceSource.slice(keybindStart, withDisabledStart)}\n${preferenceSource.slice(withDisabledStart + 3, saveFieldStart)}`, prefContext);

assert.equal(prefContext.keybindFromEvent({ code: 'Digit1', shiftKey: true }), 'Shift+1');
assert.equal(prefContext.keybindFromEvent({ code: 'KeyK', metaKey: true }), 'Meta+K');
assert.equal(prefContext.keybindFromEvent({ code: 'KeyJ', ctrlKey: true }), 'Ctrl+J');
assert.equal(prefContext.keybindFromEvent({ code: 'Tab' }), null);

(async () => {
  const button = { disabled: false };
  const event = { currentTarget: button };
  let settled = false;
  const operation = prefContext.withDisabledEvent(event, async (capturedButton) => {
    await Promise.resolve();
    assert.equal(capturedButton, button);
    assert.equal(button.disabled, true);
    settled = true;
  });
  event.currentTarget = null;
  await operation;
  assert.equal(settled, true);
  assert.equal(button.disabled, false);
  console.log('PASS: Preferences navigation, recorded modifiers, and async control state');
})().catch((error) => {
  process.nextTick(() => { throw error; });
});
