const { invoke } = window.__TAURI__.core;
const name = document.body.dataset.tool;

invoke('tool_document', { name }).then((doc) => {
  document.title = doc.title;
  document.getElementById('title').textContent = doc.title;
  document.getElementById('path').textContent = doc.path;
  const rows = document.getElementById('rows');
  for (const row of doc.rows) {
    const line = document.createElement('div');
    line.className = 'row';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = row.label;
    const value = document.createElement('div');
    value.className = 'value';
    value.textContent = row.value;
    line.append(label, value);
    rows.append(line);
  }
}).catch((error) => {
  document.getElementById('title').textContent = String(error);
});
