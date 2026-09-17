// Active-plugin runtime facade. Adopts Host state after activate() and wires
// window helpers so plugins need not require res/instances.js directly.

const path = require('path');

let host = null;
let hostState = null;
let pluginInfo = null;
let pluginRoot = '';
let instancesApi = null;
let constantApi = null;
let BrowserWindowApi = null;

function clear() {
    host = null;
    hostState = null;
    pluginInfo = null;
    pluginRoot = '';
}

function setDependencies(deps) {
    deps = deps || {};
    if (deps.instances) instancesApi = deps.instances;
    if (deps.constant) constantApi = deps.constant;
    if (deps.BrowserWindow) BrowserWindowApi = deps.BrowserWindow;
}

function adopt(activeHost, info) {
    host = activeHost || null;
    hostState = activeHost && typeof activeHost._getState === 'function'
        ? activeHost._getState()
        : null;
    pluginInfo = info || null;
    pluginRoot = (activeHost && activeHost.pluginRoot) || '';
}

function getPluginInfo() {
    return pluginInfo;
}

function getHost() {
    return host;
}

function getState() {
    return hostState;
}

function getPrimaryGame() {
    return hostState && hostState.primaryGame ? hostState.primaryGame : null;
}

function getLaunch(launchId) {
    if (!hostState || !Array.isArray(hostState.launches)) return null;
    for (let i = 0; i < hostState.launches.length; i++) {
        if (hostState.launches[i] && hostState.launches[i].id === launchId) {
            return hostState.launches[i];
        }
    }
    return null;
}

function listLaunches() {
    return (hostState && hostState.launches) ? hostState.launches.slice() : [];
}

/**
 * Resolve the URL for the main/boot game window.
 * Platform overrides (local SWF / customUrl) win over the plugin primary.
 */
function getPrimaryUrl() {
    const constant = constantApi || require('../const.js');
    if (constant.isOldAqlite && constant.mainPath) return constant.mainPath;

    let customUrl = '';
    try {
        const keyb = require('../keybindings.js');
        if (keyb.keybinds && keyb.keybinds.customUrl) customUrl = keyb.keybinds.customUrl;
    } catch (e) { /* keybinds may not be ready */ }
    if (customUrl) return customUrl;

    const primary = getPrimaryGame();
    if (primary && typeof primary.getUrl === 'function') return primary.getUrl();
    return constant.mainPath;
}

function isGameUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    const constant = constantApi || require('../const.js');
    if (url === constant.mainPath) return true;
    if (constant.isOldAqlite && constant.activeCustomSwfPath &&
        url.indexOf(path.basename(constant.activeCustomSwfPath)) !== -1) {
        return true;
    }
    const primary = getPrimaryGame();
    if (primary && typeof primary.isGameUrl === 'function' && primary.isGameUrl(url)) {
        return true;
    }
    const launches = listLaunches();
    for (let i = 0; i < launches.length; i++) {
        const entry = launches[i];
        if (!entry || typeof entry.getUrl !== 'function') continue;
        try {
            const launchUrl = entry.getUrl();
            if (url === launchUrl) return true;
            // Prefix match for cache-busted testing URLs
            if (launchUrl && url.indexOf(launchUrl.split('?')[0]) === 0) return true;
        } catch (e) { /* ignore */ }
        if (entry.isGameUrl && typeof entry.isGameUrl === 'function' && entry.isGameUrl(url)) {
            return true;
        }
    }
    return false;
}

function getKeybindDefaults() {
    return (hostState && hostState.keybindDefaults)
        ? Object.assign({}, hostState.keybindDefaults)
        : {};
}

function getKeybindAction(id) {
    if (!hostState || !Array.isArray(hostState.keybinds)) return null;
    for (let i = 0; i < hostState.keybinds.length; i++) {
        const binding = hostState.keybinds[i];
        if (binding && binding.id === id && typeof binding.action === 'function') {
            return binding.action;
        }
    }
    return null;
}

function listKeybindBindings() {
    return (hostState && hostState.keybinds) ? hostState.keybinds.slice() : [];
}

function getFeatureWindow(id) {
    if (!hostState || !Array.isArray(hostState.featureWindows)) return null;
    for (let i = 0; i < hostState.featureWindows.length; i++) {
        if (hostState.featureWindows[i] && hostState.featureWindows[i].id === id) {
            return hostState.featureWindows[i];
        }
    }
    return null;
}

function listFeatureWindows() {
    return (hostState && hostState.featureWindows)
        ? hostState.featureWindows.slice()
        : [];
}

function getTrustedFlashUrls() {
    const urls = [];
    const seen = {};
    function add(u) {
        if (!u || seen[u]) return;
        seen[u] = true;
        urls.push(u);
    }
    if (hostState && Array.isArray(hostState.trustedFlashUrls)) {
        hostState.trustedFlashUrls.forEach(add);
    }
    try {
        add(getPrimaryUrl());
    } catch (e) { /* ignore */ }
    listLaunches().forEach(function (entry) {
        if (entry && entry.flashTrust && typeof entry.getUrl === 'function') {
            try { add(entry.getUrl()); } catch (e) { /* ignore */ }
        }
    });
    return urls;
}

function openPrimaryGame(opts) {
    const instances = instancesApi || require('../instances.js');
    const url = getPrimaryUrl();
    return instances.newBrowserWindow(url, !!(opts && opts.isMainWin));
}

function openLaunch(launchId) {
    const entry = getLaunch(launchId);
    if (!entry || typeof entry.getUrl !== 'function') {
        throw new Error('[AquaStar:plugins] Unknown launch id: ' + launchId);
    }
    const instances = instancesApi || require('../instances.js');
    return instances.newBrowserWindow(entry.getUrl());
}

function openUrl(url, mode) {
    mode = mode || 'new-window';
    const instances = instancesApi || require('../instances.js');
    if (mode === 'in-place') {
        const BW = BrowserWindowApi || require('electron').BrowserWindow;
        const focused = BW.getFocusedWindow();
        if (focused && !focused.isDestroyed()) {
            focused.loadURL(url);
            return focused;
        }
    }
    return instances.newBrowserWindow(url);
}

function openFeatureWindow(featureId) {
    const instances = instancesApi || require('../instances.js');
    if (typeof instances.openFeatureWindow === 'function') {
        return instances.openFeatureWindow(featureId);
    }
    throw new Error('[AquaStar:plugins] openFeatureWindow not available');
}

function createHostWindowDeps() {
    return {
        openPrimaryGame: openPrimaryGame,
        openLaunch: openLaunch,
        openUrl: openUrl,
        openFeatureWindow: openFeatureWindow
    };
}

module.exports = {
    clear: clear,
    setDependencies: setDependencies,
    adopt: adopt,
    getPluginInfo: getPluginInfo,
    getHost: getHost,
    getState: getState,
    getPrimaryGame: getPrimaryGame,
    getPrimaryUrl: getPrimaryUrl,
    getLaunch: getLaunch,
    listLaunches: listLaunches,
    isGameUrl: isGameUrl,
    getKeybindDefaults: getKeybindDefaults,
    getKeybindAction: getKeybindAction,
    listKeybindBindings: listKeybindBindings,
    getFeatureWindow: getFeatureWindow,
    listFeatureWindows: listFeatureWindows,
    getTrustedFlashUrls: getTrustedFlashUrls,
    openPrimaryGame: openPrimaryGame,
    openLaunch: openLaunch,
    openUrl: openUrl,
    openFeatureWindow: openFeatureWindow,
    createHostWindowDeps: createHostWindowDeps
};
