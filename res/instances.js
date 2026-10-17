const constant               = require('./const.js');
const {chooseGamePresentation} = require('./game-presentation.js');
const windowConfig           = require('./windows/config.js');
const windowsMenu            = require('./windows/menu.js');
const keybinds               = require('./keybindings.js');
const socketProxy            = require('./socketProxy.js');
const createFeatureWindowController = require('./windows/feature-window-controller.js');
const {BrowserWindow, Menu}  = require('electron');

let usedAltPagesNumbers = [];

const fs       = require('fs');
const path     = require('path');
// Plugin navigation hooks (PR 5). When set, did-finish-load delegates to the plugin.
let navigationHooks = null;

// For notify Window's original names.
let winTimeRef = {};
let winNames   = {}; // Fake dictionary
let lastFocusedWindow = null;

// A navigation can replace the renderer between did-finish-load and Electron actually
// evaluating an injected script.  executeJavaScript then rejects; always consume that
// rejection so a transient page race never becomes a Node unhandled-rejection warning.
function _executeJavaScriptSafely(webContents, source, label) {
    try {
        return webContents.executeJavaScript(source).catch((error) => {
            if (!webContents.isDestroyed()) {
                console.log('[AquaStar] ' + label + ' skipped: ' + error.message);
            }
            return null;
        });
    } catch (error) {
        if (!webContents.isDestroyed()) {
            console.log('[AquaStar] ' + label + ' skipped: ' + error.message);
        }
        return Promise.resolve(null);
    }
}


// Collapse duplicate opens from menu+shortcut or dual app/window menus.
var _windowOpenGate = { key: '', at: 0 };
var WINDOW_OPEN_DEDUP_MS = 750;

function _normalizeWindowOpenKey(url) {
    var key = String(url || '');
    if (process.platform === 'win32') key = key.toLowerCase();
    return key;
}

