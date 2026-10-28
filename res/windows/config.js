// BrowserWindow configs + file:// URLs for every window AquaStar opens. Split out of
// const.js so window-shape concerns live in one place instead of mixed in with app-wide
// constants, keybind defaults, and IPC handlers.
const path     = require('path');
const constant = require('../const.js');

const appRoot   = constant.appRootPath;
const iconPath  = constant.iconPath;
const toFileUrl = constant.toFileUrl;

function _browserPreloadPath() {
    // The active plugin may bring its own preload for the pages it links to (e.g. a wiki
    // enhancer). Without one, browser windows get the neutral preload, so another plugin
    // never inherits page-side scripts that could interfere with github.com and the like.
    try {
        const pluginPreload = require('../platform').pluginRuntime.getBrowserPreload();
        if (pluginPreload) return pluginPreload;
    } catch (e) { /* runtime not ready */ }
    return path.join(appRoot, 'res', 'platform', 'preload_browser.js');
}

function _getWinConfig(type){
    const isGame = (type == "game" || type == "main");
    return {
        width: 960,
        height: 530,
        useContentSize: true,
        icon: iconPath,
        webPreferences: {
            nodeIntegration: false,
            sandbox: true,
            webviewTag: false,
            preload: isGame ?
                path.join(appRoot, 'res', 'features', 'capture', 'preload_capture.js') :
                _browserPreloadPath(),
            contextIsolation: true,
            backgroundThrottling: !isGame
        }
    };
}

// Lazy getters so browser preload follows the active plugin at window-open time.
Object.defineProperty(exports, 'winConfig', {
    enumerable: true,
    get: function () { return _getWinConfig('win'); }
});
Object.defineProperty(exports, 'mainConfig', {
    enumerable: true,
    get: function () { return _getWinConfig('main'); }
});
Object.defineProperty(exports, 'gameConfig', {
    enumerable: true,
    get: function () { return _getWinConfig('game'); }
});
exports.getWinConfig = _getWinConfig;

// Settings screen - own preload, needed for IPC (read/write aquastar.json) under contextIsolation.
exports.settingsConfig = {
    width: 640,
    height: 680,
    useContentSize: true,
    icon: iconPath,
    resizable: true,
    webPreferences: {
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        preload: path.join(appRoot, 'res', 'features', 'settings', 'preload_settings.js'),
        contextIsolation: true
    }
};
exports.settingsUrl = toFileUrl(path.join(appRoot, 'res', 'features', 'settings', 'settings.html'));

// Local feature windows all use the same singleton lifecycle.  Keeping their
// declarative metadata here prevents every caller from reimplementing it.
exports.featureWindows = {
    settings:  { config: exports.settingsConfig,  url: exports.settingsUrl,  title: 'AquaStar - Settings' }
};
