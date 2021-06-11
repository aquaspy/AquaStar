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
    addKeybind('Alt+I', (fw)=>{fw.webContents.openDevTools()},true);
    addKeybind('Alt+K', ()=>{inst.charPagePrint()})//,true)
    
    addKeybind('Alt+W', ()=>{inst.newBrowserWindow(constant.wikiReleases)});
    addKeybind('Alt+D', ()=>{inst.newBrowserWindow(constant.designNotes)});
    addKeybind('Alt+A', ()=>{inst.newBrowserWindow(constant.accountAq)});
    addKeybind('Alt+P', ()=>{inst.newBrowserWindow(constant.charLookup)});

    // Function knows how to load it.
    addKeybind('Alt+Y', ()=>{inst.newBrowserWindow(constant.pagesPath)});
    
    // Open new Aqlite window (usefull for alts)
    addKeybind('Alt+N', ()=>{inst.newBrowserWindow(constant.aqlitePath)});
    addKeybind('Alt+Q', ()=>{inst.newBrowserWindow(constant.vanillaAQW)});
    
    // Show help message
    addKeybind('Alt+H',              ()=>{constant.showHelpMessage()});
    addKeybind('F1',                 ()=>{constant.showHelpMessage()});
    addKeybind('CommandOrControl+H', ()=>{constant.showHelpMessage()});
    // Show About
    addKeybind('F9',                 ()=>{constant.showAboutMessage()});

    // Toggle Fullscreen
    addKeybind('F11', (focusedWin) => {
        focusedWin.setFullScreen(!focusedWin.isFullScreen());
        
        if (process.platform != 'darwin') focusedWin.setMenuBarVisibility(false);
        // As only wiki and so should have menubars, do not show them on game windows (that can be Fullscreen)
    });

    // Print Screen 
    addKeybind('F2', (focusedWin) => { inst.takeSS(focusedWin); },false, true); // So dragonfable has SS. the first false is to tell it needs to be a game window... check the function for details
    
    // Reload
    var reloadPage = function(focusedWin){focusedWin.reload()};
    addKeybind('F5',                reloadPage);
    addKeybind('CommandOrControl+R',reloadPage);
    // Reload and Clear cache
    addKeybind('Shift+F5', (focusedWin) => {
        var ses = focusedWin.webContents.session;
        ses.flushStorageData() //writing some data from memory to disk before cleaning
        ses.clearStorageData({storages: ['appcache', 'shadercache', 'cachestorage', 'localstorage', 'cookies', 'filesystem', 'indexdb', 'websql', 'serviceworkers']})
        focusedWin.reload();
    })
    
    // Yay, AquaSP can have his DF too!
    addKeybind('Alt+1', () => inst.newBrowserWindow(constant.df_url));
    
    // FORCED KEYBINDS FOR MAC. NEEDS TESTING
    if (process.platform == 'darwin'){
        addKeybind('Alt+B', inst.navFunction(false), true);
        addKeybind('Alt+F', inst.navFunction(true ), true);
    }
}

exports.addKeybinding = addBinds;
