const { invoke } = window.__TAURI__.core;
const status = document.getElementById('status');

invoke('engines').then((list) => {
  for (const [engine, ok] of list) {
    const b = document.querySelector(`[data-engine="${engine}"]`);
    if (b && !ok) { b.disabled = true; b.title = 'Not available on this system'; }
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
