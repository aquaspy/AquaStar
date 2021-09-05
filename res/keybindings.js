const inst     = require('./instances.js');
const constant = require('./const.js');
const fs       = require('fs');
const electronLocalshortcut = require('electron-localshortcut');

var finalKeybinds = {};

function customKeybinds() {
    var list = constant.listValidKeybindLocations;
    finalKeybinds = constant.originalKeybinds;

    if (list != null && list.length != 0 ) {
        list.forEach((jsonPath) => {
            try {
                var tempJson = JSON.parse(fs.readFileSync(jsonPath));
                Object.assign(finalKeybinds,tempJson);
            }
            catch (e) { // If it fails, wont matter rly
                const errorMsg = e.error + " " + e.message + "\n" +
                "Check out " + jsonPath + "/" + keybingJsonFileName;
                console.log(errorMsg);
                const { dialog } = require('electron')
                const dialog_options = {
                    buttons: ['Oh no...'],
                    title:   e.error,
                    message: e.message,
                    detail:  "Check out " + jsonPath + "/" + keybingJsonFileName
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
    console.log(k);
    addKeybind(k.wiki    , ()=>{inst.newBrowserWindow(constant.wikiReleases)});
    addKeybind(k.design  , ()=>{inst.newBrowserWindow(constant.designNotes)});
    addKeybind(k.account , ()=>{inst.newBrowserWindow(constant.accountAq)});
    addKeybind(k.charpage, ()=>{inst.newBrowserWindow(constant.charLookup)});

    // Function knows how to load it.
    addKeybind(k.newTabbed,()=>{inst.newBrowserWindow(constant.pagesPath)});
    
    // Open new Aqlite window (usefull for alts)
    addKeybind(k.newAqlite,()=>{inst.newBrowserWindow(constant.aqlitePath)});
    addKeybind(k.newAqw,   ()=>{inst.newBrowserWindow(constant.vanillaAQW)});
    
    // Show help message
    addKeybind(k.help,     (focusedWin)=>{constant.showHelpMessage(focusedWin)});
    
    addKeybind(k.about,    (focusedWin)=>{constant.showAboutMessage(focusedWin)});

    // Toggle Fullscreen
    addKeybind(k.fullscreen,(focusedWin) => {
        focusedWin.setFullScreen(!focusedWin.isFullScreen());
        
        if (process.platform != 'darwin') focusedWin.setMenuBarVisibility(false);
        // As only wiki and so should have menubars, do not show them on game windows (that can be Fullscreen)
    });

    // Print Screen 
    addKeybind(k.sshot,    (focusedWin) => { inst.takeSS(focusedWin); },false, true); // So dragonfable has SS. the first false is to tell it needs to be a game window... check the function for details
    
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

exports.addKeybinding = processKeybings;
