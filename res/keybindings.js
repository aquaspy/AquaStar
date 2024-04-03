const wind   = require('./window.js');
const config = require('./config.js');
const fs     = require('fs');
const {BrowserWindow, dialog} = require('electron/main');
const localshortcut = require("electron-localshortcut")

var finalKeybinds = {};
var recordingWinId = 0;

function customKeybinds() {
    var list = config.keybind.listValidKeybindLocations;
    finalKeybinds = config.keybind.originalKeybinds;

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
                const dialog_options = {
                    buttons: ['Oh no...'],
                    title:   "Error",
                    message: e.message,
                    detail:  "Check out " + jsonPath + " for the mistake.\n"+
                    "The program might continue as normal, but the custom keybings wont work.\n\n" +
                    "Try checking out the KEYBINDING.MD file on github.\n" +
                    "Also try a JSON validation website/program if you are lost!\n"
                };
                dialog.showMessageBox(null, dialog_options);
            }
        })
    }
    return finalKeybinds;
}

const processKeybings = function (){
    // yeah, gonna reuse the old code fully XD
    let inst = wind.windows
    let constant = config.constant

    // REMEMBER, ADD KEYBIDING FUNC ALREADY EXECUTE ON THE FOCUSED WINDOW!!!
    if(constant.isDebugBuild){
        addKeybind('Alt+I', (fw)=>{fw.webContents.openDevTools()},true);        
    }
    
    const k = customKeybinds();

    /// Shhh... secret stuff
    if (k.swfLog == true) config.constant.enableSWFLogging();
    if (![undefined, null].includes(k.customUrl)) constant.changeMainUrl(k.customUrl);

    addKeybind(k.wiki    , ()=>{inst.newBrowserWindow(constant.wikiReleases)});
    addKeybind(k.design  , ()=>{inst.newBrowserWindow(constant.designNotes)});
    addKeybind(k.account , ()=>{inst.newBrowserWindow(constant.accountAq)});
    addKeybind(k.charpage, ()=>{inst.newBrowserWindow(constant.charLookup)});
    
    // Open new Aqlite window (usefull for alts)
    addKeybind(k.newAqw  , ()=>{inst.newBrowserWindow(constant.mainPath)});
    addKeybind(k.newTest , ()=>{inst.newBrowserWindow(constant.testingAQW)});
    
    // Show help message
    addKeybind(k.help,     (focusedWin)=>{config.helpmsg.showHelpMessage(focusedWin)});
    
    addKeybind(k.about,    (focusedWin)=>{config.helpmsg.showAboutMessage(focusedWin)});

    // Toggle Fullscreen
    addKeybind(k.fullscreen,(focusedWin) => {
        focusedWin.setFullScreen(!focusedWin.isFullScreen());
        
        if (process.platform != 'darwin') focusedWin.setMenuBarVisibility(false);
        // As only wiki and so should have menubars, do not show them on game windows (that can be Fullscreen)
    });

    // Print Screen 
    addKeybind(k.sshot,    (focusedWin) => { inst.takeSS(focusedWin); }, false, true); // So dragonfable has SS. the first false is to tell it needs to be a game window... check the function for details
    // Record screen
    addKeybind(k.record,   (focusedWin) => {
        if(!config.recording.wasRecording){
            inst._notifyWindow(focusedWin, 
                config.localeStrings.titleMessages.recording + "! " + focusedWin.getTitle(),
                false);
            recordingWinId = focusedWin.id;

            config.recording.triggerRecording();
            focusedWin.setIcon(constant.nativeImageRedIcon)
        }
        else {
            if (recordingWinId != focusedWin.id) {
                inst._notifyWindow(focusedWin,
                    config.localeStrings.titleMessages.alreadyRecording);
                return;
            }
            else {
                inst._notifyWindow(focusedWin,
                    focusedWin.getTitle().split('!')[1]);
                config.recording.triggerRecording();
                focusedWin.setIcon(constant.nativeImageIcon)
            }
        }
    });


    // Reload
    addKeybind(k.reload,   (focusedWin) => {focusedWin.reload()});
    // Reload and Clear cache
    addKeybind(k.reloadCache, (focusedWin) => {
        var ses = focusedWin.webContents.session;
        ses.flushStorageData() //writing some data from memory to disk before cleaning
        ses.clearStorageData({storages: ['appcache', 'shadercache', 'cachestorage', 'localstorage', 'cookies', 'filesystem', 'indexdb', 'websql', 'serviceworkers']})
        focusedWin.reload();
    })
    
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
const addKeybind = function(keybind, func, onlyHTML = false, considerOthers = false){
    if(Array.isArray(keybind)){
        keybind.forEach((value) => {
            addKeybind(value, func, onlyHTML, considerOthers);
        })
    }
    else {    
        // as we kinda have to use global shortcuts, make it work only when its on aquastar.
        localshortcut.register(keybind, () => {
            if (BrowserWindow.getFocusedWindow() != null)
                wind.windows.executeOnFocused(func, onlyHTML, considerOthers);
        })
    }
}

exports.addKeybinding = processKeybings;
