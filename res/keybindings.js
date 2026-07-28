const inst     = require('./instances.js');
const constant = require('./const.js');
const locale   = require('./locale.js');
const fs       = require('fs');
const { globalShortcut, BrowserWindow, ipcMain, app } = require('electron');
const electronLocalshortcut = require('electron-localshortcut');

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

const processKeybings = function (){

    // REMEMBER, ADD KEYBIDING FUNC ALREADY EXECUTE ON THE FOCUSED WINDOW!!!
    
    if(constant.isDebugBuild){
        addKeybind('Alt+I', (fw)=>{fw.webContents.openDevTools()},true);        
    }
    
    const k = customKeybinds();
    
    /// Shhh... secreat stuff
    if (k.swfLog == true) constant.enableSWFLogging();
    if (k.customUrl != undefined && k.customUrl != null) constant.changeMainUrl(k.customUrl);
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
    addKeybind(k.help,     (focusedWin)=>{constant.showHelpMessage(focusedWin)});

    addKeybind(k.about,    (focusedWin)=>{constant.showAboutMessage(focusedWin)});

    // Open Settings screen - customize keybindings
    addKeybind(k.settings, ()=>{inst.openSettingsWindow()});

    // Toggle Fullscreen
    addKeybind(k.fullscreen,(focusedWin) => {
        focusedWin.setFullScreen(!focusedWin.isFullScreen());
        
        if (process.platform != 'darwin') focusedWin.setMenuBarVisibility(false);
        // As only wiki and so should have menubars, do not show them on game windows (that can be Fullscreen)
    });

    // F2 / Ctrl+J must use globalShortcut — Flash PPAPI eats before-input-event keys
    addGlobalKeybind(k.sshot, (focusedWin) => { inst.takeSS(focusedWin); }, false, true);
    addGlobalKeybind(k.record, (focusedWin) => {
        if(!constant.wasRecording()){
            inst.notifyWin(focusedWin,
                constant.titleMessages.recording + "! " + focusedWin.getTitle(),
                false);
            recordingWinId = focusedWin.id;

            constant.triggerRecording(focusedWin);
            focusedWin.setIcon(constant.nativeImageRedIcon)
        }
        else {
            if (recordingWinId != focusedWin.id) {
                inst.notifyWin(focusedWin,
                    constant.titleMessages.alreadyRecording);
                return;
            }
            else {
                const recordWin = BrowserWindow.fromId(recordingWinId) || focusedWin;
                inst.notifyWin(recordWin, inst.getSavedTitle(recordWin));
                constant.triggerRecording(recordWin);
                recordWin.setIcon(constant.nativeImageIcon)
            }
        }
    });


    // Reload
    addKeybind(k.reload,   (focusedWin) => {focusedWin.reload()});
    // Reload and clear cache — globalShortcut so Flash game windows receive Ctrl+Shift+F5
    addGlobalKeybind(k.reloadCache, async (focusedWin) => {
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
    }, false, true);
    
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

/// -------------------------------
/// Settings screen IPC - reading/writing custom keybindings from aquastar.json
/// -------------------------------

// Whichever file is actually taking effect gets the write - inPathJsonPath wins the
// merge in customKeybinds() when both exist, so writing to appdata only would be a silent no-op.
function _keybindSaveTarget(){
    return fs.existsSync(constant.inPathJsonPath) ? constant.inPathJsonPath : constant.appdataJsonPath;
}

ipcMain.handle('getKeybindings', () => {
    return {
        current:  Object.assign({}, finalKeybinds),
        defaults: Object.assign({}, constant.originalKeybinds),
        options:  Object.assign({}, constant.originalOptions),
        recordingFormatChoices: constant.recordingFormatChoices,
        savePath: _keybindSaveTarget()
    };
});

// Game window preload (preload_capture.js) asks this before starting MediaRecorder -
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

ipcMain.on('restartApp', () => {
    app.relaunch();
    app.exit(0);
});
