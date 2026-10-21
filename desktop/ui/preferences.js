'use strict';
(() => {
  const { invoke } = window.__TAURI__.core;
  const tabs = [...document.querySelectorAll('[data-preferences-tab]')];
  const panels = {
    general: document.getElementById('panel-general'),
    aqw: document.getElementById('panel-aqw'),
    keybinds: document.getElementById('panel-keybinds')
  };
  const generalMount = document.getElementById('profile-general-preferences');
  const aqwPanel = panels.aqw;
  const keybindPanel = panels.keybinds;
  const state = { mode: 'loading', activeTab: 'general', snapshot: null, recorder: null, loaded: false, groupResetting: false };
  const keybindLabels = {
    sshot: ['Capture', 'Take game screenshot'],
    record: ['Capture', 'Start/stop game recording'],
    about: ['App', 'About AquaStar'],
    fullscreen: ['App', 'Toggle AquaStar window fullscreen'],
    reload: ['App', 'Reload AquaStar page'],
    forward: ['App', 'Forward'],
    backward: ['App', 'Back'],
    help: ['App', 'Help'],
    settings: ['App', 'Open Preferences'],
    wiki: ['Adventure Quest Worlds', 'Wiki'],
    account: ['Adventure Quest Worlds', 'Account'],
    design: ['Adventure Quest Worlds', 'Design notes'],
    charpage: ['Adventure Quest Worlds', 'Character page'],
    newAqw: ['Adventure Quest Worlds', 'Launch AQW'],
    dragon: ['Adventure Quest Worlds', 'Launch DragonFable'],
    reminders: ['Adventure Quest Worlds', 'Reminders'],
    todo: ['Adventure Quest Worlds', 'To-do list'],
    inventory: ['Adventure Quest Worlds', 'Inventory'],
    strategy: ['Adventure Quest Worlds', 'Strategy']
  };

  function element(tag, attributes = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (value === true) node.setAttribute(key, '');
      else if (value !== false && value != null) node.setAttribute(key, value);
    }
    node.append(...children.filter(Boolean));
    return node;
  }

  function announce(text, error = false) {
    const live = document.getElementById('preferences-status');
    live.textContent = text;
    live.dataset.error = String(error);
  }

  function selectTab(id, moveFocus = false) {
    if (!panels[id]) return;
    cancelRecording(false);
    state.activeTab = id;
    for (const tab of tabs) {
      const selected = tab.dataset.preferencesTab === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[tab.dataset.preferencesTab].hidden = !selected;
    }
    if (moveFocus) tabs.find((tab) => tab.dataset.preferencesTab === id)?.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.preferencesTab));
    tab.addEventListener('keydown', (event) => {
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index + tabs.length - 1) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        event.preventDefault();
        selectTab(next.dataset.preferencesTab, true);
      }
    });
  });

  function field(label, control, hint = '', key = '', reset = null) {
    const row = element('div', { class: 'preference-field' },
      element('label', { for: control.id, text: label }),
      element('div', { class: 'preference-field-control' }, control, reset)
    );
    if (hint) row.append(element('p', { class: 'hint', text: hint }));
    if (key) {
      const status = element('p', { id: `profile-status-${key}`, class: 'hint preference-field-status', role: 'status', 'aria-live': 'polite' });
      control.setAttribute('aria-describedby', status.id);
      row.append(status);
    }
    return row;
  }

  function makeControl(label, type, key, value, defaultValue, hint = '') {
    const control = document.createElement(type === 'select' ? 'select' : 'input');
    control.id = `profile-${key}`;
    control.dataset.preferenceKey = key;
    if (type === 'checkbox') {
      control.type = 'checkbox';
      control.checked = value === true;
    } else if (type === 'select') {
      for (const [id, name] of [['system', 'System default'], ['en-US', 'English'], ['pt-BR', 'Português (Brasil)']]) {
        control.append(element('option', { value: id, text: name }));
      }
      control.value = value;
    } else {
      control.type = 'text';
      control.value = value || '';
      control.autocomplete = 'off';
    }
    control.addEventListener('change', () => saveField(key, control));
    const reset = element('button', { type: 'button', class: 'preference-reset', text: 'Reset' });
    reset.setAttribute('aria-label', `Reset ${label}`);
    reset.addEventListener('click', () => {
      if (type === 'checkbox') control.checked = defaultValue === true;
      else control.value = defaultValue;
      saveField(key, control);
    });
    return field(label, control, hint, key, reset);
  }

  function renderProfile(snapshot) {
    state.snapshot = snapshot;
    generalMount.replaceChildren(
      element('section', { class: 'pref' },
        element('h2', { class: 'pref-title', text: 'Menu and dialog language' }),
        element('p', { class: 'hint', text: 'This changes AquaStar menus and dialogs. The launcher and plugin interfaces remain in their supplied language.' }),
        makeControl('Language', 'select', 'appLanguage', snapshot.appLanguage, snapshot.defaults.appLanguage)
      )
    );
    renderAqw(snapshot);
    renderKeybinds(snapshot);
  }

  function renderAqw(snapshot) {
    const account = element('section', { class: 'pref' }, element('h2', { class: 'pref-title', text: 'Character and inventory' }));
    account.append(
      makeControl('Character name', 'text', 'playerCharacter', snapshot.playerCharacter, snapshot.defaults.playerCharacter,
        'Used by the character page shortcut and Char Page Studio.'),
      makeControl('Automatically sync inventory', 'checkbox', 'autoSync', snapshot.autoSync, snapshot.defaults.autoSync,
        'Uses the saved Account login for background sync.'),
      makeControl('Follow Artix’s game loader', 'checkbox', 'liveLoaderUrl', snapshot.liveLoaderUrl, snapshot.defaults.liveLoaderUrl,
        'A custom SWF file or custom URL takes precedence. Applies the next time AQW launches.')
    );
    const advanced = element('details', { class: 'pref' }, element('summary', { text: 'Advanced game settings' }));
    advanced.append(makeControl('Custom AQW SWF URL', 'text', 'customUrl', snapshot.customUrl, snapshot.defaults.customUrl,
      'Use an HTTPS URL ending in .swf. A custom SWF file takes precedence. Applies the next time AQW launches.'));
    const swfActions = element('div', { class: 'preference-actions' },
      element('button', { type: 'button', id: 'custom-swf-choose', text: 'Choose custom AQW SWF file' }),
      element('button', { type: 'button', id: 'custom-swf-remove', text: 'Remove custom AQW SWF file' })
    );
    const swfStatus = element('p', { id: 'custom-swf-status', class: 'hint', role: 'status', 'aria-live': 'polite', text: 'Checking custom SWF file…' });
    advanced.append(swfActions, swfStatus);
    aqwPanel.replaceChildren(
      element('p', { class: 'hint', text: 'These settings apply to Adventure Quest Worlds.' }),
      account,
      advanced
    );
    const status = aqwPanel.querySelector('#custom-swf-status');
    const refreshSwf = () => invoke('get_custom_swf_status').then((result) => {
      status.textContent = result.exists ? `Custom SWF file: ${result.path}` : 'No custom AQW SWF file is selected.';
    }).catch((error) => { status.textContent = `Could not check the custom SWF file: ${error}`; });
    aqwPanel.querySelector('#custom-swf-choose').addEventListener('click', async (event) => {
      await withDisabledEvent(event, async () => {
        try {
          const result = await invoke('choose_custom_swf');
          if (!result.canceled) announce('Custom AQW SWF file saved. It will apply the next time AQW launches.');
          await refreshSwf();
        } catch (error) { announce(String(error), true); }
      });
    });
    aqwPanel.querySelector('#custom-swf-remove').addEventListener('click', async (event) => {
      if (!window.confirm('Remove the custom AQW SWF file?')) return;
      await withDisabledEvent(event, async () => {
        try {
          const result = await invoke('remove_custom_swf');
          if (result.error) throw new Error(result.error);
          announce('Custom AQW SWF file removed.');
          await refreshSwf();
        } catch (error) { announce(String(error), true); }
      });
    });
    refreshSwf();
  }

  function shortcutText(binding) {
    return Array.isArray(binding) ? binding.join(', ') : String(binding ?? '');
  }

  function groupName(id) {
    return (keybindLabels[id] || ['Adventure Quest Worlds', id])[0];
  }

  function displayName(id) {
    return (keybindLabels[id] || ['Adventure Quest Worlds', id])[1];
  }

  function renderKeybinds(snapshot) {
    const groups = new Map();
    const diagnostics = new Map((snapshot.keybindDiagnostics || []).map((item) => [item.split(':')[0], item]));
    for (const item of snapshot.keybinds || []) {
      const group = groupName(item.id);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(item);
    }
    const content = [element('p', { class: 'hint', text: 'Saved shortcuts may require restarting AquaStar.' })];
    for (const [group, items] of groups) {
      const card = element('section', { class: 'pref keybind-group' },
        element('div', { class: 'keybind-group-head' },
          element('h2', { class: 'pref-title', text: group }),
          element('button', { type: 'button', class: 'reset-group', text: 'Reset visible shortcuts' })
        )
      );
      const rows = [];
      for (const item of items) {
        const input = element('input', { id: `keybind-${item.id}`, type: 'text', readonly: true, value: shortcutText(item.binding), 'aria-describedby': `keybind-status-${item.id}` });
        input.value = shortcutText(item.binding);
        const rowStatus = element('p', { id: `keybind-status-${item.id}`, class: 'hint keybind-status', role: 'status', text: diagnostics.get(item.id) || '' });
        if (diagnostics.has(item.id)) rowStatus.dataset.error = 'true';
        const record = element('button', { type: 'button', text: 'Record', 'aria-label': `Record shortcut for ${displayName(item.id)}` });
        const reset = element('button', { type: 'button', text: 'Reset', 'aria-label': `Reset ${displayName(item.id)} shortcut` });
        const row = element('div', { class: 'keybind-row', 'data-keybind-id': item.id },
          element('label', { for: input.id, text: displayName(item.id) }),
          input,
          element('div', { class: 'preference-actions' }, record, reset),
          rowStatus
        );
        record.addEventListener('click', () => startRecording(item, input, rowStatus, record));
        reset.addEventListener('click', () => saveKeybind(item, item.default, input, rowStatus, reset));
        row.resetButton = reset;
        row.recordButton = record;
        rows.push(row);
        card.append(row);
      }
      card.querySelector('.reset-group').addEventListener('click', async (event) => {
        if (state.groupResetting) return;
        const resetGroup = event.currentTarget;
        state.groupResetting = true;
        resetGroup.disabled = true;
        for (const row of rows) {
          const item = snapshot.keybinds.find((candidate) => candidate.id === row.dataset.keybindId);
          await saveKeybind(item, item.default, row.querySelector('input'), row.querySelector('.keybind-status'), row.resetButton, true);
        }
        state.groupResetting = false;
        setEditorsDisabled(false);
        resetGroup.disabled = false;
      });
      content.push(card);
    }
    keybindPanel.replaceChildren(...content);
  }

  function payloadFor(key, value) {
    return { kind: key, value };
  }

  function keybindFromEvent(event) {
    const code = event.code;
    let key = null;
    if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
    else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
    else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code;
    else key = ({ Space: 'Space', Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' })[code] || null;
    if (!key || key === 'Tab') return null;
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.metaKey) parts.push('Meta');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    parts.push(key);
    return parts.join('+');
  }

  async function withDisabledEvent(event, action) {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      return await action(button);
    } finally {
      button.disabled = false;
    }
  }

  async function saveField(key, control) {
    if (state.mode === 'saving') return;
    const prior = state.snapshot[key];
    const value = control.type === 'checkbox' ? control.checked : control.value;
    state.mode = 'saving';
    setEditorsDisabled(true);
    try {
      const saved = await invoke('change_profile_preference', { change: payloadFor(key, value) });
      state.snapshot = saved;
      if (control.type === 'checkbox') control.checked = saved[key];
      else control.value = saved[key];
      document.getElementById(`profile-status-${key}`).textContent = 'Saved.';
      document.getElementById(`profile-status-${key}`).dataset.error = 'false';
      if (key === 'appLanguage') showRestartNotice();
      announce('Preference saved.');
    } catch (error) {
      if (control.type === 'checkbox' || control.tagName === 'SELECT') control[control.type === 'checkbox' ? 'checked' : 'value'] = prior;
      document.getElementById(`profile-status-${key}`).textContent = String(error);
      document.getElementById(`profile-status-${key}`).dataset.error = 'true';
      announce(String(error), true);
    } finally {
      state.mode = 'idle';
      setEditorsDisabled(false);
    }
  }

  async function saveKeybind(item, binding, input, rowStatus, button, quiet = false) {
    if (state.mode === 'saving') return;
    state.mode = 'saving';
    const row = input.closest('.keybind-row');
    setEditorsDisabled(true);
    try {
      const saved = await invoke('change_profile_preference', {
        change: payloadFor('keybind', { id: item.id, binding })
      });
      state.snapshot = saved;
      const updated = saved.keybinds.find((candidate) => candidate.id === item.id);
      item.binding = updated.binding;
      input.value = shortcutText(updated.binding);
      rowStatus.textContent = (saved.keybindDiagnostics || []).find((message) => message.startsWith(`${item.id}:`)) || '';
      rowStatus.dataset.error = 'false';
      showRestartNotice();
      if (!quiet) announce(`${displayName(item.id)} shortcut saved. Restart AquaStar to apply saved keybinds.`);
    } catch (error) {
      rowStatus.textContent = String(error);
      rowStatus.dataset.error = 'true';
      if (!quiet) announce(`${displayName(item.id)} shortcut was not saved. ${error}`, true);
    } finally {
      state.mode = 'idle';
      setEditorsDisabled(false);
    }
  }

  function stopRecording(restoreFocus = true) {
    const recording = state.recorder;
    if (!recording) return;
    document.removeEventListener('keydown', recording.onKey, true);
    window.removeEventListener('blur', recording.onBlur);
    state.recorder = null;
    recording.button.textContent = 'Record';
    recording.button.removeAttribute('aria-pressed');
    if (restoreFocus && document.contains(recording.button)) recording.button.focus();
  }

  function cancelRecording(restoreFocus = true) {
    if (!state.recorder) return;
    const status = state.recorder.status;
    stopRecording(restoreFocus);
    status.textContent = 'Recording canceled.';
  }

  function startRecording(item, input, status, button) {
    cancelRecording(false);
    state.recorder = { item, input, status, button, onKey: null, onBlur: null };
    button.textContent = 'Press a shortcut…';
    button.setAttribute('aria-pressed', 'true');
    status.textContent = 'Press a supported shortcut. Escape cancels. Tab leaves recording.';
    const onKey = (event) => {
      if (event.key === 'Tab') {
        cancelRecording(false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        cancelRecording(true);
        return;
      }
      const binding = keybindFromEvent(event);
      if (!binding) return;
      const current = state.recorder;
      stopRecording(false);
      saveKeybind(current.item, binding, current.input, current.status, current.button);
    };
    const onBlur = () => cancelRecording(false);
    state.recorder.onKey = onKey;
    state.recorder.onBlur = onBlur;
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur, { once: true });
  }

  function cancelForDeactivation() {
    cancelRecording(false);
  }

  document.addEventListener('aquastar:preferences-activated', () => {
    if (!state.loaded) load();
  });
  document.addEventListener('aquastar:view-changed', (event) => {
    if (event.detail !== 'preferences') cancelForDeactivation();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelForDeactivation(); });

  async function load() {
    if (loadPromise) return loadPromise;
    loadPromise = loadSnapshot().finally(() => { loadPromise = null; });
    return loadPromise;
  }

  async function loadSnapshot() {
    try {
      const snapshot = await invoke('get_profile_preferences');
      state.mode = 'idle';
      state.loaded = true;
      renderProfile(snapshot);
    } catch (error) {
      state.mode = 'error';
      const liveStatus = document.getElementById('preferences-status');
      liveStatus.replaceChildren(document.createTextNode(`Could not load Preferences: ${error} `));
      liveStatus.dataset.error = 'true';
      const retry = element('button', { type: 'button', text: 'Retry' });
      retry.addEventListener('click', () => {
        state.mode = 'loading';
        liveStatus.replaceChildren(document.createTextNode('Loading Preferences…'));
        liveStatus.dataset.error = 'false';
        load();
      });
      liveStatus.append(retry);
    }
  }

  document.addEventListener('aquastar:preferences-tab', (event) => selectTab(event.detail));
  selectTab('general');
  const live = element('p', { id: 'preferences-status', class: 'preference-status', role: 'status', 'aria-live': 'polite' });
  document.getElementById('preferences').append(live);
  let loadPromise = null;
  document.getElementById('preferences-restart-button').addEventListener('click', () => invoke('restart_app').catch((error) => announce(String(error), true)));
  load();

  function showRestartNotice() {
    document.getElementById('preferences-restart').hidden = false;
  }

  function setEditorsDisabled(disabled) {
    if (!disabled && state.groupResetting) return;
    document.querySelectorAll('#profile-general-preferences input, #profile-general-preferences select, #profile-general-preferences button, #panel-aqw input, #panel-aqw select, #panel-aqw button, #panel-keybinds input, #panel-keybinds button').forEach((control) => {
      control.disabled = disabled;
    });
  }
})();
