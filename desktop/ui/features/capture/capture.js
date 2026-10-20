'use strict';
const { invoke } = window.__TAURI__.core;
const $ = (id) => document.getElementById(id);
let active = false;
let pending = false;
let lastSaved = '';
function showError(error) {
  $('status').textContent = String(error);
  $('silent').hidden = !String(error).includes('Record Without Audio');
}
function render(status) {
  active = ['preparing', 'recording', 'finalizing'].includes(status.phase);
  document.body.dataset.active = String(active);
  const seconds = status.elapsedSeconds || 0;
  $('elapsed').textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('stop').hidden = !active;
  $('record').hidden = active;
  $('record').disabled = pending;
  $('target').disabled = active || pending;
  $('audio').disabled = active || pending;
  $('remember').disabled = active || pending;
  $('silent').hidden = true;
  if (status.phase === 'recording') $('status').textContent = `REC · ${status.audio ? 'Game audio on' : 'No audio'}`;
  else if (status.phase === 'preparing') $('status').textContent = 'Preparing capture…';
  else if (status.phase === 'canceled') $('status').textContent = 'Capture canceled.';
  else if (status.phase === 'finalizing') $('status').textContent = 'Saving recording…';
  else if (status.phase === 'saved') {
    lastSaved = status.path || '';
    $('status').textContent = `Saved: ${lastSaved}${status.error ? ` · ${status.error}` : ''}`;
  } else if (status.error) showError(status.error);
}
async function refresh() {
  const info = await invoke('capture_info');
  const previous = $('target').value;
  $('target').replaceChildren(
    ...info.targets.map((target) => {
      const option = document.createElement('option');
      option.value = target.token;
      option.textContent = target.title || `Game ${target.pid}`;
      return option;
    })
  );
  if ([...$('target').options].some((option) => option.value === previous)) $('target').value = previous;
  if (info.lastScreenshot) $('notice').textContent = `Screenshot saved: ${info.lastScreenshot}`;
  $('screenshots').textContent = info.settings.screenshots;
  $('videos').textContent = info.settings.videos;
  $('audio').checked = info.settings.audio;
  $('wayland-authorization').hidden = !info.wayland;
  $('remember').checked = info.settings.rememberAuthorization;
  $('remember').disabled = active || pending;
  $('screenshot').disabled = pending || !info.screenshot;
  $('record').disabled = pending || !info.video;
  if (!active && !lastSaved && !info.status.error)
    $('status').textContent =
      info.reason || (info.targets.length ? 'Ready to capture.' : 'Open a game to enable capture.');
  render(info.status);
  $('record').disabled = pending || !info.video;
}
async function action(operation) {
  if (pending) return;
  pending = true;
  try {
    await operation();
    await refresh();
  } catch (error) {
    showError(error);
  } finally {
    pending = false;
    await refresh().catch(showError);
  }
}
function selected() {
  return $('target').value || null;
}
$('screenshot').onclick = () =>
  action(async () => {
    const path = await invoke('capture_screenshot', { id: selected() });
    lastSaved = path;
    $('status').textContent = `Saved: ${path}`;
  });
$('record').onclick = () => action(() => invoke('capture_start', { id: selected(), silent: false }));
$('silent').onclick = () => action(() => invoke('capture_start', { id: selected(), silent: true }));
$('stop').onclick = () => invoke('capture_stop').catch(showError);
$('audio').onchange = () => invoke('capture_set_audio', { enabled: $('audio').checked }).catch(showError);
document.querySelectorAll('[data-folder]').forEach((button) => {
  button.onclick = () => action(() => invoke('capture_choose_folder', { kind: button.dataset.folder }));
});
document.querySelectorAll('[data-open]').forEach((button) => {
  button.onclick = () => invoke('capture_open_folder', { kind: button.dataset.open }).catch(showError);
});
window.__TAURI__.event.listen('capture-state', (event) => render(event.payload)).catch(showError);
refresh().catch(showError);
setInterval(() => {
  if (!pending) refresh().catch(showError);
}, 2000);

window.__TAURI__.event
  .listen('capture-screenshot', (event) => {
    $('notice').textContent = `Screenshot saved: ${event.payload}`;
  })
  .catch(showError);

$('remember').onchange = () => action(() => invoke('capture_set_remember_authorization', { enabled: $('remember').checked }));

window.__TAURI__.event.listen('capture-screenshot-error', (event) => {
  $('notice').textContent = String(event.payload);
}).catch(showError);
