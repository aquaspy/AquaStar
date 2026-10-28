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
 * Platform-level primary-game overrides, applied on top of whatever the active plugin
 * declares: a local SWF file (Settings → Custom SWF File) beats customUrl beats the plugin.
 */
function getCustomOverrides() {
    const constant = constantApi || require('../const.js');
    let customUrl = '';
    try {
        const keyb = require('../keybindings.js');
        if (keyb.keybinds && keyb.keybinds.customUrl) customUrl = keyb.keybinds.customUrl;
    } catch (e) { /* keybinds may not be ready */ }
    return {
        customSwfUrl: constant.customSwfUrl || '',
        customSwfBasename: constant.activeCustomSwfPath
            ? path.basename(constant.activeCustomSwfPath) : '',
        customUrl: customUrl
    };
}

/**
 * Resolve the URL for the main/boot game window.
 * Platform overrides (local SWF / customUrl) win over the plugin primary.
 */
function getPrimaryUrl() {
    const overrides = getCustomOverrides();
    if (overrides.customSwfUrl) return overrides.customSwfUrl;
    if (overrides.customUrl) return overrides.customUrl;

    const primary = getPrimaryGame();
    if (primary && typeof primary.getUrl === 'function') return primary.getUrl();
    return '';
}

function launchMatchesUrl(entry, url) {
    if (!entry || typeof entry.getUrl !== 'function') return false;
    try {
        const launchUrl = entry.getUrl();
        if (url === launchUrl) return true;
        // Prefix match for cache-busted URLs (e.g. a testing loader with a random ?ver=).
        if (launchUrl && url.indexOf(launchUrl.split('?')[0]) === 0) return true;
    } catch (e) { /* ignore */ }
    return typeof entry.isGameUrl === 'function' && !!entry.isGameUrl(url);
}

/**
 * The game entry (primary or launch) that owns a URL, or null. The platform uses it to
 * decide how to open the window (wrap config, standalone) without knowing any game.
 */
function findGameEntry(url) {
    if (typeof url !== 'string' || !url) return null;
    const primary = getPrimaryGame();
    const overrides = getCustomOverrides();
    if (primary) {
        if (overrides.customSwfUrl && url === overrides.customSwfUrl) return primary;
        if (overrides.customSwfBasename && url.indexOf(overrides.customSwfBasename) !== -1) return primary;
        if (overrides.customUrl && url === overrides.customUrl) return primary;
        if (typeof primary.isGameUrl === 'function' && primary.isGameUrl(url)) return primary;
        try {
            if (typeof primary.getUrl === 'function' && url === primary.getUrl()) return primary;
        } catch (e) { /* ignore */ }
    }
    const launches = listLaunches();
    for (let i = 0; i < launches.length; i++) {
        if (launchMatchesUrl(launches[i], url)) return launches[i];
    }
    return null;
}

function isGameUrl(url) {
    return findGameEntry(url) !== null;
}

/** Wrap config ({ wmode, scale, preferDirectWmode, ruffleEligible }) of the entry owning url. */
function getWrapForUrl(url) {
    const entry = findGameEntry(url);
    return (entry && entry.wrap) ? entry.wrap : null;
}

/**
 * Standalone launches are separate game windows with their own wrapper/menu rules
 * (LaunchEntry.standalone). They are skipped by considerDF=false style checks, e.g.
 * the game command bar and the default direct-wmode wrapper.
 */
function isStandaloneUrl(url) {
    const entry = findGameEntry(url);
    return !!(entry && entry.standalone === true);
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

/** Absolute path of the active plugin's browser-window preload, or null. */
function getBrowserPreload() {
    return (hostState && hostState.browserPreload) || null;
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

// Menu accelerators + electron-localshortcut can both fire for the same key
// (especially on browser/HTML windows). Collapse duplicate opens within a short window.
const recentActions = {};
const ACTION_DEDUP_MS = 450;

function shouldSkipDuplicate(kind, key) {
    const id = kind + '\0' + String(key || '');
    const now = Date.now();
    const prev = recentActions[id] || 0;
    if (now - prev < ACTION_DEDUP_MS) {
        console.log('[AquaStar:plugins] Ignoring duplicate ' + kind + ' for ' + key);
        return true;
    }
    recentActions[id] = now;
    return false;
}

function openPrimaryGame(opts) {
    const instances = instancesApi || require('../instances.js');
    const url = getPrimaryUrl();
    if (shouldSkipDuplicate('window', url)) {
        return null;
    }
    return instances.newBrowserWindow(url, !!(opts && opts.isMainWin));
}

function openLaunch(launchId) {
    const entry = getLaunch(launchId);
    if (!entry || typeof entry.getUrl !== 'function') {
        throw new Error('[AquaStar:plugins] Unknown launch id: ' + launchId);
    }
    const instances = instancesApi || require('../instances.js');
    const url = entry.getUrl();
    if (shouldSkipDuplicate('window', url)) {
        return null;
    }
    return instances.newBrowserWindow(url);
}

function openUrl(url, mode) {
    mode = mode || 'new-window';
    if (mode === 'external') {
        return openExternal(url);
    }
    const instances = instancesApi || require('../instances.js');
    if (mode === 'in-place') {
        const BW = BrowserWindowApi || require('electron').BrowserWindow;
        const focused = BW.getFocusedWindow();
        if (focused && !focused.isDestroyed()) {
            if (shouldSkipDuplicate('navigate', url)) return focused;
            focused.loadURL(url);
            return focused;
        }
    }
    if (shouldSkipDuplicate('window', url)) return null;
    return instances.newBrowserWindow(url);
}

function openExternal(url) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        throw new Error('[AquaStar:plugins] openExternal requires an http(s) URL');
    }
    if (shouldSkipDuplicate('external', url)) {
        return Promise.resolve(undefined);
    }
    const shell = require('electron').shell;
    return shell.openExternal(url);
}

