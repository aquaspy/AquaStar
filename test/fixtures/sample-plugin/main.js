function activate(host) {
    host.setPrimaryGame({
        id: 'sample-main',
        getUrl: function () { return 'https://example.com/game.swf'; },
        title: function () { return 'AquaStar - Sample SWF'; },
        isGameUrl: function (url) {
            return typeof url === 'string' &&
                url.indexOf('https://example.com/game.swf') === 0;
        },
        wrap: { preferDirectWmode: true, ruffleEligible: false },
        flashTrust: true
    });
    host.trustFlashUrls(['https://example.com/game.swf']);
    host.registerKeybindDefaults({ newGame: 'Alt+N' });
    host.registerKeybinds([{
        id: 'newGame',
        action: function () {
            host.windows.openPrimaryGame();
        }
    }]);
    host.registerMenus(function (ctx) {
        return [{
            label: 'Sample',
            submenu: [{
                label: 'New Game',
                click: function () { ctx.actions.newGame(); }
            }]
        }];
    });
    host.getStore('meta').write({ activated: true });
}

module.exports = { activate: activate };
