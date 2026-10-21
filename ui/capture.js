'use strict';
(() => {
  const preferences = document.getElementById('capture-preferences');
  if (!preferences) return;
  const section = document.createElement('section');
  section.className = 'pref';
  const title = document.createElement('h2');
  title.textContent = 'Screenshots and recording';
  const text = document.createElement('p');
  text.textContent =
    'Capture your game as PNG screenshots or MP4 video. Use F2 for screenshots and Ctrl+J to start or stop recording.';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open capture controls';
  button.onclick = () =>
    window.__TAURI__.core.invoke('capture_show').catch((error) => {
      text.textContent = String(error);
    });
  const feedback = document.createElement('p');
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  const screenshotNotice = document.createElement('p');
  screenshotNotice.setAttribute('role', 'status');
  const stop = document.createElement('button');
  stop.type = 'button';
  stop.textContent = 'Stop recording · Ctrl+J';
  stop.hidden = true;
  stop.onclick = () => window.__TAURI__.core.invoke('capture_stop').catch((error) => {
    feedback.textContent = String(error);
  });
  const screenshot = document.createElement('button');
  screenshot.type = 'button'; screenshot.textContent = 'Take game screenshot';
  screenshot.onclick = () => window.__TAURI__.core.invoke('capture_screenshot', { id: null }).catch((e) => { feedback.textContent = String(e); });
  const record = document.createElement('button');
  record.type = 'button'; record.textContent = 'Start game recording';
  record.onclick = () => window.__TAURI__.core.invoke('capture_start', { id: null }).catch((e) => { feedback.textContent = String(e); });
  const folders = document.createElement('p');
  const shortcutLabel = document.createElement('label');
  shortcutLabel.hidden = true;
  const shortcutToggle = document.createElement('input'); shortcutToggle.type = 'checkbox';
  shortcutLabel.append(shortcutToggle, ' Use GNOME shortcuts for capture');
  const shortcutHint = document.createElement('p'); shortcutHint.hidden = true;
  shortcutHint.textContent = 'Registers screenshot and recording shortcuts with GNOME while a game is open. Existing desktop shortcuts are preserved. Disable this option to remove AquaStar NEO’s entries.';
  shortcutToggle.onchange = async () => {
    shortcutToggle.disabled = true;
    try { await window.__TAURI__.core.invoke('capture_set_gnome_shortcuts', { enabled: shortcutToggle.checked }); }
    catch (error) { feedback.textContent = String(error); shortcutToggle.checked = !shortcutToggle.checked; }
    finally { shortcutToggle.disabled = false; }
  };
  function render(state) {
    const active = ['preparing', 'recording', 'finalizing'].includes(state.phase);
    stop.hidden = !active;
    record.hidden = active;
    stop.disabled = state.phase === 'finalizing';
    if (state.phase === 'recording') {
      const seconds = state.elapsedSeconds || 0;
      feedback.textContent = `● REC · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · Ctrl+J to stop`;
    } else if (state.phase === 'preparing') feedback.textContent = 'Preparing recording…';
    else if (state.phase === 'finalizing') feedback.textContent = 'Saving recording…';
    else if (state.error) feedback.textContent = String(state.error);
    else if (state.phase === 'saved') feedback.textContent = `Saved: ${state.path}`;
    else if (state.phase === 'canceled') feedback.textContent = 'Recording canceled.';
  }
  window.__TAURI__.event.listen('capture-state', (event) => render(event.payload));
  window.__TAURI__.event.listen('capture-screenshot', (event) => {
    screenshotNotice.textContent = `Screenshot saved: ${event.payload}`;
  });
  window.__TAURI__.event.listen('capture-screenshot-error', (event) => {
    screenshotNotice.textContent = String(event.payload);
  });
  window.__TAURI__.core.invoke('capture_info').then((info) => {
    render(info.status);
    folders.textContent = `Screenshots: ${info.settings.screenshots} · Videos: ${info.settings.videos}`;
    shortcutLabel.hidden = !info.gnomeShortcutsAvailable;
    shortcutHint.hidden = !info.gnomeShortcutsAvailable;
    shortcutToggle.checked = info.settings.gnomeShortcuts;
    if (info.wayland && !info.settings.gnomeShortcuts) {
      feedback.textContent = 'Global capture shortcuts may require desktop setup on Wayland. You can also use the buttons here.';
    }
    if (info.lastScreenshot) screenshotNotice.textContent = `Screenshot saved: ${info.lastScreenshot}`;
  }).catch((error) => { feedback.textContent = String(error); });
  section.append(title, text, feedback, screenshotNotice, screenshot, record, stop, folders, shortcutLabel, shortcutHint, button);
  preferences.append(section);
})();
