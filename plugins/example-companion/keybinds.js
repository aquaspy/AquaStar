const urls = require('./urls.js');

const DEFAULTS = {
    newStage: 'Alt+N',
    openGithub: 'Alt+G',
    openReleases: 'Alt+R',
    openPluginsDocs: 'Alt+D',
    openDashboard: 'Alt+E'
};

function register(host) {
    host.registerKeybindDefaults(DEFAULTS);
    host.registerKeybinds([
        {
            id: 'newStage',
            openMode: 'new-window',
            action: function () { host.windows.openPrimaryGame(); }
        },
        {
            id: 'openGithub',
            openMode: 'new-window',
            action: function () { host.windows.openUrl(urls.URLS.githubRepo, 'new-window'); }
        },
        {
            id: 'openReleases',
            openMode: 'new-window',
            action: function () { host.windows.openUrl(urls.URLS.githubReleases, 'new-window'); }
        },
        {
            id: 'openPluginsDocs',
            openMode: 'new-window',
            action: function () { host.windows.openUrl(urls.URLS.pluginsDocs, 'new-window'); }
        },
        {
            id: 'openDashboard',
            action: function () { host.windows.openFeatureWindow('example-dashboard'); }
        }
    ]);
}

module.exports = {
    register: register,
    DEFAULTS: DEFAULTS
};
