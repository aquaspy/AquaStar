const path = require('path');
const { exposePluginApi } = require(path.join(
    __dirname, '..', '..', '..', '..', 'res', 'platform', 'preload-bridge.js'
));

const api = exposePluginApi('example-companion');
// Convenience wrappers for the renderer
api.getState = function () { return api.ipc.invoke('getDashboardState'); };
api.bumpVisit = function () { return api.ipc.invoke('bumpDashboardVisit'); };
api.saveNote = function (note) { return api.ipc.invoke('saveDashboardNote', note); };
api.fetchRepoMeta = function () { return api.ipc.invoke('fetchGithubRepoMeta'); };
