(function () {
  const storage = window.AquaStarWebStorage.create(window.localStorage);
  const status = document.getElementById('status');

  function setStatus(message, error) {
    status.textContent = message;
    status.classList.toggle('error', !!error);
  }

  function switchView(name) {
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.classList.toggle('hidden', panel.dataset.panel !== name);
    });
    document.querySelectorAll('[data-view]').forEach(function (button) {
      button.classList.toggle('active', button.dataset.view === name);
    });
    history.replaceState(null, '', '#' + name);
  }

  function downloadBackup() {
    const blob = new Blob([storage.exportBackup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aquastar-tools-backup.json';
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Backup exportado.');
  }

  document.querySelectorAll('[data-view]').forEach(function (button) {
    button.addEventListener('click', function () { switchView(button.dataset.view); });
  });
  document.getElementById('export').addEventListener('click', downloadBackup);
  document.getElementById('import-button').addEventListener('click', function () { document.getElementById('import').click(); });
  document.getElementById('import').addEventListener('change', function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        storage.importBackup(String(reader.result || ''));
        setStatus('Backup importado com sucesso.');
      } catch (error) {
        setStatus(error.message, true);
      }
    };
    reader.onerror = function () { setStatus('Não foi possível ler o arquivo.', true); };
    reader.readAsText(file);
    event.target.value = '';
  });

  const initial = location.hash.slice(1);
  switchView(['reminders', 'todo', 'strategy'].indexOf(initial) !== -1 ? initial : 'home');
})();
