const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('characterBLab', {
    onDiagnostic: (listener) => ipcRenderer.on('charpage-lab-diagnostic', (event, message) => listener(message)),
    stageSwf: (bytes) => ipcRenderer.invoke('charpage-lab-stage-swf', bytes)
});
