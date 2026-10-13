const inst          = require('./instances.js');
const constant      = require('./const.js');
const windowsMenu   = require('./windows/menu.js');
const ipcRecording  = require('./ipc/recording.js');
const locale        = require('./locale.js');
const platform      = require('./platform');
const fs            = require('fs');
const path          = require('path');
const { globalShortcut, BrowserWindow, ipcMain, app, dialog } = require('electron');
const electronLocalshortcut = require('electron-localshortcut');
const ruffleUpdate    = require('./ruffleUpdate.js');

var finalKeybinds = {};
var recordingWinId = 0;
// null = show every originalKeybinds row (legacy / filter unknown).
var visibleKeybindIds = null;
var activeDispatcher = null;

function setVisibleKeybindIds(ids) {
    if (!ids || !ids.length) {
        visibleKeybindIds = null;
        return;
    }
    const map = {};
    ids.forEach(function (id) { map[id] = true; });
    visibleKeybindIds = map;
}

const CACHE_STORAGES = [
    'appcache', 'shadercache', 'cachestorage', 'localstorage',
    'cookies', 'filesystem', 'indexdb', 'websql', 'serviceworkers'
];

function customKeybinds() {
    var list = constant.listValidKeybindLocations;
    const pluginDefaults = Object.assign(
        {},
        platform.pluginRuntime.getKeybindDefaults(),
        (platform.pluginRuntime.getState() &&
            platform.pluginRuntime.getState().optionDefaults) || {}
    );
    const platformDefaults = Object.assign(
        {},
        constant.originalKeybinds,
        constant.originalOptions
    );

    let topLevel = {};
    let pluginsBlock = {};
    if (list != null && list.length != 0) {
        list.forEach((jsonPath) => {
            try {
                var tempJson = JSON.parse(fs.readFileSync(jsonPath));
                if (tempJson && typeof tempJson === 'object') {
                    Object.assign(topLevel, tempJson);
                    if (tempJson.plugins && typeof tempJson.plugins === 'object') {
                        pluginsBlock = tempJson.plugins;
                    }
                }
            } catch (e) {
                const errorMsg = e.error + " " + e.message + "\n" +
                "Check out " + jsonPath;
                console.log(errorMsg);
                const { dialog } = require('electron')
                const dialog_options = {
                    buttons: ['Oh no...'],
                    title:   "Error",
                    message: e.message,
                    detail:  "Check out " + jsonPath + " for the mistake.\n"+
                    "The program might continue as normal, but the custom keybings wont work.\n\n" +
                    "Try checking out the KEYBINDING.MD file on github.\n" +
                    "Also try a JSON validation website/program if you are lost!\n"
                };
                dialog.showMessageBox(null,dialog_options);
            }
        });
    }

    const activeId = (topLevel.activePluginId) ||
        (platform.pluginRuntime.getPluginInfo() && platform.pluginRuntime.getPluginInfo().id) ||
        '';

    finalKeybinds = platform.settingsMerge.mergeLoadedSettings({
        activePluginId: activeId,
        platformDefaults: platformDefaults,
        pluginDefaults: pluginDefaults,
        topLevel: topLevel,
        plugins: pluginsBlock
    });
    return finalKeybinds;
}

function toggleRecording(focusedWin) {
    if (!focusedWin) return;
    if(!ipcRecording.wasRecording()){
        inst.notifyWin(focusedWin,
            constant.titleMessages.recording + "! " + focusedWin.getTitle(),
            false);
        recordingWinId = focusedWin.id;

        ipcRecording.triggerRecording(focusedWin);
        focusedWin.setIcon(constant.nativeImageRedIcon)
    }
    else {
        if (recordingWinId != focusedWin.id) {
            inst.notifyWin(focusedWin,
                constant.titleMessages.alreadyRecording);
            return;
        }
        const recordWin = BrowserWindow.fromId(recordingWinId) || focusedWin;
        inst.notifyWin(recordWin, inst.getSavedTitle(recordWin));
        ipcRecording.triggerRecording(recordWin);
        recordWin.setIcon(constant.nativeImageIcon)
    }
}

async function reloadIgnoringCache(focusedWin) {
    if (!focusedWin) return;
    const ses = focusedWin.webContents.session;
    try {
        await Promise.all([
            ses.clearCache(),
            ses.clearStorageData({ storages: CACHE_STORAGES })
        ]);
    } catch (err) {
        console.error('[AquaStar] Cache purge error:', err);
    }
    focusedWin.webContents.reloadIgnoringCache();
}

