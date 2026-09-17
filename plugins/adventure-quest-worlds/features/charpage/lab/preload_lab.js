const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('characterBLab', {
    getDefaults: () => ipcRenderer.invoke('charpage-studio-defaults'),
    getMessages: () => ipcRenderer.invoke('charpage-studio-messages'),
    loadCharacter: (name) => ipcRenderer.invoke('charpage-studio-load-character', name),
    getRendererConfig: (renderer, flashVars) => ipcRenderer.invoke('charpage-studio-renderer-config', renderer, flashVars),
    capturePreview: (renderer, flashVars) => ipcRenderer.invoke('charpage-studio-capture-preview', renderer, flashVars),
    captureGif: (renderer, flashVars, fps, colors) => ipcRenderer.invoke('charpage-studio-capture-gif', renderer, flashVars, fps, colors)
});
