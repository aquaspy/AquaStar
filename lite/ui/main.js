const { invoke } = window.__TAURI__.core;
const status = document.getElementById('status');
const hideLauncher = document.getElementById('hide-launcher');
const launcherHint = document.getElementById('launcher-hint');
let preferred = null;
let hideTouched = false;

function describeLauncher() {
  const behavior = hideLauncher.checked
    ? 'This window hides while a game is running and comes back when the player exits.'
    : 'This window stays open while a game is running, so the wiki and search stay usable.';
  const who = preferred === 'flash'
    ? 'Flash is the default player. '
    : preferred === 'ruffle'
      ? 'Ruffle is the default player. '
      : '';
  status.textContent = `${who}The game opens in its own window. ${behavior}`;
  launcherHint.textContent = hideLauncher.checked
    ? 'This window hides while a game is running and comes back when the player exits.'
    : 'Off by default, so this window stays open and the wiki and search stay usable. When checked, this window hides while a game is running and comes back when the player exits.';
}

invoke('engines').then((list) => {
  for (const [engine, ok] of list) {
    const b = document.querySelector(`[data-engine="${engine}"]`);
    if (b && !ok) { b.disabled = true; b.title = 'Not available on this system'; }
  }
  return invoke('preferred_engine');
}).then((engine) => {
  preferred = engine;
  const b = document.querySelector(`[data-engine="${engine}"]`);
  if (b && !b.disabled) b.classList.add('primary');
  describeLauncher();
  document.querySelectorAll('[data-movie]').forEach((button) => {
    if (!engine) {
      button.disabled = true;
      button.title = 'Not available on this system';
      return;
    }
    button.addEventListener('click', async () => {
      status.textContent = `Starting ${button.dataset.movie}…`;
      try {
        status.textContent = await invoke('play', { engine, movie: button.dataset.movie });
      } catch (e) { status.textContent = `Error: ${e}`; }
    });
  });
});

invoke('launcher_settings').then((settings) => {
  if (hideTouched) return;
  hideLauncher.checked = settings.hideLauncher;
  describeLauncher();
}).catch((e) => { status.textContent = `Error: ${e}`; });

hideLauncher.addEventListener('change', async () => {
  hideTouched = true;
  try {
    const settings = await invoke('set_hide_launcher', { hide: hideLauncher.checked });
    hideLauncher.checked = settings.hideLauncher;
    describeLauncher();
  } catch (e) { status.textContent = `Error: ${e}`; }
});

document.querySelectorAll('[data-engine]').forEach((b) => b.addEventListener('click', async () => {
  status.textContent = `Starting ${b.dataset.engine}…`;
  try { status.textContent = await invoke('play', { engine: b.dataset.engine, movie: 'primary' }); }
  catch (e) { status.textContent = `Error: ${e}`; }
}));

const openSite = (label, url) => invoke('open_site', { label, url }).catch((e) => { status.textContent = `Error: ${e}`; });
document.querySelectorAll('[data-site]').forEach((b) => b.addEventListener('click', () => openSite(b.dataset.site, b.dataset.url)));
document.getElementById('wiki-search').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const q = ev.target.q.value.trim();
  if (q) openSite('wiki', 'https://aqwwiki.wikidot.com/search:site/q/' + encodeURIComponent(q));
});
document.getElementById('char-page').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const name = ev.target.character.value.trim();
  const url = name
    ? 'https://account.aq.com/CharPage?id=' + encodeURIComponent(name)
    : 'https://account.aq.com/CharPage';
  openSite('char-page', url);
});

const qualitySelect = document.getElementById('ruffle-quality');
const graphicsSelect = document.getElementById('ruffle-graphics');

function fillSelect(el, choices, current) {
  el.replaceChildren();
  for (const c of choices) {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.label;
    el.appendChild(o);
  }
  el.value = current;
}

let applying = false;
function showSettings(s) {
  applying = true;
  fillSelect(qualitySelect, s.qualities, s.ruffleQuality);
  fillSelect(graphicsSelect, s.graphicsChoices, s.ruffleGraphics);
  applying = false;
}

invoke('ruffle_settings').then(showSettings).catch((e) => { status.textContent = `Error: ${e}`; });

async function saveSettings() {
  if (applying) return;
  try {
    showSettings(await invoke('set_ruffle_settings', {
      quality: qualitySelect.value,
      graphics: graphicsSelect.value,
    }));
  } catch (e) { status.textContent = `Error: ${e}`; }
}

qualitySelect.addEventListener('change', saveSettings);
graphicsSelect.addEventListener('change', saveSettings);
