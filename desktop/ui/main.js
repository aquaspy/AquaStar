const { invoke } = window.__TAURI__.core;
const status = document.getElementById('status');
const banner = document.getElementById('banner');
const pluginPage = document.getElementById('plugin-page');
const pluginNav = document.getElementById('plugin-nav');
const hideLauncher = document.getElementById('hide-launcher');
const showMenuBar = document.getElementById('show-menu-bar');
const launcherHint = document.getElementById('launcher-hint');
const startupSelect = document.getElementById('startup-game');
const commandList = document.getElementById('command-list');
const ENGINE_NAMES = { ruffle: 'Ruffle', flash: 'Flash Player' };
const GLOBAL_PANELS = ['preferences', 'extensions'];

let savedShowMenuBar = false;
let menuBarSupported = true;
let model = { plugins: [], errors: [], restartRequired: false, safeMode: false };
let view = null; // a plugin id, or one of GLOBAL_PANELS
let navigationRevision = 0;
let modelLoaded = false;
const choice = {}; // "<plugin>/<game>" -> engine picked this session
const opening = new Set(); // "<plugin>/<game>" while the player starts

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}
function message(text, error = false) {
  status.textContent = text;
  status.dataset.error = String(error);
}
function failure(error) {
  message(`Error: ${error}`, true);
}
function rememberView(id) {
  try {
    localStorage.setItem('aquastar.view', id);
  } catch (_) {
    /* storage can be unavailable */
  }
}
function savedView() {
  try {
    return localStorage.getItem('aquastar.view');
  } catch (_) {
    return null;
  }
}

function markFor(plugin) {
  const mark = el('span', { class: 'mark', 'aria-hidden': 'true' });
  if (plugin.icon) mark.append(el('img', { src: plugin.icon, alt: '' }));
  else mark.textContent = (plugin.name || '?').charAt(0).toUpperCase();
  return mark;
}

