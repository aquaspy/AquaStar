// Minimal AquaStar plugin entry. See docs/design/plugin-architecture.md and
// docs/PLUGINS.md (authored in a later PR) for the full Host API.

function activate(host) {
    host.setPrimaryGame({
        id: 'my-game-main',
        getUrl: function () {
            return 'https://example.com/path/to/game.swf';
        },
        title: function () {
            return 'AquaStar - My Flash Game';
        },
        isGameUrl: function (url) {
            return typeof url === 'string' &&
                url.indexOf('https://example.com/path/to/game.swf') === 0;
        },
        wrap: { preferDirectWmode: true, ruffleEligible: false },
        flashTrust: true
    });

    host.trustFlashUrls(['https://example.com/path/to/game.swf']);

    host.registerKeybindDefaults({ newGame: 'Alt+N' });
    host.registerKeybinds([{
        id: 'newGame',
        action: function () {
            host.windows.openPrimaryGame();
        }
    }]);

    host.registerMenus(function (ctx) {
        return [{
            label: 'My Game',
            submenu: [{
                label: 'New Game Window',
                click: function () { ctx.actions.newGame(); }
            }]
        }];
    });
}

module.exports = {
    activate: activate
};