function toggleFullscreen(focusedWin) {
    if (!focusedWin) return;
    focusedWin.setFullScreen(!focusedWin.isFullScreen());
    if (process.platform != 'darwin') {
        focusedWin.setMenuBarVisibility(finalKeybinds.showGameMenu !== false && !focusedWin.isFullScreen());
    }
}

function buildPlatformActions() {
    return {
        settings: function () { inst.openSettingsWindow(); },
        fullscreen: toggleFullscreen,
        sshot: function (focusedWin) { inst.takeSS(focusedWin); },
        record: toggleRecording,
        reload: function (focusedWin) { if (focusedWin) focusedWin.reload(); },
        reloadCache: reloadIgnoringCache,
        help: function (focusedWin) { windowsMenu.showHelpMessage(focusedWin); },
        about: function (focusedWin) { windowsMenu.showAboutMessage(focusedWin); },
        forward: function (fw) {
            if (!fw) return;
            var br = fw.webContents;
            if (br.canGoForward()) br.goForward();
        },
        backward: function (fw) {
            if (!fw) return;
            var br = fw.webContents;
            if (br.canGoBack()) br.goBack();
        }
    };
}

const processKeybings = function (){

    // REMEMBER, ADD KEYBIDING FUNC ALREADY EXECUTE ON THE FOCUSED WINDOW!!!
    
    if(constant.isDebugBuild){
        // Debug-only shortcut. Alt+I is left free for plugins.
        addKeybind('Alt+Shift+I', (fw)=>{fw.webContents.openDevTools()},true);
    }
    
    const k = customKeybinds();
    
    /// Shhh... secreat stuff
    if (k.swfLog == true) constant.enableSWFLogging();
    // customUrl (and the local SWF override) are applied by the plugin runtime on top of the
    // active plugin primary game: see plugin-runtime getPrimaryUrl().
    if (k.useDirectWmode !== undefined) constant.setUseDirectWmode(k.useDirectWmode);
    if (k.enableDevTools == true) constant.enableDevTools();

    const pluginBindings = platform.pluginRuntime.listKeybindBindings();
    activeDispatcher = platform.keybindDispatcher
        ? platform.keybindDispatcher.createDispatcher({
            platformActions: buildPlatformActions(),
            pluginBindings: pluginBindings
        })
        : require('./platform/keybind-dispatcher.js').createDispatcher({
            platformActions: buildPlatformActions(),
            pluginBindings: pluginBindings
        });

    // Platform chrome (always).
    addKeybind(k.help, function (focusedWin) { activeDispatcher.run('help', focusedWin); });
    addKeybind(k.about, function (focusedWin) { activeDispatcher.run('about', focusedWin); });
    addKeybind(k.settings, function () { activeDispatcher.run('settings'); });
    addKeybind(k.fullscreen, function (focusedWin) { activeDispatcher.run('fullscreen', focusedWin); });
    addGlobalKeybind(k.sshot, function (focusedWin) { activeDispatcher.run('sshot', focusedWin); }, false, true);
    addGlobalKeybind(k.record, function (focusedWin) { activeDispatcher.run('record', focusedWin); });
    addKeybind(k.reload, function (focusedWin) { activeDispatcher.run('reload', focusedWin); });
    addGlobalKeybind(k.reloadCache, function (focusedWin) { activeDispatcher.run('reloadCache', focusedWin); }, false, true);

    if (process.platform == 'darwin') {
        addKeybind(k.backward, function (fw) { activeDispatcher.run('backward', fw); }, true);
        addKeybind(k.forward, function (fw) { activeDispatcher.run('forward', fw); }, true);
    }

    if (pluginBindings.length) {
        pluginBindings.forEach(function (binding) {
            if (!binding || !binding.id || typeof binding.action !== 'function') return;
            if (activeDispatcher.PLATFORM_RESERVED[binding.id]) return;
            const accel = k[binding.id];
            if (!accel) return;
            const id = binding.id;
            const onlyHtml = !!binding.onlyHtml;
            if (binding.global) {
                addGlobalKeybind(accel, function (fw) { activeDispatcher.run(id, fw); }, onlyHtml, !!binding.considerDF);
            } else {
                addKeybind(accel, function (fw) { activeDispatcher.run(id, fw); }, onlyHtml, !!binding.considerDF);
            }
        });
    }

    exports.keybinds = k;
    return k;
}

// Now, accepting Arrays as well...
const addKeybind = function(keybind, func, onlyHTML = false, considerDF = false){
    if(Array.isArray(keybind)){
        keybind.forEach((value) => {
            addKeybind(value, func, onlyHTML, considerDF);
        })
    }
    else {    
        electronLocalshortcut.register(keybind, () => {
            inst.executeOnFocused(func, onlyHTML, considerDF);
        })
    }
}

