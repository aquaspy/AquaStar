const { invoke } = window.__TAURI__.core;
const status = document.getElementById('status');
const hideLauncher = document.getElementById('hide-launcher');
const launcherHint = document.getElementById('launcher-hint');
const playerSelect = document.getElementById('engine-select');
const playButton = document.getElementById('play-now');
const panels = {
  play: { title: 'Ready to play' },
  tools: { title: 'Tools' },
  links: { title: 'Useful Pages' },
  preferences: { title: 'Preferences' }
};
const games = {
  primary: { title: 'AdventureQuest Worlds' },
  dragonfable: { title: 'DragonFable' }
};
const launcher = { game: 'primary', engines: [], selectedEngine: null, phase: 'loading' };

function message(text, error = false) {
  status.textContent = text;
  status.dataset.error = String(error);
}
function failure(error) {
  message(`Error: ${error}`, true);
}
function describeLauncher() {
  launcherHint.textContent = hideLauncher.checked
    ? 'The launcher hides during gameplay and returns when the player exits.'
    : 'The launcher stays open so your tools and wiki remain within reach.';
}
function renderLaunch() {
  const pending = launcher.phase === 'launching';
  playButton.disabled = launcher.phase === 'loading' || pending || !launcher.selectedEngine;
  playButton.textContent = pending ? 'Opening player…' : 'Play now ↗';
  playerSelect.disabled = launcher.phase === 'loading' || pending || !launcher.engines.length;
  document.querySelectorAll('[data-game]').forEach((button) => {
    button.disabled = pending;
    button.setAttribute('aria-pressed', String(button.dataset.game === launcher.game));
  });
  document.getElementById('game-title').textContent = games[launcher.game].title;
}
function showPanel(name) {
  if (!panels[name]) return;
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.hidden = panel.id !== name;
  });
  document.querySelectorAll('.nav-button').forEach((button) => {
    if (button.dataset.panel === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.getElementById('page-title').textContent = panels[name].title;
}
document.querySelectorAll('[data-panel]').forEach((button) => {
  button.addEventListener('click', () => showPanel(button.dataset.panel));
});
document.querySelectorAll('[data-game]').forEach((button) => {
  button.addEventListener('click', () => {
    if (launcher.phase === 'launching' || !games[button.dataset.game]) return;
    launcher.game = button.dataset.game;
    renderLaunch();
  });
});
playerSelect.addEventListener('change', () => {
  if (launcher.phase === 'launching') return;
  launcher.selectedEngine = launcher.engines.includes(playerSelect.value) ? playerSelect.value : null;
  renderLaunch();
});
playButton.addEventListener('click', async () => {
  if (playButton.disabled || launcher.phase === 'launching') return;
  launcher.phase = 'launching';
  renderLaunch();
  message(`Opening ${games[launcher.game].title}…`);
  try {
    message(await invoke('play', { engine: launcher.selectedEngine, movie: launcher.game }));
  } catch (error) {
    failure(error);
  } finally {
    launcher.phase = 'ready';
    renderLaunch();
  }
});
async function loadEngines() {
  try {
    const list = await invoke('engines');
    launcher.engines = list.filter((entry) => entry[1]).map((entry) => entry[0]);
    const preferred = await invoke('preferred_engine').catch((error) => {
      failure(error);
      return null;
    });
    launcher.selectedEngine = launcher.engines.includes(preferred) ? preferred : launcher.engines[0] || null;
    playerSelect.replaceChildren();
    for (const engine of launcher.engines) {
      const option = document.createElement('option');
      option.value = engine;
      option.textContent =
        (engine === 'ruffle' ? 'Ruffle' : 'Flash Player') + (engine === preferred ? ' · default' : '');
      playerSelect.appendChild(option);
    }
    if (launcher.selectedEngine) playerSelect.value = launcher.selectedEngine;
    else message('No supported player is available on this system.', true);
  } catch (error) {
    failure(error);
  } finally {
    launcher.phase = 'ready';
    renderLaunch();
  }
}
loadEngines();

invoke('launcher_settings')
  .then((settings) => {
    hideLauncher.checked = settings.hideLauncher;
    hideLauncher.disabled = false;
    describeLauncher();
  })
  .catch(failure);
hideLauncher.addEventListener('change', async () => {
  hideLauncher.disabled = true;
  try {
    const settings = await invoke('set_hide_launcher', { hide: hideLauncher.checked });
    hideLauncher.checked = settings.hideLauncher;
    describeLauncher();
  } catch (error) {
    hideLauncher.checked = !hideLauncher.checked;
    failure(error);
  } finally {
    hideLauncher.disabled = false;
  }
});

document.querySelectorAll('[data-tool]').forEach((button) =>
  button.addEventListener('click', () => {
    invoke('open_tool', { name: button.dataset.tool }).catch(failure);
  })
);
const openSite = (label, url, title) => invoke('open_site', { label, url, title }).catch(failure);
let charpageUrl = null;
const characterButton = document.querySelector('#char-page button');
characterButton.disabled = true;
invoke('get_shell_pages')
  .then((shell) => {
    const mount = document.getElementById('site-buttons');
    for (const group of shell.groups || []) {
      const block = document.createElement('div');
      block.className = 'site-group';
      if (group.label) {
        const heading = document.createElement('h3');
        heading.textContent = group.label;
        block.appendChild(heading);
      }
      const grid = document.createElement('div');
      grid.className = 'site-grid';
      for (const page of group.pages || []) {
        if (page.id === 'charpage') charpageUrl = page.url;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = page.label;
        button.addEventListener('click', () => openSite(page.id, page.url, page.label));
        grid.appendChild(button);
      }
      block.appendChild(grid);
      mount.appendChild(block);
    }
    characterButton.disabled = !charpageUrl;
  })
  .catch(failure);
document.getElementById('wiki-search').addEventListener('submit', (event) => {
  event.preventDefault();
  const query = event.target.q.value.trim();
  if (query) openSite('wiki', 'https://aqwwiki.wikidot.com/search:site/q/' + encodeURIComponent(query), 'AQW Wiki');
});
document.getElementById('char-page').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!charpageUrl) return;
  const name = event.target.character.value.trim().replace(/[^a-zA-Z0-9]/g, '');
  openSite('charpage', name ? charpageUrl + '?id=' + encodeURIComponent(name) : charpageUrl, 'Charpages');
});
const qualitySelect = document.getElementById('ruffle-quality');
const graphicsSelect = document.getElementById('ruffle-graphics');
let savedRuffleSettings = null;
function fillSelect(element, choices, current) {
  element.replaceChildren();
  for (const choice of choices) {
    const option = document.createElement('option');
    option.value = choice.id;
    option.textContent = choice.label;
    element.appendChild(option);
  }
  element.value = current;
}
function showSettings(settings) {
  savedRuffleSettings = settings;
  fillSelect(qualitySelect, settings.qualities, settings.ruffleQuality);
  fillSelect(graphicsSelect, settings.graphicsChoices, settings.ruffleGraphics);
  qualitySelect.disabled = false;
  graphicsSelect.disabled = false;
}
invoke('ruffle_settings').then(showSettings).catch(failure);
async function saveSettings() {
  qualitySelect.disabled = true;
  graphicsSelect.disabled = true;
  try {
    showSettings(
      await invoke('set_ruffle_settings', {
        quality: qualitySelect.value,
        graphics: graphicsSelect.value
      })
    );
    message('Ruffle preferences saved. They apply the next time you launch a game.');
  } catch (error) {
    if (savedRuffleSettings) showSettings(savedRuffleSettings);
    failure(error);
  }
}
qualitySelect.addEventListener('change', saveSettings);
graphicsSelect.addEventListener('change', saveSettings);
