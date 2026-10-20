'use strict';
(() => {
  const preferences = document.getElementById('preferences');
  if (!preferences) return;
  const section = document.createElement('section');
  section.className = 'card';
  const title = document.createElement('h2');
  title.textContent = 'Screenshots and recording';
  const text = document.createElement('p');
  text.textContent =
    'Capture your game as PNG screenshots or MP4 video. Use F2 for screenshots and Ctrl+J to start or stop recording.';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open Capture Controls';
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
  stop.textContent = 'Stop Recording · Ctrl+J';
  stop.hidden = true;
  stop.onclick = () => window.__TAURI__.core.invoke('capture_stop').catch((error) => {
    feedback.textContent = String(error);
  });
  function render(state) {
    const active = ['preparing', 'recording', 'finalizing'].includes(state.phase);
    stop.hidden = !active;
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
    if (info.lastScreenshot) screenshotNotice.textContent = `Screenshot saved: ${info.lastScreenshot}`;
  }).catch((error) => { feedback.textContent = String(error); });
  section.append(title, text, feedback, screenshotNotice, stop, button);
  preferences.append(section);
})();
