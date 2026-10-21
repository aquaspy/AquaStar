(() => {
  const invoke = window.__TAURI__.core.invoke;
  const list = document.getElementById('extension-list');
  const review = document.getElementById('extension-review');
  const status = document.getElementById('extension-status');
  const install = document.getElementById('extension-install');
  const restart = document.getElementById('extension-restart');
  let busy = false;
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function message(text, error = false) {
    status.textContent = text;
    status.dataset.error = String(error);
  }
  function button(text, action, className) {
    const element = node('button', text, className);
    element.type = 'button';
    element.addEventListener('click', () => run(action));
    return element;
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    document.querySelectorAll('#extensions button').forEach((entry) => {
      entry.disabled = true;
    });
    try {
      await action();
    } catch (error) {
      message(String(error), true);
    } finally {
      busy = false;
      document.querySelectorAll('#extensions button').forEach((entry) => {
        entry.disabled = false;
      });
    }
  }

  const PERMISSIONS = {
    storage: ['Save its own data', 'Keeps settings for this plugin only, up to 1 MiB.'],
    network: ['Reach public HTTPS sites', 'Only the destinations listed below.'],
    launch: ['Open games in a player', 'Starts Ruffle or Flash Player with the games it declares.'],
    links: ['Open links in your browser', 'Opens the pages it declares in your default browser.']
  };
  function permissions(parent, manifest) {
    const requested = manifest.permissions || [];
    const heading = node('h3', 'Permissions');
    parent.appendChild(heading);
    if (!requested.length) {
      parent.appendChild(node('p', 'None. This plugin cannot save data, use the network or open links.', 'extension-muted'));
    } else {
      const items = node('ul', undefined, 'extension-permissions');
      for (const permission of requested) {
        const [label, hint] = PERMISSIONS[permission] || [permission, ''];
        const item = node('li');
        item.append(node('strong', label), node('span', hint, 'extension-muted'));
        items.appendChild(item);
      }
      parent.appendChild(items);
    }
    const origins = manifest.origins || [];
    if (origins.length) {
      const row = node('div', undefined, 'extension-origins');
      row.appendChild(node('span', 'Network destinations', 'extension-muted'));
      for (const origin of origins) row.appendChild(node('code', origin));
      parent.appendChild(row);
    }
  }
  function adds(manifest) {
    const parts = [
      [(manifest.games || []).length, 'game'],
      [(manifest.tools || []).length, 'tool'],
      [(manifest.links || []).length, 'link'],
      [(manifest.searches || []).length, 'search']
    ]
      .filter(([count]) => count)
      .map(([count, noun]) => `${count} ${noun}${count === 1 ? '' : noun === 'search' ? 'es' : 's'}`);
    return parts.length ? 'Adds ' + parts.join(', ') : 'Adds nothing to the launcher';
  }
  function header(manifest, badge) {
    const mark = node('span', (manifest.name || '?').charAt(0).toUpperCase(), 'extension-mark');
    mark.setAttribute('aria-hidden', 'true');
    const title = node('div', undefined, 'extension-title');
    title.append(node('h2', manifest.name), node('p', `${manifest.id || ''} · v${manifest.version}`, 'extension-muted'));
    const row = node('div', undefined, 'extension-head');
    row.append(mark, title);
    if (badge) row.appendChild(badge);
    return row;
  }
  function badge(text, tone) {
    const element = node('span', text, 'extension-badge');
    element.dataset.tone = tone;
    return element;
  }

  // The launcher reloads its model so the restart notice appears on every page.
  function changed() {
    document.dispatchEvent(new CustomEvent('aquastar:plugins-changed'));
  }
  async function refresh() {
    const data = await invoke('extensions_list');
    list.replaceChildren();
    restart.hidden = !data.restartRequired;
    if (data.safeMode) message('Safe mode: third-party plugins are disabled.');
    else if (data.restartRequired) message('Changes are saved. Restart AquaStar NEO to apply them.');
    else message('Plugins are up to date.');
    for (const error of data.errors || []) list.appendChild(node('p', String(error), 'extension-error'));
    if (!data.plugins.length)
      list.appendChild(node('p', 'No other plugins installed. Install a ZIP package to get started.', 'extension-muted'));
    for (const plugin of data.plugins) {
      const card = node('article', undefined, 'extension-card');
      const state = plugin.pending
        ? badge('Restart to apply', 'warn')
        : plugin.active
          ? badge('Active', 'ok')
          : badge('Disabled', 'off');
      card.appendChild(header(plugin, state));
      if (plugin.description) card.appendChild(node('p', plugin.description));
      card.appendChild(node('p', adds(plugin), 'extension-muted'));
      permissions(card, plugin);
      for (const error of plugin.errors || []) card.appendChild(node('p', String(error), 'extension-error'));
      const controls = node('div', undefined, 'extension-actions');
      controls.appendChild(
        button(plugin.enabled ? 'Disable' : 'Enable', async () => {
          await invoke('extensions_change', { id: plugin.id, enabled: !plugin.enabled });
          await refresh();
          changed();
        })
      );
      const remove = node('details', undefined, 'extension-remove');
      remove.appendChild(node('summary', 'Remove plugin…'));
      const label = node('label', undefined, 'extension-delete-data');
      const checkbox = node('input');
      checkbox.type = 'checkbox';
      label.append(checkbox, document.createTextNode(' Also delete saved plugin data'));
      remove.append(
        label,
        button(
          'Confirm removal',
          async () => {
            await invoke('extensions_change', { id: plugin.id, remove: true, deleteData: checkbox.checked });
            await refresh();
            changed();
          },
          'danger'
        )
      );
      controls.appendChild(remove);
      card.appendChild(controls);
      list.appendChild(card);
    }
  }
  install.addEventListener('click', () =>
    run(async () => {
      const result = await invoke('extensions_install', { approved: false });
      if (!result) return;
      review.replaceChildren();
      review.hidden = false;
      review.appendChild(node('p', 'Review installation', 'extension-eyebrow'));
      review.appendChild(header(result.manifest));
      if (result.manifest.description) review.appendChild(node('p', result.manifest.description));
      review.appendChild(node('p', adds(result.manifest), 'extension-muted'));
      permissions(review, {
        permissions: result.permissions || result.manifest.permissions,
        origins: result.origins || result.manifest.origins
      });
      review.appendChild(
        node('p', 'Only install packages from authors you trust. Tools run web code; games run in an external player.', 'extension-callout')
      );
      const actions = node('div', undefined, 'extension-actions');
      actions.append(
        button(
          'Approve and install',
          async () => {
            await invoke('extensions_install', { approved: true, reviewToken: result.reviewToken });
            review.hidden = true;
            await refresh();
            changed();
          },
          'primary'
        ),
        button('Cancel', () => {
          review.hidden = true;
          review.replaceChildren();
        })
      );
      review.appendChild(actions);
      review.querySelector('button').focus();
    })
  );
  document.getElementById('extension-refresh').addEventListener('click', () => run(refresh));
  restart.addEventListener('click', () => run(() => invoke('extensions_restart')));
  document
    .querySelectorAll('[data-panel="extensions"]')
    .forEach((entry) => entry.addEventListener('click', () => run(refresh)));
})();
