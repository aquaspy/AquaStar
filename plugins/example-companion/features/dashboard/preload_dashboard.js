// Sandboxed preloads (Electron 11) can require('electron') but must not require
// arbitrary project files — that fails silently and leaves window.aquastarPlugin unset.
const { contextBridge, ipcRenderer } = require('electron');

const CH = function (name) {
    return 'plugin:example-companion:' + name;
};

contextBridge.exposeInMainWorld('aquastarPlugin', {
    pluginId: 'example-companion',
    getState: function () {
        return ipcRenderer.invoke(CH('getDashboardState'));
    },
    bumpVisit: function () {
        return ipcRenderer.invoke(CH('bumpDashboardVisit'));
    },
    saveNote: function (note) {
        return ipcRenderer.invoke(CH('saveDashboardNote'), note);
    },
    fetchRepoMeta: function () {
        return ipcRenderer.invoke(CH('fetchGithubRepoMeta'));
    },
    getMessages: function () {
        return ipcRenderer.invoke(CH('getDashboardMessages'));
    }
});