function openFeatureWindow(featureId) {
    if (shouldSkipDuplicate('feature', featureId)) {
        return null;
    }
    const instances = instancesApi || require('../instances.js');
    if (typeof instances.openFeatureWindow === 'function') {
        return instances.openFeatureWindow(featureId);
    }
    throw new Error('[AquaStar:plugins] openFeatureWindow not available');
}

function fetchText(url, fetchOpts) {
    fetchOpts = fetchOpts || {};
    const maxBytes = fetchOpts.maxBytes || (2 * 1024 * 1024);
    const timeoutMs = fetchOpts.timeoutMs || 15000;
    return new Promise(function (resolve) {
        let net;
        try { net = require('electron').net; }
        catch (e) {
            resolve({ ok: false, error: 'electron net unavailable' });
            return;
        }
        const request = net.request({
            method: (fetchOpts.method || 'GET'),
            url: url
        });
        // GitHub API and many hosts require a UA; Electron net often sends none.
        const headers = Object.assign({
            'User-Agent': 'AquaStar/' + (require('../const.js').appVersion || '1.0') + ' (plugin-host)',
            'Accept': 'application/json, text/plain, */*'
        }, fetchOpts.headers || {});
        Object.keys(headers).forEach(function (key) {
            try { request.setHeader(key, headers[key]); } catch (e) { /* ignore */ }
        });
        let body = '';
        let bodyBytes = 0;
        let settled = false;
        const timeout = setTimeout(function () {
            try { request.abort(); } catch (e) { /* ignore */ }
            finish({ ok: false, error: 'timeout' });
        }, timeoutMs);
        function finish(result) {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve(result);
        }
        request.on('response', function (response) {
            if (response.statusCode < 200 || response.statusCode >= 300) {
                try { request.abort(); } catch (e) { /* ignore */ }
                finish({
                    ok: false,
                    error: 'http-' + response.statusCode,
                    statusCode: response.statusCode
                });
                return;
            }
            response.on('data', function (chunk) {
                bodyBytes += chunk.length;
                if (bodyBytes > maxBytes) {
                    try { request.abort(); } catch (e) { /* ignore */ }
                    finish({ ok: false, error: 'response-too-large' });
                    return;
                }
                body += chunk.toString();
            });
            response.on('end', function () { finish({ ok: true, html: body }); });
            response.on('error', function (err) {
                finish({ ok: false, error: err.message || String(err) });
            });
        });
        request.on('error', function (err) {
            finish({ ok: false, error: err.message || String(err) });
        });
        request.end();
    });
}

/** Spawn a helper Electron process running a bundled plugin script (see helper-process.js). */
function spawnHelperProcess(opts) {
    const spawn = require('child_process').spawn;
    const helper = require('./helper-process.js');
    const electron = require('electron');
    const args = helper.buildHelperArgs(opts.scriptPath, opts.args, {
        defaultApp: !!process.defaultApp,
        appPath: electron.app.getAppPath()
    });
    const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return child;
}

function createHostWindowDeps() {
    return {
        openPrimaryGame: openPrimaryGame,
        openLaunch: openLaunch,
        openUrl: openUrl,
        openFeatureWindow: openFeatureWindow,
        openExternal: openExternal,
        fetchText: fetchText,
        spawnHelperProcess: spawnHelperProcess
    };
}

function applyFlashTrust() {}

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
    findGameEntry: findGameEntry,
    getWrapForUrl: getWrapForUrl,
    isStandaloneUrl: isStandaloneUrl,
    getKeybindDefaults: getKeybindDefaults,
    getKeybindAction: getKeybindAction,
    listKeybindBindings: listKeybindBindings,
    getBrowserPreload: getBrowserPreload,
    getFeatureWindow: getFeatureWindow,
    listFeatureWindows: listFeatureWindows,
    getTrustedFlashUrls: getTrustedFlashUrls,
    openPrimaryGame: openPrimaryGame,
    openLaunch: openLaunch,
    openUrl: openUrl,
    openExternal: openExternal,
    openFeatureWindow: openFeatureWindow,
    createHostWindowDeps: createHostWindowDeps,
    applyFlashTrust: applyFlashTrust
};
