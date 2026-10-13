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

/** Resolve after ms (used to cap how long startup may wait for the live loader URL). */
function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/**
 * Follow the loader URL Artix publishes for its own launcher (launcher-config.js).
 * Cached value is applied synchronously. A missing/stale cache is worth a short wait so the
 * first window already opens the right loader; a fresh cache refreshes in the background.
 * Any failure keeps the built-in default.
 */
async function followLauncherLoader(host, urls) {
    const settings = (typeof host.getPlatformSettings === 'function' && host.getPlatformSettings()) || {};
    if (settings.liveLoaderUrl === false) return;
    // customUrl / a local SWF override the plugin's URL anyway: no need to ask Artix.
    if (settings.customUrl) return;

    const launcherConfig = require('./launcher-config.js').createLauncherConfig({
        fetchText: host.net.fetchText,
        store: host.getStore('launcher-config'),
        urls: urls,
        log: host.log
    });
    launcherConfig.applyCached();
    const fresh = launcherConfig.isCacheFresh();
    const refresh = launcherConfig.refresh().then(function (result) {
        if (!result.ok) host.log('live loader url not updated (' + result.error + ')');
    }).catch(function (err) {
        host.log('live loader url refresh failed: ' + (err && err.message ? err.message : err));
    });
    if (!fresh) await Promise.race([refresh, delay(2500)]);
}

async function activate(host) {
    // Feature modules live under this plugin; keep legacy IPC channel names stable.
    requireLegacyFeatures();

    const urls = require('./urls.js');
    const session = require('./session.js');

    await followLauncherLoader(host, urls);

    host.setPrimaryGame({
        id: 'aqw-main',
        // Platform overrides (customUrl / local SWF) are applied by the runtime on top of this.
        getUrl: function () { return urls.loaderUrl(); },
        title: function (ctx) {
            const displayName = (ctx && ctx.displayName) || 'AquaStar';
            return displayName + ' - ' +
                (ctx && ctx.usingCustomSwf ? 'Older/Custom AQLite' : ' Adventure Quest Worlds');
        },
        isGameUrl: function (url) {
            return urls.isLoaderUrl(url) || urls.isTestingAqwUrl(url);
        },
        wrap: { preferDirectWmode: true, ruffleEligible: true },
        flashTrust: true
    });

    host.registerLaunches([
        {
            id: 'aqw-testing',
            keybindId: 'newTest',
            getUrl: function () { return urls.testingAQW(); },
            title: function () { return 'AquaStar - AQW Testing Version!'; },
            wrap: { preferDirectWmode: true, ruffleEligible: true },
            flashTrust: true
        },
        {
            id: 'dragonfable',
            keybindId: 'dragon',
            getUrl: function () { return urls.URLS.dfLoader; },
            title: function () { return 'AquaStar - DragonFable'; },
            // Own game: not numbered, no AQW game bar, and always the opaque/showall embed
            // so the 750x550 stage letterboxes and its relative loads keep working.
            standalone: true,
            wrap: { wmode: 'opaque', scale: 'showall', ruffleEligible: true },
            flashTrust: true
        }
    ]);

    host.registerSessionRules(session.createSessionRules());
    host.trustFlashUrls(session.flashTrustUrlList(urls.loaderUrl()));

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

    host.registerOptionDefaults({
        playerCharacter: '',
        featurePlayerName: false,
        autoSync: false,
        liveLoaderUrl: true
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

    host.registerSettingsSection({
        id: 'aqw-game',
        titleKey: 'game',
        title: 'Game',
        order: 20,
        fields: [
            { key: 'liveLoaderUrl', type: 'boolean' }
        ]
    });

    // Settings stays platform-owned in res/windows/config.js. Studio is a
    // detached helper process (openCharPageStudioWindow), not a feature window.
    const windowConfig = require(path.join(resRoot, 'windows', 'config.js'));
    host.registerFeatureWindows([
        {
            id: 'reminders',
            title: windowConfig.featureWindows.reminders.title,
            url: windowConfig.remindersUrl,
            config: windowConfig.remindersConfig
        },
        {
            id: 'todo',
            title: windowConfig.featureWindows.todo.title,
            url: windowConfig.todoUrl,
            config: windowConfig.todoConfig
        },
        {
            id: 'inventory',
            title: windowConfig.featureWindows.inventory.title,
            url: windowConfig.inventoryUrl,
            config: windowConfig.inventoryConfig
        },
        {
            id: 'strategy',
            title: windowConfig.featureWindows.strategy.title,
            url: windowConfig.strategyUrl,
            config: windowConfig.strategyConfig
        }
    ]);

    host.log('Adventure Quest Worlds plugin activated (adapter mode)');
}

module.exports = {
    activate: activate,
    LEGACY_FEATURE_MODULES: LEGACY_FEATURE_MODULES
};
