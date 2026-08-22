const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('characterBLab', {
    onDiagnostic: (listener) => ipcRenderer.on('charpage-lab-diagnostic', (event, message) => listener(message)),
    getDefaults: () => ipcRenderer.invoke('charpage-studio-defaults'),
    loadCharacter: (name) => ipcRenderer.invoke('charpage-studio-load-character', name),
    getRuntimeStatus: () => ipcRenderer.invoke('charpage-lab-runtime-status')
});