const addGlobalKeybind = function(keybind, func, onlyHTML = false, considerDF = false){
    const handler = () => inst.executeOnFocused(func, onlyHTML, considerDF);
    if (Array.isArray(keybind)) {
        keybind.forEach((value) => addGlobalKeybind(value, func, onlyHTML, considerDF));
        return;
    }
    if (!globalShortcut.register(keybind, handler)) {
        console.error('[AquaStar] Failed to register global shortcut:', keybind);
    }
};

exports.unregisterGlobalShortcuts = () => globalShortcut.unregisterAll();
exports.addKeybinding = processKeybings;
exports.setVisibleKeybindIds = setVisibleKeybindIds;

// Menu entries call this dispatcher instead of duplicating shortcut behavior.
// Keeping one implementation is particularly important for recording state and
// cache clearing, both of which have process-wide side effects.
exports.runGameMenuAction = function(action, focusedWin) {
    if (activeDispatcher) {
        const result = activeDispatcher.run(action, focusedWin);
        if (result !== undefined) return result;
    }
    // Fallbacks when dispatcher missing or action unknown (e.g. studio menu entry).
    switch (action) {
    case 'help': return windowsMenu.showHelpMessage(focusedWin);
    case 'about': return windowsMenu.showAboutMessage(focusedWin);
    case 'settings': return inst.openSettingsWindow();
    case 'fullscreen':
        return toggleFullscreen(focusedWin);
    case 'sshot': return inst.takeSS(focusedWin);
    case 'record': return toggleRecording(focusedWin);
    case 'reload': return focusedWin && focusedWin.reload();
    case 'reloadCache': return reloadIgnoringCache(focusedWin);
    }
};

/// -------------------------------
/// Settings screen IPC - reading/writing custom keybindings from aquastar.json
/// -------------------------------

// Whichever file is actually taking effect gets the write - inPathJsonPath wins the
// merge in customKeybinds() when both exist, so writing to appdata only would be a silent no-op.
function _keybindSaveTarget(){
    return constant.appdataJsonPath;
}

ipcMain.handle('getKeybindings', () => {
    const defaults = Object.assign(
        {},
        constant.originalKeybinds,
        platform.pluginRuntime.getKeybindDefaults()
    );
    let visibleIds = null;
    if (visibleKeybindIds) {
        visibleIds = Object.keys(defaults).filter(function (id) {
            return !!visibleKeybindIds[id];
        });
        // Include plugin-only ids that are visible but not in originalKeybinds.
        Object.keys(visibleKeybindIds).forEach(function (id) {
            if (visibleIds.indexOf(id) === -1 && defaults[id] != null) {
                visibleIds.push(id);
            }
        });
    }
    return {
        current:  Object.assign({}, finalKeybinds),
        defaults: defaults,
        // Platform option defaults plus the active plugin's, so Reset restores both.
        options:  Object.assign({}, constant.originalOptions,
            (platform.pluginRuntime.getState() && platform.pluginRuntime.getState().optionDefaults) || {}),
        recordingFormatChoices: constant.recordingFormatChoices,
        renderModeChoices: constant.renderModeChoices,
        ruffleUpdateChannelChoices: constant.ruffleUpdateChannelChoices,
        appLanguageChoices: constant.appLanguageChoices,
        visibleKeybindIds: visibleIds,
        savePath: _keybindSaveTarget()
    };
});

function _readPluginSettingsFromDisk() {
    const settings = platform.readSettingsObject([_keybindSaveTarget()]);
    const flags = platform.resolvePluginFlags(settings);
    return {
        activePluginId: flags.activePluginId,
        pluginSystem: flags.pluginSystem,
        enableLocalPlugins: flags.enableLocalPlugins,
        allowLocalPluginOverride: flags.allowLocalPluginOverride,
        trustedLocalPlugins: (settings && settings.trustedLocalPlugins) || {}
    };
}

ipcMain.handle('getPluginSettings', () => _readPluginSettingsFromDisk());

ipcMain.handle('getSettingsLayout', () => {
    const pluginSettings = _readPluginSettingsFromDisk();
    const layout = platform.settingsRegistry.buildSettingsLayout();
    return {
        plugin: layout.plugin,
        pluginSections: layout.pluginSections,
        pluginSettings: pluginSettings
    };
});

