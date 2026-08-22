const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('characterBLab', {
    getDefaults: () => ipcRenderer.invoke('charpage-studio-defaults'),
    loadCharacter: (name) => ipcRenderer.invoke('charpage-studio-load-character', name)
});
