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
    path.join(pluginFeaturesRoot, 'wikiview', 'wikiFetch.js')
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
    const windowTitle = require('./window-title.js');
    const ruffle = require('./ruffle.js');

    await followLauncherLoader(host, urls);

    host.setPrimaryGame({
        id: 'aqw-main',
        // Platform overrides (customUrl / local SWF) are applied by the runtime on top of this.
        getUrl: function () { return urls.loaderUrl(); },
        title: function (ctx) {
            return windowTitle.primaryTitle(ctx);
        },
        isGameUrl: function (url) {
            return urls.isLoaderUrl(url);
        },
        wrap: { preferDirectWmode: true, ruffleEligible: true, ruffle: ruffle },
        flashTrust: true
    });

    host.registerLaunches([
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
    const navigationHooks = navigation.createNavigationHooks();
    host.registerNavigationHooks(navigationHooks);
    // WikiView enhancements live in the pages this plugin links to (wiki, char page, account).
    host.registerBrowserPreload('features/wikiview/preload_wikiview.js');

    // Windows owned by this plugin: feature windows + the hidden Char Page print window.
    const aqwWindows = require('./windows.js').createWindows({ iconPath: host.getAppIconPath() });
    host.registerFeatureWindows(aqwWindows.featureWindows);

    // Char Page screenshot (Alt+K) and Char Page Studio (its own Electron process).
    const instances = require(path.join(resRoot, 'instances.js'));
    const charPagePrint = require('./features/charpage/print.js').createCharPagePrint({
        BrowserWindow: require('electron').BrowserWindow,
        windowConfig: aqwWindows.charPrintConfig,
        classify: navigationHooks.classify,
        executeJavaScript: instances.executeJavaScriptSafely,
        notify: instances.notifyWin,
        takeScreenshot: instances.takeSS,
        getMessages: function () { return host.getLocaleStrings('charpageMessages'); }
    });

    const menus = require('./menus.js');
    const keybinds = require('./keybinds.js');
    menus.register(host);
    keybinds.register(host, {
        charPagePrint: charPagePrint,
        openStudio: function () {
            host.windows.spawnHelperProcess({ scriptRelativePath: 'processes/charpage-studio-process.js' });
        }
    });

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

    host.log('Adventure Quest Worlds plugin activated (adapter mode)');
}

module.exports = {
    activate: activate,
    LEGACY_FEATURE_MODULES: LEGACY_FEATURE_MODULES
};
