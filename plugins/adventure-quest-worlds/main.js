// Adventure Quest Worlds — bundled plugin adapter (PR 2).
// Owns side-effect requires for feature/wiki/studio IPC so main.js registers
// each legacy channel exactly once when pluginSystem is enabled.
// Later PRs move session rules, URLs, menus, and feature files into this tree.

const path = require('path');

const resRoot = path.join(__dirname, '..', '..', 'res');

const pluginFeaturesRoot = path.join(__dirname, 'features');

const LEGACY_FEATURE_MODULES = [
    path.join(pluginFeaturesRoot, 'reminders', 'reminders.js'),
    path.join(pluginFeaturesRoot, 'todo', 'todo.js'),
    path.join(pluginFeaturesRoot, 'inventory', 'inventory.js'),
    path.join(pluginFeaturesRoot, 'strategy', 'strategy.js'),
    path.join(pluginFeaturesRoot, 'charpage', 'studio.js'),
    path.join(resRoot, 'ipc', 'wikiFetch.js')
];

function requireLegacyFeatures() {
    LEGACY_FEATURE_MODULES.forEach(function (modPath) {
        require(modPath);
    });
}

function activate(host) {
    // Feature modules live under this plugin; keep legacy IPC channel names stable.
    requireLegacyFeatures();

    const constant = require(path.join(resRoot, 'const.js'));
    const urls = require('./urls.js');
    const session = require('./session.js');

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
            return urls.isTestingAqwUrl(url);
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

    host.registerSessionRules(session.createSessionRules());
    host.trustFlashUrls(session.flashTrustUrlList(constant.mainPath));

    const navigation = require('./injections/navigation.js');
    host.registerNavigationHooks(navigation.createNavigationHooks());

    const menus = require('./menus.js');
    const keybinds = require('./keybinds.js');
    menus.register(host);
    keybinds.register(host);

    host.registerLocales({
        'en-US': require('./locales/en-US.js'),
        'pt-BR': require('./locales/pt-BR.js')
    });

    host.registerSettingsSection({
        id: 'aqw-account',
        titleKey: 'account',
        title: 'Account & Inventory',
        order: 10,
        fields: [
            { key: 'playerCharacter', type: 'text', sanitize: 'alphanumeric' },
            { key: 'featurePlayerName', type: 'boolean' },
            { key: 'autoSync', type: 'boolean' }
        ]
    });

    host.log('Adventure Quest Worlds plugin activated (adapter mode)');
}

module.exports = {
    activate: activate,
    LEGACY_FEATURE_MODULES: LEGACY_FEATURE_MODULES
};
