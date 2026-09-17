const urls = require('./urls.js');
const navigation = require('./injections/navigation.js');

const DEFAULTS = {
    newStage: 'Alt+N',
    openGithub: 'Alt+G',
    openReleases: 'Alt+R',
    openPluginsDocs: 'Alt+D',
    openDashboard: 'Alt+E',
    openInjectDemo: 'Alt+I'
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
            openMode: 'external',
            action: function () { host.windows.openExternal(urls.URLS.githubRepo); }
        },
        {
            id: 'openReleases',
            openMode: 'external',
            action: function () { host.windows.openExternal(urls.URLS.githubReleases); }
        },
        {
            id: 'openPluginsDocs',
            openMode: 'external',
            action: function () { host.windows.openExternal(urls.URLS.pluginsDocs); }
        },
        {
            id: 'openDashboard',
            action: function () { host.windows.openFeatureWindow('example-dashboard'); }
        },
        {
            id: 'openInjectDemo',
            openMode: 'new-window',
            action: function () {
                host.windows.openUrl(navigation.demoPageUrl(), 'new-window');
            }
        }
    ]);
}

module.exports = {
    register: register,
    DEFAULTS: DEFAULTS
};
