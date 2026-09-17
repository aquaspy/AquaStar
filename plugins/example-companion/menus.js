const urls = require('./urls.js');

function describeAppUsefulPages(ctx) {
    ctx = ctx || {};
    const U = (ctx.urls && ctx.urls.URLS) ? ctx.urls.URLS : urls.URLS;
    const keybinds = ctx.keybinds || {};
    return [
        {
            id: 'ex-github',
            label: 'AquaStar on GitHub',
            url: U.githubRepo,
            keybindId: 'openGithub',
            accelerator: keybinds.openGithub,
            openMode: 'in-place',
            surface: 'app-menu'
        },
        {
            id: 'ex-releases',
            label: 'GitHub Releases',
            url: U.githubReleases,
            keybindId: 'openReleases',
            accelerator: keybinds.openReleases,
            openMode: 'in-place',
            surface: 'app-menu'
        },
        {
            id: 'ex-plugins-docs',
            label: 'Plugin authoring guide',
            url: U.pluginsDocs,
            keybindId: 'openPluginsDocs',
            accelerator: keybinds.openPluginsDocs,
            openMode: 'in-place',
            surface: 'app-menu'
        },
        {
            id: 'ex-design-docs',
            label: 'Plugin architecture design',
            url: U.designDocs,
            openMode: 'in-place',
            surface: 'app-menu'
        }
    ];
}

function describeGameMenuPages(ctx) {
    return describeAppUsefulPages(ctx).map(function (item) {
        return Object.assign({}, item, {
            openMode: 'new-window',
            surface: 'game-menu'
        });
    });
}

function register(host) {
    host.registerMenuPages({
        appUsefulPages: describeAppUsefulPages,
        gameMenuPages: describeGameMenuPages
    });
    host.registerMenus(function (ctx) {
        return [{
            label: 'Example',
            submenu: [
                {
                    label: 'New stage window',
                    click: function () {
                        if (ctx.actions && ctx.actions.newStage) ctx.actions.newStage();
                        else host.windows.openPrimaryGame();
                    }
                },
                {
                    label: 'Demo dashboard',
                    click: function () {
                        if (ctx.actions && ctx.actions.openDashboard) ctx.actions.openDashboard();
                        else host.windows.openFeatureWindow('example-dashboard');
                    }
                }
            ]
        }];
    });
}

module.exports = {
    register: register,
    describeAppUsefulPages: describeAppUsefulPages,
    describeGameMenuPages: describeGameMenuPages
};
