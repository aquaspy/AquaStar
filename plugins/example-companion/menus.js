const urls = require('./urls.js');

function labelOf(ctx, key, fallback) {
    const labels = (ctx && ctx.labels) || {};
    return labels[key] || fallback;
}

function describeAppUsefulPages(ctx) {
    ctx = ctx || {};
    const U = (ctx.urls && ctx.urls.URLS) ? ctx.urls.URLS : urls.URLS;
    const keybinds = ctx.keybinds || {};
    // GitHub must open externally: Electron 11 / Chromium 87 cannot run modern github.com.
    return [
        {
            id: 'ex-github',
            label: labelOf(ctx, 'exampleGithub', 'AquaStar on GitHub (system browser)'),
            url: U.githubRepo,
            keybindId: 'openGithub',
            accelerator: keybinds.openGithub,
            openMode: 'external',
            surface: 'app-menu'
        },
        {
            id: 'ex-releases',
            label: labelOf(ctx, 'exampleReleases', 'GitHub Releases (system browser)'),
            url: U.githubReleases,
            keybindId: 'openReleases',
            accelerator: keybinds.openReleases,
            openMode: 'external',
            surface: 'app-menu'
        },
        {
            id: 'ex-plugins-docs',
            label: labelOf(ctx, 'examplePluginsDocs', 'Plugin authoring guide (system browser)'),
            url: U.pluginsDocs,
            keybindId: 'openPluginsDocs',
            accelerator: keybinds.openPluginsDocs,
            openMode: 'external',
            surface: 'app-menu'
        },
        {
            id: 'ex-design-docs',
            label: labelOf(ctx, 'exampleDesignDocs', 'Plugin architecture design (system browser)'),
            url: U.designDocs,
            openMode: 'external',
            surface: 'app-menu'
        }
    ];
}

function describeGameMenuPages(ctx) {
    return describeAppUsefulPages(ctx).map(function (item) {
        return Object.assign({}, item, {
            openMode: 'external',
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
        ctx = ctx || {};
        const keybinds = ctx.keybinds || {};
        return [{
            label: labelOf(ctx, 'exampleMenu', 'Example'),
            submenu: [
                {
                    label: labelOf(ctx, 'exampleNewBoxMover', 'New BoxMover window'),
                    accelerator: keybinds.newStage,
                    registerAccelerator: false,
                    click: function () { host.windows.openPrimaryGame(); }
                },
                {
                    label: labelOf(ctx, 'exampleStaticRect', 'Open static rectangle.swf'),
                    registerAccelerator: false,
                    click: function () { host.windows.openLaunch('example-static-rect'); }
                },
                { type: 'separator' },
                {
                    label: labelOf(ctx, 'exampleDashboard', 'Demo dashboard'),
                    accelerator: keybinds.openDashboard,
                    registerAccelerator: false,
                    click: function () { host.windows.openFeatureWindow('example-dashboard'); }
                },
                {
                    label: labelOf(ctx, 'exampleInjectDemo', 'Injection demo page'),
                    accelerator: keybinds.openInjectDemo,
                    registerAccelerator: false,
                    click: function () {
                        const navigation = require('./injections/navigation.js');
                        host.windows.openUrl(navigation.demoPageUrl(), 'new-window');
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
