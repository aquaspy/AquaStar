const path = require('path');
const bridge = require(path.join(
    __dirname, '..', '..', '..', '..', 'res', 'platform', 'preload-bridge.js'
));

const ipc = bridge.createInvoker('example-companion');
// Everything must be passed into exposeInMainWorld up front (no post-mutate).
bridge.exposePluginApi('example-companion', {
    getState: function () { return ipc.invoke('getDashboardState'); },
    bumpVisit: function () { return ipc.invoke('bumpDashboardVisit'); },
    saveNote: function (note) { return ipc.invoke('saveDashboardNote', note); },
    fetchRepoMeta: function () { return ipc.invoke('fetchGithubRepoMeta'); },
    getMessages: function () { return ipc.invoke('getDashboardMessages'); }
});
