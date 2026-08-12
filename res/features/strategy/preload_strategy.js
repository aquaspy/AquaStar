const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aquastarStrategy', {
  get: () => ipcRenderer.invoke('getStrategy'),
  messages: () => ipcRenderer.invoke('getStrategyMessages'),
  save: (data) => ipcRenderer.invoke('saveStrategy', data)
});