// New page function
function newBrowserWindow(new_path, isMainWin=false){
    var config;
    var originalPath = new_path;
    var gateKey = _normalizeWindowOpenKey(originalPath);
    var now = Date.now();
    if (gateKey && gateKey === _windowOpenGate.key &&
        (now - _windowOpenGate.at) < WINDOW_OPEN_DEDUP_MS) {
        console.log('[AquaStar] Suppressed duplicate newBrowserWindow:', originalPath);
        var existing = BrowserWindow.getAllWindows();
        return existing.length ? existing[existing.length - 1] : null;
    }
    _windowOpenGate = { key: gateKey, at: now };

    if (isMainWin) config = windowConfig.mainConfig;
    else if (_isGameWindow(new_path)) config = windowConfig.gameConfig;
    else config = windowConfig.winConfig;
    
    // How a game is opened is the owning plugin's call (its primary/launch "wrap" config):
    // Ruffle when Settings → renderMode is "ruffle" and the SWF is eligible, an explicit
    // wmode/scale HTML embed, or the default embed. Direct wmode is the GPU path. With
    // it off, the embed uses wmode=opaque so the plugin still has a CSS box.
    var gameEntry = _findGameEntry(originalPath);
    var wrap = (gameEntry && gameEntry.wrap) || null;
    var renderMode = (keybinds.keybinds && keybinds.keybinds.renderMode) || constant.defaultRenderMode;
    var presentation = chooseGamePresentation({
        looksLikeSwf: _looksLikeSwfUrl(originalPath),
        wrap: wrap,
        standalone: !!(gameEntry && gameEntry.standalone),
        renderMode: renderMode,
        ruffleEligible: constant.isRuffleEligible(new_path),
        useDirectWmode: constant.useDirectWmode
    });
    if (presentation.kind === 'ruffle') {
        const ruffleOpts = (wrap && wrap.ruffle) || null;
        if (ruffleOpts && ruffleOpts.socket) {
            socketProxy.allowHosts(ruffleOpts.socket.allowedHosts);
            socketProxy.start();
        }
        new_path = constant.wrapRuffleUrl(new_path, ruffleOpts,
            keybinds.keybinds && keybinds.keybinds.ruffleQuality);
    } else if (presentation.kind === 'embed') {
        new_path = constant.wrapSwfUrl(new_path, {
            wmode: presentation.wmode,
            scale: presentation.scale
        });
        console.log('[AquaStar] flash embed wmode=' + (presentation.wmode || 'direct') +
            ' scale=' + (presentation.scale || 'showall'));
    }
    
    const newWin = new BrowserWindow(config);
    newWin.aquaStarSwfUrl = originalPath;
    newWin.setMenuBarVisibility(false); //Remove default electron menu
    newWin.on('focus', () => { lastFocusedWindow = newWin; });
    newWin.loadURL(new_path);

    // Debug mode opens DevTools on every window created through here (main, wiki,
    // design notes, account, game instances...). Windows a plugin builds directly with
    // `new BrowserWindow` never go through this function, so they are never affected.
    if (constant.isDebugBuild || constant.isDevToolsEnabled) {
        newWin.webContents.openDevTools();
    }

    // Non-standalone games (the primary and its sibling launches) are numbered and titled
    // by the plugin; standalone launches keep their own title.
    if (gameEntry && !gameEntry.standalone) {

        // Alt / primary game windows — number them and set a plugin-aware title.
        var windowNumber = 1;
        
        for (;usedAltPagesNumbers.includes(windowNumber);windowNumber++){
             if (windowNumber === 2000) {
                console.log("just how long is this opened!?!?");
                break;
            };
        }
        
        var winTitle = _titleForGameEntry(gameEntry, keybinds.keybinds);
        if (windowNumber > 1) winTitle += " (Window " + windowNumber + ")";
            
        newWin.setTitle(winTitle);

        usedAltPagesNumbers.push(windowNumber);
        newWin.on('closed', () => {
            usedAltPagesNumbers.splice(
                usedAltPagesNumbers.indexOf(windowNumber), 1);
        });
    }
    else {
        // Standalone launches use their own title; other pages get the normal menu bar.
        if (gameEntry && typeof gameEntry.title === 'function') {
            newWin.setTitle(_titleForGameEntry(gameEntry, keybinds.keybinds));
        } else {
            newWin.setMenuBarVisibility(true);
        }
    }

    applyWindowMenu(newWin, originalPath);
    
    _windowAddContext(newWin);
    
    return newWin;
}

/**
 * Assign the correct per-window menu (game vs browser). Must run after any
 * Menu.setApplicationMenu call — on Windows that can otherwise leave the first
 * window stuck on the minimal app menu without plugin entries.
 */
function applyWindowMenu(win, originalPath) {
    if (!win || win.isDestroyed() || process.platform === 'darwin') return;
    originalPath = originalPath || win.aquaStarSwfUrl || '';
    var entry = _findGameEntry(originalPath);
    var primary = _getPrimaryGame();
    var showGameMenu = (!keybinds.keybinds || keybinds.keybinds.showGameMenu !== false) &&
        !!entry && !entry.standalone && (entry === primary || _looksLikeSwfUrl(originalPath));
    var menuTemplate = showGameMenu
        ? windowsMenu.getGameMenu(keybinds.keybinds || {})
        : windowsMenu.getMenu(keybinds.keybinds || {}, takeSS, false);
    if (menuTemplate && menuTemplate.length) {
        win.setMenu(Menu.buildFromTemplate(menuTemplate));
        win.setMenuBarVisibility(true);
    } else {
        win.setMenu(null);
        win.setMenuBarVisibility(false);
    }
}

