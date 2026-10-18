(() => {
  const api = window.aquastar;
  const note = document.getElementById('note');
  const status = document.getElementById('status');
  async function run(action) {
    try {
      await action();
    } catch (error) {
      status.textContent = String(error);
    }
  }
  document.getElementById('save').addEventListener('click', () =>
    run(async () => {
      await api.storage.set('note', note.value);
      status.textContent = 'Note saved.';
    })
  );
  document.getElementById('clear').addEventListener('click', () =>
    run(async () => {
      await api.storage.remove('note');
      note.value = '';
      status.textContent = 'Note deleted.';
    })
  );
  document.getElementById('network').addEventListener('click', () =>
    run(async () => {
      const response = await api.net.fetch({ url: 'https://api.github.com/repos/aquaspy/AquaStar' });
      if (response.status !== 200) throw new Error('GitHub returned HTTP ' + response.status);
      const project = JSON.parse(response.body);
      status.textContent = 'Project: ' + project.full_name;
    })
  );
  document.getElementById('project').addEventListener('click', () => run(() => api.actions.run('open-project')));
  run(async () => {
    note.value = (await api.storage.get('note')) || '';
    const host = await api.host.info();
    document.getElementById('host').textContent = 'AquaStar ' + host.version;
  });
})();
