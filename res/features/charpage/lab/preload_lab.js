const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('characterBLab', {
    onDiagnostic: (listener) => ipcRenderer.on('charpage-studio-diagnostic', (event, message) => listener(message)),
    getDefaults: () => ipcRenderer.invoke('charpage-studio-defaults'),
    loadCharacter: (name) => ipcRenderer.invoke('charpage-studio-load-character', name),
    getRendererConfig: (renderer, flashVars) => ipcRenderer.invoke('charpage-studio-renderer-config', renderer, flashVars),
    capturePreview: (bounds) => ipcRenderer.invoke('charpage-studio-capture', bounds),
    openDevTools: () => ipcRenderer.invoke('charpage-studio-open-devtools'),
    getRuntimeStatus: () => ipcRenderer.invoke('charpage-studio-runtime-status')
});
