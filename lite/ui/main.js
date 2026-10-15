const { invoke } = window.__TAURI__.core;
const status = document.getElementById('status');

invoke('engines').then((list) => {
  for (const [engine, ok] of list) {
    const b = document.querySelector(`[data-engine="${engine}"]`);
    if (b && !ok) { b.disabled = true; b.title = 'Not available on this system'; }
  }
  return invoke('preferred_engine');
}).then((engine) => {
  const b = document.querySelector(`[data-engine="${engine}"]`);
  if (!b || b.disabled) return;
  b.classList.add('primary');
  if (engine === 'flash') {
    status.textContent = 'Flash is the default player. The game opens in its own window. Closing AquaStar Lite closes it too.';
  }
});

document.querySelectorAll('[data-engine]').forEach((b) => b.addEventListener('click', async () => {
  status.textContent = `Starting ${b.dataset.engine} (first run downloads and verifies the player)…`;
  try { status.textContent = await invoke('play', { engine: b.dataset.engine }); }
  catch (e) { status.textContent = `Error: ${e}`; }
}));

const openSite = (label, url) => invoke('open_site', { label, url }).catch((e) => { status.textContent = `Error: ${e}`; });
document.querySelectorAll('[data-site]').forEach((b) => b.addEventListener('click', () => openSite(b.dataset.site, b.dataset.url)));
document.getElementById('wiki-search').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const q = ev.target.q.value.trim();
  if (q) openSite('wiki', 'https://aqwwiki.wikidot.com/search:site/q/' + encodeURIComponent(q));
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
