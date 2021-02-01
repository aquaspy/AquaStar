const electronLocalshortcut = require('electron-localshortcut');
const inst     = require('./instances.js');
const constant = require('./const.js');

// Store window info here.
let win;

const addKeybind = function(keybind, func){
    electronLocalshortcut.register(keybind,()=>{
        if ( win.isFocused() || inst.testForFocus() ){
            func();
        }
    })
}

const addBinds = function (targetWin, ses){
    win = targetWin;
    addKeybind('Alt+W', ()=>{inst.newBrowserWindow(constant.wikiReleases)});
    addKeybind('Alt+D', ()=>{inst.newBrowserWindow(constant.designNotes)});
    addKeybind('Alt+A', ()=>{inst.newBrowserWindow(constant.accountAq)});
    //addKeybind('Alt+P', ()=>{newBrowserWindow(constant.charLookup)});

    addKeybind('Alt+Y',  ()=>{inst.newTabbedWindow()});
    
    // Open new Aqlite window (usefull for alts)
    addKeybind('Alt+N',  ()=>{inst.newBrowserWindow(constant.aqlitePath)});
    addKeybind('Alt+Q',  ()=>{inst.newBrowserWindow(constant.vanillaAQW)});
    
    // Show help message
    addKeybind('Alt+H',              ()=>{constant.showHelpMessage()});
    addKeybind('F1',                 ()=>{constant.showHelpMessage()});
    addKeybind('CommandOrControl+H', ()=>{constant.showHelpMessage()});
    // Show About
    addKeybind('F9',  ()=>{constant.showAboutMessage()});

    // Toggle Fullscreen
    var toggle = function(focusedWin){
        focusedWin.setFullScreen(!focusedWin.isFullScreen());
        focusedWin.setMenuBarVisibility(false)
    };
    addKeybind('F11', ()=>{inst.executeOnFocused(win,toggle)});

    // Reload
    var reloadPage = function(focusedWin){focusedWin.reload()};
    addKeybind('F5',                 ()=>{inst.executeOnFocused(win,reloadPage)});
    addKeybind('CommandOrControl+R', ()=>{inst.executeOnFocused(win,reloadPage)});
    // Reload and Clear cache
    addKeybind('Shift+F5', () => {
        ses.flushStorageData() //writing some data from memory to disk before cleaning
        ses.clearStorageData({storages: ['appcache', 'shadercache', 'cachestorage', 'localstorage', 'cookies', 'filesystem', 'indexdb', 'websql', 'serviceworkers']})
        inst.executeOnFocused(win,reloadPage)
    })
    
    // Yay, AquaSP can have his DF too!
    addKeybind('Alt+1', () => inst.newBrowserWindow('https://play.dragonfable.com/game/DFLoader.swf'));
    // This is a easter egg BTW, congratulations if you found it!
}

exports.addKeybinding = addBinds;
