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
  function button(text, action) {
    const element = node('button', text);
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
  function permissions(parent, manifest) {
    const labels = {
      storage: 'Save its own plugin data',
      network: 'Request public HTTPS APIs',
      launch: 'Launch games in external players',
      links: 'Open links in your default browser'
    };
    const requested = (manifest.permissions || []).map((permission) => labels[permission] || permission);
    parent.appendChild(node('p', 'Permissions: ' + (requested.join('; ') || 'None')));
    if ((manifest.origins || []).length)
      parent.appendChild(node('p', 'Network destinations: ' + manifest.origins.join(', ')));
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
    else if (data.restartRequired) message('Changes are saved. Restart AquaStar to apply them.');
    else message('Plugins are up to date.');
    for (const error of data.errors || []) list.appendChild(node('p', String(error), 'extension-error'));
    if (!data.plugins.length)
      list.appendChild(node('p', 'No plugins installed. Install a ZIP package to get started.', 'description'));
    for (const plugin of data.plugins) {
      const card = node('article', undefined, 'extension-card');
      card.appendChild(node('h2', plugin.name));
      card.appendChild(node('p', `${plugin.id} · ${plugin.version}`));
      card.appendChild(
        node('p', plugin.pending ? 'Changes pending restart' : plugin.active ? 'Active' : 'Inactive', 'extension-state')
      );
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
      const remove = node('details');
      remove.appendChild(node('summary', 'Remove plugin…'));
      const label = node('label', undefined, 'extension-delete-data');
      const checkbox = node('input');
      checkbox.type = 'checkbox';
      label.append(checkbox, document.createTextNode(' Also delete saved plugin data'));
      remove.append(
        label,
        button('Confirm removal', async () => {
          await invoke('extensions_change', { id: plugin.id, remove: true, deleteData: checkbox.checked });
          await refresh();
          changed();
        })
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
      review.appendChild(node('h2', 'Review installation'));
      review.appendChild(node('p', `${result.manifest.name} · ${result.manifest.version}`));
      review.appendChild(
        node('p', 'Only install packages from authors you trust. Tools run web code; games run in an external player.')
      );
      permissions(review, {
        permissions: result.permissions || result.manifest.permissions,
        origins: result.origins || result.manifest.origins
      });
      review.appendChild(
        button('Approve and install', async () => {
          await invoke('extensions_install', { approved: true, reviewToken: result.reviewToken });
          review.hidden = true;
          await refresh();
          changed();
        })
      );
      review.appendChild(
        button('Cancel', () => {
          review.hidden = true;
          review.replaceChildren();
        })
      );
      review.querySelector('button').focus();
    })
  );
  document.getElementById('extension-refresh').addEventListener('click', () => run(refresh));
  restart.addEventListener('click', () => run(() => invoke('extensions_restart')));
  document
    .querySelectorAll('[data-panel="extensions"]')
    .forEach((entry) => entry.addEventListener('click', () => run(refresh)));
})();
