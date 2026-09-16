// Adventure Quest Worlds — bundled plugin adapter (PR 2).
// Owns side-effect requires for feature/wiki/studio IPC so main.js registers
// each legacy channel exactly once when pluginSystem is enabled.
// Later PRs move session rules, URLs, menus, and feature files into this tree.

const path = require('path');

const resRoot = path.join(__dirname, '..', '..', 'res');

const LEGACY_FEATURE_MODULES = [
    path.join(resRoot, 'features', 'reminders', 'reminders.js'),
    path.join(resRoot, 'features', 'todo', 'todo.js'),
    path.join(resRoot, 'features', 'inventory', 'inventory.js'),
    path.join(resRoot, 'features', 'strategy', 'strategy.js'),
    path.join(resRoot, 'features', 'charpage', 'studio.js'),
    path.join(resRoot, 'ipc', 'wikiFetch.js')
];

function requireLegacyFeatures() {
    LEGACY_FEATURE_MODULES.forEach(function (modPath) {
        require(modPath);
    });
}

function activate(host) {
    // @migration-legacy — physical move lands in PR 8; keep IPC channel names stable.
    requireLegacyFeatures();

    const constant = require(path.join(resRoot, 'const.js'));

    host.setPrimaryGame({
        id: 'aqw-main',
        getUrl: function () { return constant.mainPath; },
        title: function (ctx) {
            const displayName = (ctx && ctx.displayName) || 'AquaStar';
            return displayName + ' - ' +
                (constant.isOldAqlite ? 'Older/Custom AQLite' : ' Adventure Quest Worlds');
        },
        isGameUrl: function (url) {
            if (typeof url !== 'string') return false;
            if (url === constant.mainPath) return true;
            return url.indexOf('https://game.aq.com/game/gamefiles/Loader_Spider.swf') === 0;
        },
        wrap: { preferDirectWmode: true, ruffleEligible: true },
        flashTrust: true
    });

    host.registerLaunches([
        {
            id: 'aqw-testing',
            keybindId: 'newTest',
            getUrl: function () { return constant.testingAQW; },
            title: function () { return 'AquaStar - AQW Testing Version!'; },
            wrap: { preferDirectWmode: true, ruffleEligible: true },
            flashTrust: true
        },
        {
            id: 'dragonfable',
            keybindId: 'dragon',
            getUrl: function () { return constant.df_url; },
            title: function () { return 'AquaStar - DragonFable'; },
            wrap: { wmode: 'opaque', scale: 'showall', ruffleEligible: true },
            flashTrust: true
        }
    ]);

    host.log('Adventure Quest Worlds plugin activated (adapter mode)');
}

module.exports = {
    activate: activate,
    LEGACY_FEATURE_MODULES: LEGACY_FEATURE_MODULES
};
