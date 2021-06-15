const {globalShortcut} = require('electron');
const inst     = require('./instances.js');
const constant = require('./const.js');

const addKeybind = function(keybind, func, onlyHTML = false, considerDF = false){
    var ret = globalShortcut.register(keybind, () => {
        inst.executeOnFocused(func, onlyHTML, considerDF);
    })
    if (!ret) console.log("WARNING: failed to bind " + keybind);
}

const addBinds = function (){
    // REMEMBER, ADD KEYBIDING FUNC ALREADY EXECUTE ON THE FOCUSED WINDOW!!!
    // DEBUG ONLY, DO NOT SEND IN PRODUCTION
    //addKeybind('Alt+I', (fw)=>{fw.webContents.openDevTools()},true);
    const k = constant.keyBinds;
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
    k.help.forEach((opt)=> {
        addKeybind(opt,    ()=>{constant.showHelpMessage()});
    });
    // Show About
    addKeybind(k.about,    ()=>{constant.showAboutMessage()});

    // Toggle Fullscreen
    addKeybind(k.fullscreen,(focusedWin) => {
        focusedWin.setFullScreen(!focusedWin.isFullScreen());
        
        if (process.platform != 'darwin') focusedWin.setMenuBarVisibility(false);
        // As only wiki and so should have menubars, do not show them on game windows (that can be Fullscreen)
    });

    // Print Screen 
    addKeybind(k.sshot,    (focusedWin) => { inst.takeSS(focusedWin); },false, true); // So dragonfable has SS. the first false is to tell it needs to be a game window... check the function for details
    
    // Reload
    k.re
    var reloadPage = (focusedWin) => {focusedWin.reload()};
    addKeybind(k.reload, reloadPage);
    addKeybind(k.reload2,reloadPage);
    // Reload and Clear cache
    addKeybind(k.reloadCache, (focusedWin) => {
        var ses = focusedWin.webContents.session;
        ses.flushStorageData() //writing some data from memory to disk before cleaning
        ses.clearStorageData({storages: ['appcache', 'shadercache', 'cachestorage', 'localstorage', 'cookies', 'filesystem', 'indexdb', 'websql', 'serviceworkers']})
        focusedWin.reload();
    })
    
    // Yay, AquaSP can have his DF too!
    addKeybind(k.dragon, () => inst.newBrowserWindow(constant.df_url));
    
    // FORCED KEYBINDS FOR MAC. NEEDS TESTING
    if (process.platform == 'darwin'){
        addKeybind(k.cpSshot, ()=>{inst.charPagePrint()},true)
        addKeybind(k.macBackward, 
            (fw) => {
                var br = fw.webContents;
                if (br.canGoBack()) br.goBack();
            },
        true);
        addKeybind(k.macFoward,
            (fw) => {
                var br = fw.webContents;
                if (br.canGoForward()) br.goForward();
            },
        true);
    }
}

exports.addKeybinding = addBinds;