ipcMain.handle('getPluginList', (event, opts) => {
    const pluginSettings = _readPluginSettingsFromDisk();
    const enableLocalPlugins = opts && typeof opts.enableLocalPlugins === 'boolean'
        ? opts.enableLocalPlugins
        : pluginSettings.enableLocalPlugins;
    const allowLocalPluginOverride = opts && typeof opts.allowLocalPluginOverride === 'boolean'
        ? opts.allowLocalPluginOverride
        : pluginSettings.allowLocalPluginOverride;
    const trustedLocalPlugins = opts && opts.trustedLocalPlugins && typeof opts.trustedLocalPlugins === 'object'
        ? opts.trustedLocalPlugins
        : pluginSettings.trustedLocalPlugins;
    const discovered = platform.discoverPlugins({
        bundledDir: path.join(constant.appRootPath, 'plugins'),
        localDir: path.join(constant.appDataDirectory, 'plugins'),
        enableLocalPlugins: enableLocalPlugins,
        allowLocalPluginOverride: allowLocalPluginOverride,
        appVersion: constant.appVersion,
        log: function () {}
    });
    return {
        plugins: discovered.plugins.map(function (p) {
            return {
                id: p.manifest.id,
                name: p.manifest.name || p.manifest.id,
                version: p.manifest.version || '',
                source: p.source,
                trusted: platform.isLocalTrusted(p, {
                    trustedLocalPlugins: trustedLocalPlugins
                })
            };
        }),
        errors: discovered.errors || [],
        localPluginsDir: path.join(constant.appDataDirectory, 'plugins')
    };
});

// Game window preload (res/features/capture/preload_capture.js) asks this before starting MediaRecorder -
// it can't read aquastar.json itself (no Node access needed there beyond IPC).
ipcMain.handle('getRecordingFormat', (event, hasAudio) => {
    return constant.resolveRecordingFormat(finalKeybinds.recordingFormat, hasAudio);
});

ipcMain.handle('getSettingsMessages', () => {
    return locale.strings.settingsMessages;
});

ipcMain.handle('saveKeybindings', (event, updatedBinds) => {
    const target = _keybindSaveTarget();
    let existing = {};
    if (fs.existsSync(target)) {
        try { existing = JSON.parse(fs.readFileSync(target)); }
        catch (e) { existing = {}; }
    }
    const activeId = (updatedBinds && updatedBinds.activePluginId) ||
        existing.activePluginId ||
        (platform.pluginRuntime.getPluginInfo() && platform.pluginRuntime.getPluginInfo().id) ||
        '';
    const next = platform.settingsMerge.splitSavePatch(updatedBinds || {}, activeId, existing);
    fs.writeFileSync(target, JSON.stringify(next, null, 4));
    return { savedTo: target };
});

ipcMain.handle('updateRuffle', async (event, requestedChannel) => {
    try {
        const channel = requestedChannel === 'nightly' ? 'nightly' : 'latest';
        return Object.assign({ ok: true }, await ruffleUpdate.downloadLatest(
            constant.appDataDirectory,
            channel,
            path.join(constant.appRootPath, 'res', 'ruffle', 'ruffle.js')
        ));
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
});

ipcMain.handle('getRuffleStatus', () => {
    const status = ruffleUpdate.getStatus(constant.appDataDirectory, path.join(constant.appRootPath, 'res', 'ruffle', 'ruffle.js'));
    status.isActive = finalKeybinds.renderMode === 'ruffle';
    status.configuredChannel = finalKeybinds.ruffleUpdateChannel === 'nightly' ? 'nightly' : 'latest';
    return status;
});

ipcMain.handle('restoreBundledRuffle', () => ruffleUpdate.restoreBundled(constant.appDataDirectory));

ipcMain.on('restartApp', () => {
    app.relaunch();
    app.exit(0);
});

/// -------------------------------
/// Settings screen IPC - custom SWF file management (see res/customSwf.js).
/// A custom SWF found at boot puts the app in "custom swf" mode, which takes priority over
/// the customUrl option above and over the active plugin's own primary game.
/// -------------------------------

ipcMain.handle('getCustomSwfStatus', () => {
    const activePath = constant.activeCustomSwfPath;
    return { exists: activePath !== null, path: activePath || constant.customSwfPath };
});

ipcMain.handle('chooseCustomSwf', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
        title: 'Select a custom SWF file',
        filters: [{ name: 'Flash SWF', extensions: ['swf'] }],
        properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };

    const target = constant.customSwfPath;
    fs.copyFileSync(result.filePaths[0], target);
    return { canceled: false, exists: true, path: target };
});

ipcMain.handle('removeCustomSwf', () => {
    // Removes every file that would count as the override (all known names), so one click
    // really ends custom-SWF mode.
    constant.removeCustomSwfFiles();
    const activePath = constant.activeCustomSwfPath;
    return { exists: activePath !== null, path: activePath || constant.customSwfPath };
});
