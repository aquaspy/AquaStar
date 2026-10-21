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

function fakeElement(attributes = {}, ...children) {
  return {
    ...attributes,
    children,
    dataset: {},
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    setAttribute(name, value) { this[name] = value; },
    dispatch(type, event = {}) {
      let prevented = false;
      this.listeners[type]?.({ preventDefault() { prevented = true; }, ...event });
      return prevented;
    }
  };
}

const profileControls = [];
const profileButtons = [];
const profileContext = {
  document: {
    createElement: () => {
      const control = fakeElement();
      profileControls.push(control);
      return control;
    },
    getElementById: () => profileContext.documentStatus
  },
  element: (tag, attributes, ...children) => {
    const node = fakeElement(attributes, ...children);
    if (attributes?.class === 'preference-reset') profileButtons.push(node);
    return node;
  },
  field: (label, control, hint, key, reset) => ({ control, reset }),
  state: { mode: 'idle', snapshot: { playerCharacter: 'edited' } },
  payloadFor: (key, value) => ({ kind: key, value }),
  documentStatus: { textContent: '', dataset: {} },
  showRestartNotice() {},
  announce() {}
};
let resolvePreferenceSave;
const preferenceSaves = [];
profileContext.invoke = (command, args) => {
  preferenceSaves.push(args.change.value);
  return new Promise((resolve) => { resolvePreferenceSave = resolve; });
};
profileContext.setEditorsDisabled = (disabled) => {
  profileButtons.forEach((button) => { button.disabled = disabled; });
};
vm.createContext(profileContext);
const makeControlStart = preferenceSource.indexOf('function makeControl(');
const renderProfileStart = preferenceSource.indexOf('\n  function renderProfile(', makeControlStart);
const profileSaveFieldStart = preferenceSource.indexOf('\n  async function saveField(', renderProfileStart);
const profileSaveKeybindStart = preferenceSource.indexOf('\n  async function saveKeybind(', profileSaveFieldStart);
assert.ok(makeControlStart >= 0 && renderProfileStart > makeControlStart && profileSaveFieldStart > renderProfileStart && profileSaveKeybindStart > profileSaveFieldStart);
vm.runInContext(`${preferenceSource.slice(makeControlStart, renderProfileStart)}\n${preferenceSource.slice(profileSaveFieldStart + 3, profileSaveKeybindStart)}`, profileContext);

async function resetEditedTextField() {
  profileContext.makeControl('Character name', 'text', 'playerCharacter', 'edited', 'default');
  const control = profileControls[0];
  const reset = profileButtons[0];
  const prevented = reset.dispatch('pointerdown', { button: 0 });
  const pendingSave = prevented ? null : control.listeners.change?.();
  if (!reset.disabled) reset.listeners.click();
  assert.equal(preferenceSaves.length, 1, 'Reset should persist once after an edited text field is reset');
  assert.equal(preferenceSaves[0], 'default', 'the persisted value after Reset must be the default');
  resolvePreferenceSave({ playerCharacter: 'default' });
  if (pendingSave) await pendingSave;
  else await new Promise((resolve) => setImmediate(resolve));
  assert.equal(control.value, 'default', 'the text control should show the saved default after Reset');
}

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
  await resetEditedTextField();
  console.log('PASS: Preferences navigation, recorded modifiers, async control state, and text Reset persistence');
})().catch((error) => {
  process.nextTick(() => { throw error; });
});