function renderNav() {
  pluginNav.replaceChildren();
  for (const plugin of model.plugins) {
    pluginNav.append(
      el(
        'button',
        { type: 'button', class: 'nav', 'data-plugin': plugin.id, onclick: () => showView(plugin.id) },
        markFor(plugin),
        el(
          'span',
          { class: 'name' },
          el('span', { text: plugin.name }),
          el('span', { class: 'sub', text: plugin.builtIn ? 'Built in' : 'v' + plugin.version })
        )
      )
    );
  }
  markCurrent();
}
function markCurrent() {
  document.querySelectorAll('.nav').forEach((button) => {
    const id = button.dataset.plugin || button.dataset.panel;
    if (id === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function renderBanner() {
  banner.replaceChildren();
  let tone = null;
  const lines = [];
  if (model.safeMode) {
    tone = 'warn';
    lines.push('Safe mode: third-party plugins are disabled. The built-in plugin is still available.');
  }
  if (model.restartRequired) {
    tone = 'warn';
    lines.push('Changes to your plugins are saved. Restart AquaStar to apply them.');
  }
  const errors = model.errors || [];
  if (errors.length) tone = 'bad';
  if (!tone) {
    banner.hidden = true;
    return;
  }
  const text = el('div');
  for (const line of lines) text.append(el('p', { text: line }));
  if (errors.length) {
    text.append(el('p', { text: 'Some plugins could not be loaded:' }));
    const list = el('ul');
    for (const error of errors) list.append(el('li', { text: String(error) }));
    text.append(list);
  }
  banner.dataset.tone = tone;
  banner.setAttribute('role', tone === 'bad' ? 'alert' : 'status');
  banner.append(text);
  if (model.restartRequired) {
    banner.append(
      el('button', { type: 'button', text: 'Restart AquaStar', onclick: () => invoke('extensions_restart').catch(failure) })
    );
  }
  banner.hidden = false;
}

function runPluginAction(pluginId, actionId) {
  invoke('extensions_action', { pluginId, actionId })
    .then((result) => message(typeof result === 'string' ? result : 'Opened.'))
    .catch(failure);
}

function gameCard(plugin, game) {
  const key = `${plugin.id}/${game.id}`;
  const engines = game.engines || [];
  const picked = engines.includes(choice[key]) ? choice[key] : game.selectedEngine;
  const pending = opening.has(key);
  const missing = !engines.length;
  const play = el('button', {
    type: 'button',
    class: 'primary',
    disabled: !game.launchable || pending,
    text: pending ? 'Opening game window…' : 'Open game window ↗',
    onclick: async () => {
      if (opening.has(key)) return;
      opening.add(key);
      renderPlugin();
      message(`Opening ${game.name}…`);
      try {
        message(await invoke('play_game', { pluginId: plugin.id, gameId: game.id, engine: select.value }));
      } catch (error) {
        failure(error);
      } finally {
        opening.delete(key);
        renderPlugin();
      }
    }
  });
  const selectId = 'engine-' + key.replace(/[^a-z0-9-]/gi, '-');
  const select = el('select', {
    id: selectId,
    disabled: missing || pending,
    onchange: (event) => {
      choice[key] = event.target.value;
    }
  });
  for (const engine of engines) {
    select.append(
      el('option', {
        value: engine,
        selected: engine === picked,
        text: (ENGINE_NAMES[engine] || engine) + (engine === game.defaultEngine ? ' · default' : '')
      })
    );
  }
  if (missing) select.append(el('option', { text: 'No player for this system' }));
  let note = '';
  let tone = '';
  if (missing) {
    note = 'No player is available for this game on this system.';
    tone = 'bad';
  } else if (!game.launchable) {
    note = 'This plugin declares no launcher action for this game.';
    tone = 'warn';
  }
  return el(
    'article',
    { class: 'game', 'aria-label': game.name },
    el('h3', { text: game.name }),
    el('p', { text: game.description || '' }),
    el('div', { class: 'launch' }, play, el('label', { class: 'loader', for: selectId }, 'Player', select)),
    el('p', { class: 'state', 'data-tone': tone, text: note }),
    game.command ? el('p', { class: 'command' }, 'Command line: ', el('code', { text: 'aquastar ' + game.command })) : ''
  );
}

function toolButton(plugin, tool) {
  const available = tool.builtin || tool.actionId;
  return el(
    'button',
    {
      type: 'button',
      class: 'tool',
      disabled: !available,
      title: available ? null : 'No launcher action declared',
      onclick: () => {
        if (tool.builtin) invoke('open_tool', { name: tool.builtin }).catch(failure);
        else runPluginAction(plugin.id, tool.actionId);
      }
    },
    el('span', { class: 'glyph', 'aria-hidden': 'true', text: '▦' }),
    el('strong', { text: tool.name }),
    tool.command ? el('span', { class: 'tool-command', text: 'aquastar ' + tool.command }) : ''
  );
}

function linkButton(plugin, link) {
  const external = link.kind === 'external';
  const available = link.kind === 'site' || (external && link.actionId);
  return el('button', {
    type: 'button',
    disabled: !available,
    title: available ? null : 'No launcher action declared',
    text: link.name + (external ? ' ↗' : ''),
    onclick: () => {
      if (link.kind === 'site') invoke('open_site', { label: link.id, url: link.url, title: link.name }).catch(failure);
      else runPluginAction(plugin.id, link.actionId);
    }
  });
}

function searchForm(plugin, search) {
  const input = el('input', {
    type: 'text',
    name: 'q',
    placeholder: search.placeholder || '',
    'aria-label': search.name,
    autocomplete: 'off',
    spellcheck: 'false'
  });
  return el(
    'div',
    { class: 'search' },
    el(
      'form',
      {
        onsubmit: (event) => {
          event.preventDefault();
          if (!input.value.trim()) return;
          invoke('launcher_search', { pluginId: plugin.id, searchId: search.id, query: input.value }).catch(failure);
        }
      },
      input,
      el('button', { type: 'submit', text: 'Search ↗' })
    )
  );
}

function renderBlock(plugin, block) {
  const section = el('section', { class: 'block' });
  if (block.title) section.append(el('h2', { text: block.title }));
  if (block.games) section.append(el('div', { class: 'games' }, ...block.games.map((game) => gameCard(plugin, game))));
  if (block.tools) section.append(el('div', { class: 'grid' }, ...block.tools.map((tool) => toolButton(plugin, tool))));
  for (const group of block.groups || []) {
    section.append(
      el(
        'div',
        { class: 'group' },
        group.label ? el('h3', { text: group.label }) : '',
        el('div', { class: 'chips' }, ...group.links.map((link) => linkButton(plugin, link)))
      )
    );
  }
  for (const search of block.searches || []) section.append(searchForm(plugin, search));
  return section;
}

function renderPlugin() {
  const plugin = model.plugins.find((entry) => entry.id === view);
  // Keep focus and typed text when only a game card changes state.
  const focused = document.activeElement && document.activeElement.id;
  const typed = [...pluginPage.querySelectorAll('input[name="q"]')].map((input) => input.value);
  pluginPage.replaceChildren();
  if (!plugin) return;
  pluginPage.append(
    el(
      'div',
      { class: 'head' },
      markFor(plugin),
      el(
        'div',
        {},
        el('p', { class: 'eyebrow', text: plugin.builtIn ? 'Built-in plugin' : 'Plugin · v' + plugin.version }),
        el('h1', { text: plugin.name }),
        plugin.description ? el('p', { class: 'lead', text: plugin.description }) : '',
        plugin.command ? el('p', { class: 'command' }, 'Command: ', el('code', { text: '--' + plugin.command })) : ''
      )
    )
  );
  if (!plugin.blocks.length) {
    pluginPage.append(el('div', { class: 'empty' }, el('p', { text: 'This plugin has nothing to show on the launcher.' })));
  }
  for (const block of plugin.blocks) pluginPage.append(renderBlock(plugin, block));
  pluginPage.querySelectorAll('input[name="q"]').forEach((input, index) => {
    if (typed[index]) input.value = typed[index];
  });
  if (focused) {
    const again = document.getElementById(focused);
    if (again) again.focus();
  }
}

function renderEmpty() {
  pluginPage.replaceChildren(
    el(
      'div',
      { class: 'empty' },
      el('p', { text: 'No plugins are active.' }),
      el('p', { text: 'Open Manage plugins to enable one or install a ZIP package.' }),
      el('button', { type: 'button', text: 'Manage plugins', onclick: () => showView('extensions') })
    )
  );
}

function showView(id, focus = true) {
  navigationRevision += 1;
  const isGlobal = GLOBAL_PANELS.includes(id);
  view = id;
  pluginPage.hidden = isGlobal;
  GLOBAL_PANELS.forEach((name) => {
    document.getElementById(name).hidden = name !== id;
  });
  if (!isGlobal) {
    rememberView(id);
    if (model.plugins.some((plugin) => plugin.id === id)) renderPlugin();
    else renderEmpty();
  }
  document.dispatchEvent(new CustomEvent('aquastar:view-changed', { detail: id }));
  if (id === 'preferences') document.dispatchEvent(new CustomEvent('aquastar:preferences-activated'));
  markCurrent();
  if (focus) document.getElementById('main').focus();
}

function wantedView(initialLoad, navigationChanged, startShow) {
  if (!initialLoad || navigationChanged) return view || savedView();
  return startShow || (GLOBAL_PANELS.includes(view) ? view : view || savedView());
}

async function loadModel() {
  const requestRevision = navigationRevision;
  const initialLoad = !modelLoaded;
  try {
    model = await invoke('launcher_model');
  } catch (error) {
    failure(error);
    model = { plugins: [], errors: [String(error)], restartRequired: false, safeMode: false };
  }
  modelLoaded = true;
  renderNav();
  renderBanner();
  renderBuiltin();
  renderStartup();
  const start = model.startup || {};
  const wanted = wantedView(initialLoad, navigationRevision !== requestRevision, start.show);
  const target = GLOBAL_PANELS.includes(wanted) || model.plugins.some((plugin) => plugin.id === wanted) ? wanted : null;
  showView(target || (model.plugins[0] && model.plugins[0].id) || 'extensions', false);
  if (start.notice) message(start.notice, true);
}

// What the user can pick for "On start-up", and the command lines that exist.
function renderStartup() {
  startupSelect.replaceChildren(el('option', { value: '', text: 'Show the launcher' }));
  commandList.replaceChildren();
  const saved = model.startup || {};
  let selected = '';
  for (const plugin of model.plugins) {
    for (const block of plugin.blocks) {
      for (const game of block.games || []) {
        if (!game.launchable) continue;
        const value = plugin.id + '|' + game.id;
        if (saved.plugin === plugin.id && saved.game === game.id) selected = value;
        startupSelect.append(el('option', { value, text: 'Open ' + game.name + ' (' + plugin.name + ')' }));
        if (game.command) {
          commandList.append(
            el('li', {}, el('code', { text: 'aquastar ' + game.command }), el('span', { text: ' ' + game.name }))
          );
        }
      }
      for (const tool of block.tools || []) {
        if (!tool.command) continue;
        commandList.append(
          el('li', {}, el('code', { text: 'aquastar ' + tool.command }), el('span', { text: ' ' + tool.name + ' (tool)' }))
        );
      }
    }
  }
  startupSelect.value = selected;
  startupSelect.disabled = false;
  if (!commandList.childElementCount) commandList.append(el('li', { text: 'No plugin offers a command yet.' }));
}
startupSelect.addEventListener('change', async () => {
  const [pluginId, gameId] = startupSelect.value ? startupSelect.value.split('|') : [null, null];
  try {
    await invoke('set_startup', { pluginId, gameId });
    message(
      pluginId
        ? 'AquaStar will open this game on start-up. Reopen AquaStar or use --launcher to change Preferences.'
        : 'AquaStar will show the launcher on start-up.'
    );
  } catch (error) {
    failure(error);
    renderStartup();
  }
});
// A second launch (`aquastar --aqw --launcher`) reaches the running launcher through this event.
if (window.__TAURI__.event) {
  window.__TAURI__.event.listen('aquastar://start', (event) => {
    const { plugin, notice, preferences } = event.payload || {};
    if (preferences) showView('preferences');
    if (plugin && model.plugins.some((entry) => entry.id === plugin)) showView(plugin);
    if (notice) message(notice, true);
  });
}

function renderBuiltin() {
  const mount = document.getElementById('extension-builtin');
  mount.replaceChildren();
  for (const plugin of model.plugins.filter((entry) => entry.builtIn)) {
    mount.append(
      el(
        'article',
        { class: 'extension-card' },
        el(
          'div',
          { class: 'extension-head' },
          el('span', { class: 'extension-mark', 'aria-hidden': 'true', text: plugin.name.charAt(0).toUpperCase() }),
          el(
            'div',
            { class: 'extension-title' },
            el('h2', { text: plugin.name }),
            el('p', { class: 'extension-muted', text: `${plugin.id} · v${plugin.version}` })
          ),
          el('span', { class: 'extension-badge', 'data-tone': 'ok', text: 'Built in' })
        ),
        plugin.description ? el('p', { text: plugin.description }) : '',
        el('p', { class: 'extension-muted', text: 'Always active. It cannot be disabled or removed.' })
      )
    );
  }
}

document.querySelectorAll('[data-panel]').forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.panel));
});
document.addEventListener('aquastar:plugins-changed', () => {
  loadModel();
});

