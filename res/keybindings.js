const inst          = require('./instances.js');
const constant      = require('./const.js');
const windowsMenu   = require('./windows/menu.js');
const ipcRecording  = require('./ipc/recording.js');
const locale        = require('./locale.js');
const fs            = require('fs');
const path          = require('path');
const { globalShortcut, BrowserWindow, ipcMain, app, dialog } = require('electron');
const electronLocalshortcut = require('electron-localshortcut');
const ruffleUpdate    = require('./ruffleUpdate.js');

var finalKeybinds = {};
var recordingWinId = 0;

const CACHE_STORAGES = [
    'appcache', 'shadercache', 'cachestorage', 'localstorage',
    'cookies', 'filesystem', 'indexdb', 'websql', 'serviceworkers'
];

function customKeybinds() {
    var list = constant.listValidKeybindLocations;
    finalKeybinds = Object.assign({}, constant.originalKeybinds, constant.originalOptions);

    if (list != null && list.length != 0 ) {
        list.forEach((jsonPath) => {
            try {
                var tempJson = JSON.parse(fs.readFileSync(jsonPath));
                Object.assign(finalKeybinds,tempJson);
            }
            catch (e) { // If it fails, wont matter rly
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
        })
    }
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

const processKeybings = function (){

    // REMEMBER, ADD KEYBIDING FUNC ALREADY EXECUTE ON THE FOCUSED WINDOW!!!
    
    if(constant.isDebugBuild){
        // Alt+I is now the Inventory screen's keybind - moved off this debug-only shortcut.
        addKeybind('Alt+Shift+I', (fw)=>{fw.webContents.openDevTools()},true);
    }
    
    const k = customKeybinds();
    
    /// Shhh... secreat stuff
    if (k.swfLog == true) constant.enableSWFLogging();
    // Truthy check on purpose - customUrl now always exists (default ""), via originalOptions,
    // so an empty-string default must NOT be treated as "override with an empty URL".
    if (k.customUrl) constant.changeMainUrl(k.customUrl);
    if (k.useDirectWmode !== undefined) constant.setUseDirectWmode(k.useDirectWmode);
    if (k.enableDevTools == true) constant.enableDevTools();

    addKeybind(k.wiki    , ()=>{inst.newBrowserWindow(constant.wikiReleases)});
    addKeybind(k.design  , ()=>{inst.newBrowserWindow(constant.designNotes)});
    addKeybind(k.account , ()=>{inst.newBrowserWindow(constant.accountAq)});
    addKeybind(k.charpage, ()=>{inst.newBrowserWindow(constant.buildCharLookupUrl(k.playerCharacter))});
    
    // Open new Aqlite window (usefull for alts)
    addKeybind(k.newAqw  , ()=>{inst.newBrowserWindow(constant.mainPath)});
    addKeybind(k.newTest , ()=>{inst.newBrowserWindow(constant.testingAQW)});
    
    // Show help message
    addKeybind(k.help,     (focusedWin)=>{windowsMenu.showHelpMessage(focusedWin)});

    addKeybind(k.about,    (focusedWin)=>{windowsMenu.showAboutMessage(focusedWin)});

    // Open Settings screen - customize keybindings
    addKeybind(k.settings, ()=>{inst.openSettingsWindow()});

    // Open Reminders screen - daily/weekly quest tracker per character
    addKeybind(k.reminders, ()=>{inst.openRemindersWindow()});

    // Open To-Do screen - per-character task list (drops, shop items, quest rewards...)
    addKeybind(k.todo, ()=>{inst.openTodoWindow()});

    // Open Inventory screen - synced account.aq.com Inventory/BuyBack browser
    addKeybind(k.inventory, ()=>{inst.openInventoryWindow()});

    addKeybind(k.strategy, ()=>{inst.openStrategyWindow()});

    // Toggle Fullscreen
    addKeybind(k.fullscreen, toggleFullscreen);

    // F2 / Ctrl+J must use globalShortcut — Flash PPAPI eats before-input-event keys
    addGlobalKeybind(k.sshot, (focusedWin) => { inst.takeSS(focusedWin); }, false, true);
    addGlobalKeybind(k.record, toggleRecording);


    // Reload
    addKeybind(k.reload,   (focusedWin) => {focusedWin.reload()});
    // Reload and clear cache — globalShortcut so Flash game windows receive Ctrl+Shift+F5
    addGlobalKeybind(k.reloadCache, reloadIgnoringCache, false, true);
    
    // Yay, AquaSP can have his DF too!
    addKeybind(k.dragon, () => inst.newBrowserWindow(constant.df_url));
    
    //FORCED KEYBINDS FOR MAC. NEEDS TESTING
    if (process.platform == 'darwin'){
        addKeybind(k.cpSshot, ()=>{inst.charPagePrint()},true)
        addKeybind(k.backward, 
            (fw) => {
                var br = fw.webContents;
                if (br.canGoBack()) br.goBack();
            },
        true);
        addKeybind(k.forward,
            (fw) => {
                var br = fw.webContents;
                if (br.canGoForward()) br.goForward();
            },
        true);
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

// Menu entries call this dispatcher instead of duplicating shortcut behavior.
// Keeping one implementation is particularly important for recording state and
// cache clearing, both of which have process-wide side effects.
exports.runGameMenuAction = function(action, focusedWin) {
    switch (action) {
    case 'wiki': return inst.newBrowserWindow(constant.wikiReleases);
    case 'design': return inst.newBrowserWindow(constant.designNotes);
    case 'account': return inst.newBrowserWindow(constant.accountAq);
    case 'charpage': return inst.newBrowserWindow(constant.buildCharLookupUrl(finalKeybinds.playerCharacter));
    case 'newAqw': return inst.newBrowserWindow(constant.mainPath);
    case 'newTest': return inst.newBrowserWindow(constant.testingAQW);
    case 'dragon': return inst.newBrowserWindow(constant.df_url);
    case 'help': return windowsMenu.showHelpMessage(focusedWin);
    case 'about': return windowsMenu.showAboutMessage(focusedWin);
    case 'settings': return inst.openSettingsWindow();
    case 'reminders': return inst.openRemindersWindow();
    case 'todo': return inst.openTodoWindow();
    case 'inventory': return inst.openInventoryWindow();
    case 'strategy': return inst.openStrategyWindow();
    case 'studio': return inst.openCharPageStudioWindow();
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
    return {
        current:  Object.assign({}, finalKeybinds),
        defaults: Object.assign({}, constant.originalKeybinds),
        options:  Object.assign({}, constant.originalOptions),
        recordingFormatChoices: constant.recordingFormatChoices,
        renderModeChoices: constant.renderModeChoices,
        ruffleUpdateChannelChoices: constant.ruffleUpdateChannelChoices,
        savePath: _keybindSaveTarget()
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
    Object.assign(existing, updatedBinds);
    fs.writeFileSync(target, JSON.stringify(existing, null, 4));
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
/// Settings screen IPC - custom AQLite SWF file (aqlite_old.swf) management.
/// Presence of this exact file (checked once at boot in const.js) is what puts the app
/// into "custom swf" mode, which takes priority over the customUrl option above.
/// -------------------------------

function _customSwfPath() {
    return constant.customSwfPath;
}

function _activeCustomSwfPath() {
    if (fs.existsSync(constant.customSwfPath)) return constant.customSwfPath;
    if (fs.existsSync(constant.legacyCustomSwfPath)) return constant.legacyCustomSwfPath;
    return null;
}

ipcMain.handle('getCustomSwfStatus', () => {
    const activePath = _activeCustomSwfPath();
    return { exists: activePath !== null, path: activePath || _customSwfPath() };
});

ipcMain.handle('chooseCustomSwf', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
        title: 'Select a custom AQLite SWF file',
        filters: [{ name: 'Flash SWF', extensions: ['swf'] }],
        properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };

    const target = _customSwfPath();
    fs.copyFileSync(result.filePaths[0], target);
    return { canceled: false, exists: true, path: target };
});

ipcMain.handle('removeCustomSwf', () => {
    const target = _activeCustomSwfPath();
    if (target) fs.unlinkSync(target);
    const activePath = _activeCustomSwfPath();
    return { exists: activePath !== null, path: activePath || _customSwfPath() };
});
