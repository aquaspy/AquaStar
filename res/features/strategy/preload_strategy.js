const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aquastarStrategy', {
  get: () => ipcRenderer.invoke('getStrategy'),
  messages: () => ipcRenderer.invoke('getStrategyMessages'),
  save: (data) => ipcRenderer.invoke('saveStrategy', data),
  getInventoryCounts: (names) => ipcRenderer.invoke('getInventoryItemCounts', names),
  setTimerShortcut: (key) => ipcRenderer.invoke('setStrategyTimerShortcut', key),
  clearTimerShortcut: () => ipcRenderer.send('clearStrategyTimerShortcut'),
  onTimerToggle: (callback) => ipcRenderer.on('strategyTimerToggle', callback)
});

// The Strategy page lists the curated consumables alongside boss cards. Keep this in the
// preload so it can call the inventory IPC directly without broadening the renderer bridge.
window.addEventListener('DOMContentLoaded', () => {
  const host = document.getElementById('bossView');
  if (!host) return;
  const section = document.createElement('section');
  section.style.cssText = 'margin-top:18px';
  const title = document.createElement('h2');
  title.textContent = 'Consumables';
  title.style.cssText = 'font-size:12px;color:#aaa;text-transform:uppercase;letter-spacing:.06em';
  const list = document.createElement('div');
  list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:7px';
  section.appendChild(title);
  section.appendChild(list);
  host.appendChild(section);

  ipcRenderer.invoke('getStrategy').then((result) => {
    const potions = result.data.potions || [];
    return ipcRenderer.invoke('getInventoryItemCounts', potions.map((potion) => potion.name))
      .then((counts) => ({ potions: potions, counts: counts }));
  }).then(({ potions, counts }) => {
    potions.forEach((potion) => {
      const count = counts[potion.name] || { characters: [] };
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;background:#181818;border:1px solid #2d2d2d;border-radius:4px;padding:8px';
      const name = document.createElement('strong');
      name.textContent = potion.name;
      name.style.cssText = 'flex:1;font-size:12px';
      const amount = document.createElement('span');
      amount.style.cssText = 'color:#9cc9ff;font-family:Consolas,monospace;font-size:11px;text-align:right;white-space:pre-line';
      amount.textContent = count.characters.map((character) => {
        return character.name + ': I ' + character.inventory + ' · B ' + character.bank;
      }).join('\n') || 'No synced characters';
      row.appendChild(name);
      row.appendChild(amount);
      list.appendChild(row);
    });
  }).catch(() => {});
});
