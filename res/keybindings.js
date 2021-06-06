const electronLocalshortcut = require('electron-localshortcut');
const inst     = require('./instances.js');
const constant = require('./const.js');

// SS asks for them....
const fs       = require('fs');
const path     = require('path');

// Store window info here.
let win;

const addKeybind = function(keybind, func, considerDF = false){
    electronLocalshortcut.register(keybind,()=>{
        inst.executeOnFocused(win, func, considerDF);
    });
}

const addBinds = function (targetWin, ses){
    win = targetWin;
    addKeybind('Alt+W', ()=>{inst.newBrowserWindow(constant.wikiReleases)});
    addKeybind('Alt+D', ()=>{inst.newBrowserWindow(constant.designNotes)});
    addKeybind('Alt+A', ()=>{inst.newBrowserWindow(constant.accountAq)});
    addKeybind('Alt+P', ()=>{inst.newBrowserWindow(constant.charLookup)});

    addKeybind('Alt+Y', ()=>{inst.newTabbedWindow()});
    
    // Open new Aqlite window (usefull for alts)
    addKeybind('Alt+N', ()=>{inst.newBrowserWindow(constant.aqlitePath)});
    addKeybind('Alt+Q', ()=>{inst.newBrowserWindow(constant.vanillaAQW)});
    
    // Show help message
    addKeybind('Alt+H',              ()=>{constant.showHelpMessage()});
    addKeybind('F1',                 ()=>{constant.showHelpMessage()});
    addKeybind('CommandOrControl+H', ()=>{constant.showHelpMessage()});
    // Show About
    addKeybind('F9',    ()=>{constant.showAboutMessage()});

    // Toggle Fullscreen
    addKeybind('F11', (focusedWin) => {
        focusedWin.setFullScreen(!focusedWin.isFullScreen());
        focusedWin.setMenuBarVisibility(false);
        // FIXME TODO - not working on alt A and usual browsers when comming back from Fullscreen (test only for now) 
    });

    // Print Screen 
    addKeybind('F12', (focusedWin)=>{
        focusedWin.webContents.capturePage(
            (sshot) => {
                console.log("Screenshotting it...");
                // Create SS directory if doesnt exist
                var ssfolder = constant.sshotPath;
                _mkdir(ssfolder);
                
                // Figure out the filename
                var sshotFileName = _sshotFileName(ssfolder);
                
                // Save it.
                fs.writeFileSync(path.join(ssfolder, sshotFileName), sshot.toPNG());
                console.log("Done! Saved in " + path.join(ssfolder, sshotFileName));
            }
        );
    }, true); // So dragonfable has SS
    
    // Reload
    var reloadPage = function(focusedWin){focusedWin.reload()};
    addKeybind('F5',                reloadPage);
    addKeybind('CommandOrControl+R',reloadPage);
    // Reload and Clear cache
    addKeybind('Shift+F5', () => {
        ses.flushStorageData() //writing some data from memory to disk before cleaning
        ses.clearStorageData({storages: ['appcache', 'shadercache', 'cachestorage', 'localstorage', 'cookies', 'filesystem', 'indexdb', 'websql', 'serviceworkers']})
        inst.executeOnFocused(win,reloadPage)
    })
    
    // Yay, AquaSP can have his DF too!
    addKeybind('Alt+1', () => inst.newBrowserWindow(constant.df_url));
}

function _mkdir (filepath){ 
    try { fs.lstatSync(filepath).isDirectory() }
    catch (ex) {
        if (ex.code == 'ENOENT') {
            fs.mkdir(filepath, (err) =>{
                console.log(err);
            })
        }
        else console.log(ex);
    }
}

function _sshotFileName (ssfolder) {
    var today = new Date();
    var pre_name = "Screenshot-" +
        today.getFullYear() + "-" +
        (today.getMonth() + 1) + "-" +
        today.getDate() + "_";
    
    // Find the number for it
    var extraNumberName = 1;
    for (;;extraNumberName++){
        if (fs.existsSync( path.join( ssfolder, pre_name + extraNumberName + ".png"))){
            if (extraNumberName === 10000) {
                console.log("10000 prints per day...? wow! Thats a lot!");
            }
            continue;
        }
        else {
            break;
        }
    }
    return pre_name + extraNumberName + ".png";
}

exports.addKeybinding = addBinds;