// Now, every window created with actions like CTRL + click, can have the right click menu too.
function _windowAddContext(newWin){
    // First, a security check. No more than 70 windows opened at once...
    if (BrowserWindow.getAllWindows().length > 70){
        console.log("This is very problematic... If you are seeing this in terminal, do a CTRL + C on it and cancel the program!");
        return;
    }
    
    if (constant.isDebugBuild) newWin.setTitle(newWin.getTitle() + " < Debug >");
    
    // Context Menu part
    var contextMenu = Menu.buildFromTemplate( 
        windowsMenu.getMenu(keybinds.keybinds,takeSS,true));
    newWin.webContents.on("context-menu",(e,param)=>{
        contextMenu.popup({
            window: newWin,
            x: param.x,
            y: param.y
        });
    })
    
    // "Child Windows follow the same rule" part
    const openChildWindow = (url) => {
        const childWin = new BrowserWindow(windowConfig.winConfig);
        childWin.loadURL(url);
        _windowAddContext(childWin);
        return childWin;
    };
    newWin.webContents.on('new-window', (event, url) => {
        event.preventDefault();
        event.newGuest = openChildWindow(url);
    });
    
    // Page-load injections (cleanup, previews, account sync…) belong to the active plugin:
    // the platform only forwards did-finish-load to its registered navigation hooks.
    newWin.webContents.on("did-finish-load", () => {
        var url = newWin.getURL();
        if (navigationHooks && typeof navigationHooks.onDidFinishLoad === 'function') {
            Promise.resolve(navigationHooks.onDidFinishLoad({
                win: newWin,
                url: url,
                isGameWindow: _isGameWindow(newWin),
                executeJavaScriptSafely: function (source, label) {
                    return _executeJavaScriptSafely(newWin.webContents, source, label);
                }
            })).catch(function (error) {
                console.log('[AquaStar] Navigation hook failed: ' +
                    (error && error.message ? error.message : error));
            });
            return;
        }
    });
}

function _resolveTargetWindow(onlyHtml = false, considerDF = false) {
    // PPAPI Flash steals renderer keyboard focus; fall back to last focused window.
    var target = BrowserWindow.getFocusedWindow() || lastFocusedWindow;
    if (target === null) return null;

    var isGame = _isGameWindow(target, considerDF);
    if (onlyHtml == !isGame) return target;
    return null;
}

/// GAME WINDOW ONLY
function executeOnFocused(funcForWindow, onlyHtml = false, considerDF = false){
    var target = _resolveTargetWindow(onlyHtml, considerDF);
    if (target !== null) funcForWindow(target);
}