function describeLauncher() {
  launcherHint.textContent = hideLauncher.checked
    ? 'The launcher hides during gameplay and returns when the player exits.'
    : 'The launcher stays open so your tools and wiki remain within reach.';
}
invoke('launcher_settings')
  .then((settings) => {
    hideLauncher.checked = settings.hideLauncher;
    hideLauncher.disabled = false;
    savedShowMenuBar = settings.showMenuBar === true;
    showMenuBar.checked = savedShowMenuBar;
    menuBarSupported = settings.menuBarSupported !== false;
    showMenuBar.disabled = !menuBarSupported;
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
showMenuBar.addEventListener('change', async () => {
  if (!menuBarSupported) {
    showMenuBar.checked = savedShowMenuBar;
    return;
  }
  showMenuBar.disabled = true;
  try {
    const settings = await invoke('set_show_menu_bar', { show: showMenuBar.checked });
    savedShowMenuBar = settings.showMenuBar === true;
    showMenuBar.checked = savedShowMenuBar;
    message(savedShowMenuBar ? 'Menu bar shown.' : 'Menu bar hidden. Keyboard shortcuts remain available.');
  } catch (error) {
    showMenuBar.checked = savedShowMenuBar;
    failure(error);
  } finally {
    showMenuBar.disabled = !menuBarSupported;
  }
});

document.querySelectorAll('[data-tool]').forEach((button) =>
  button.addEventListener('click', () => {
    invoke('open_tool', { name: button.dataset.tool }).catch(failure);
  })
);

const qualitySelect = document.getElementById('ruffle-quality');
const graphicsSelect = document.getElementById('ruffle-graphics');
let savedRuffleSettings = null;
function fillSelect(element, choices, current) {
  element.replaceChildren();
  for (const entry of choices) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.label;
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

loadModel();