function _looksLikeSwfUrl(url) {
    return typeof url === 'string' && /\.swf(\?|#|$)/i.test(url);
}

function _runtime() {
    try { return require('./platform').pluginRuntime; } catch (e) { return null; }
}

function _getPrimaryGame() {
    var runtime = _runtime();
    return runtime ? runtime.getPrimaryGame() : null;
}

/** The active plugin's primary/launch entry that owns this URL, or null. */
function _findGameEntry(url) {
    var runtime = _runtime();
    return runtime ? runtime.findGameEntry(url) : null;
}

// Window title for a game entry; the plugin owns the wording.
function _titleForGameEntry(entry, settings) {
    // Plugins build their own title from the app name and the saved settings.
    var displayName = constant.appName;
    if (entry && typeof entry.title === 'function') {
        try {
            return entry.title({
                displayName: displayName,
                settings: settings || {},
                usingCustomSwf: !!constant.hasCustomSwf
            }) || ('AquaStar - ' + displayName);
        } catch (e) {
            return 'AquaStar';
        }
    }
    return 'AquaStar - ' + displayName;
}

// considerDF: also count standalone launches (separate games with their own wrapper and
// menu rules) as game windows. Direct-wmode and game-menu callers pass false.
function _isGameWindow(target, considerDF = true){
    var url;
    // If passed a BrowserWindow, use the stored original SWF URL
    if (target && typeof target === 'object' && target.webContents) {
        url = target.aquaStarSwfUrl || target.webContents.getURL();
    } else {
        url = target;
    }
    if (typeof url !== 'string' || !url) return false;
    var entry = _findGameEntry(url);
    if (!entry) return false;
    if (!considerDF && entry.standalone) return false;
    return true;
}

function _writeScreenshot(focusedWin, pngBuffer, destroyWindow) {
    console.log("Screenshotting it...");
    var ssfolder = constant.sshotPath;
    if (!_mkdir(ssfolder)) return null;

    var today = new Date();
    var pre_name = "Screenshot-" +
        today.getFullYear() + "-" +
        (today.getMonth() + 1) + "-" +
        today.getDate() + "_";

    var extraNumberName = 1;
    for (;;extraNumberName++){
        if (fs.existsSync(path.join(ssfolder, pre_name + extraNumberName + ".png"))){
            if (extraNumberName === 10000) {
                console.log("10000 prints per day...? wow! Thats a lot!");
            }
            continue;
        }
        else break;
    }
    var sshotFileName = pre_name + extraNumberName + ".png";
    var savePath = path.join(ssfolder, sshotFileName);
    fs.writeFileSync(savePath, pngBuffer);
    console.log(constant.titleMessages.doneSavedAs + savePath);
    if (!destroyWindow){
        _notifyWindow(focusedWin, constant.titleMessages.doneSavedAs + savePath);
    }
    else {
        focusedWin.close();
    }
    return savePath;
}

function takeSS(focusedWin, rect = null, destroyWindow = false){
    if (!focusedWin) return null;
    if (rect == null) {
        rect = {
            x: 0,
            y: 0,
            width: focusedWin.getContentSize()[0],
            height: focusedWin.getContentSize()[1]
        };
    }
    return focusedWin.webContents.capturePage(rect)
        .then((sshot) => _writeScreenshot(focusedWin, sshot.toPNG(), destroyWindow))
        .catch((err) => {
            console.log("[AquaStar] Screenshot error:", err);
            return null;
        });
}

function getSavedTitle(targetWin) {
    if (!targetWin) return '';
    if (winNames[targetWin.id]) return winNames[targetWin.id];
    const title = targetWin.getTitle();
    const bang = title.indexOf('!');
    if (bang !== -1) return title.slice(bang + 1).trim();
    return title;
}

function _notifyWindow(targetWin, notif, resetAfter = true){
    if (!targetWin || notif == null || notif === undefined) return;

    if (winNames[targetWin.id] == null ||
        winNames[targetWin.id] == undefined) {
            winNames[targetWin.id] = targetWin.getTitle();
    }

    targetWin.setTitle(String(notif));

    if (resetAfter) {
        targetWin.once('close',() => {
            // Cancel the reset. avoid the error when there is no window anymore (closed)!
            clearTimeout(winTimeRef[targetWin.id]);
            targetWin = null; // default kinda deal
        });
        // Reset timer, as each SS needs to have a time to show
        clearTimeout(winTimeRef[targetWin.id]);
        winTimeRef[targetWin.id] = setTimeout(() => {
            targetWin.setTitle(winNames[targetWin.id]);
        },3200);
    }
}

const featureWindows = createFeatureWindowController(windowConfig.featureWindows, BrowserWindow);
function openFeatureWindow(featureId) {
    try {
        const runtime = require('./platform').pluginRuntime;
        const pluginDef = runtime.getFeatureWindow(featureId);
        if (pluginDef) {
            const host = typeof runtime.getHost === 'function' ? runtime.getHost() : null;
            const pluginRoot = (host && host.pluginRoot) || '';
            return featureWindows.open(featureId, pluginDef, pluginRoot);
        }
    } catch (e) { /* fall back to platform config map */ }
    return featureWindows.open(featureId);
}

function openSettingsWindow(){ return openFeatureWindow('settings'); }
function _mkdir (filepath){
    try {
        fs.mkdirSync(filepath, { recursive: true });
        return true;
    } catch (error) {
        console.log('[AquaStar] Could not create directory ' + filepath + ': ' + error.message);
        return false;
    }
}

exports.newBrowserWindow    = newBrowserWindow;
exports.openSettingsWindow  = openSettingsWindow;
exports.openFeatureWindow   = openFeatureWindow;
exports.applyWindowMenu     = applyWindowMenu;

exports.executeOnFocused    = executeOnFocused;
exports.takeSS              = takeSS;
exports.notifyWin           = _notifyWindow;
exports.executeJavaScriptSafely = _executeJavaScriptSafely;
exports.getSavedTitle       = getSavedTitle;
exports.mkdir               = _mkdir;
exports.setNavigationHooks  = function (hooks) { navigationHooks = hooks || null; };
exports.getNavigationHooks  = function () { return navigationHooks; };
