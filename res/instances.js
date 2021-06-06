const constant        = require('./const.js');
const {BrowserWindow} = require('electron');

let usedAltPagesNumbers = [];

// New page function
function newBrowserWindow(new_path){
    const newWin = new BrowserWindow(constant.winConfig);
    newWin.setMenuBarVisibility(false); //Remove default electron menu
    newWin.loadURL(new_path);

    if (new_path == constant.aqlitePath || 
        new_path == constant.vanillaAQW) {
        // Its alt window, Put the aqlite/Aqw title...
        
        var windowNumber = 2; // As the Main one is 1.
        
        for (;usedAltPagesNumbers.includes(windowNumber);windowNumber++){
             if (windowNumber === 20000) {
                console.log("just how long is this opened!?!?");
                break;
            };
        }
        
        // Deciding the new title name...
        var winTitle = "";
        (new_path == constant.aqlitePath) ? 
            winTitle = "AquaStar - AQLite " + (constant.isOldAqlite ? '(Older/Custom AQLite Version - ': "(") + "Window " + windowNumber + ")" : 
            winTitle = "AquaStar - Adventure Quest Worlds (Window " + windowNumber + ")";
        
        newWin.setTitle(winTitle);

        // Storing and Removing the window number from a list.
        usedAltPagesNumbers.push(windowNumber);
        newWin.on('closed', () => {
            usedAltPagesNumbers.splice(
                usedAltPagesNumbers.indexOf(windowNumber), 1);
        });
    }
}

function newTabbedWindow(){
    const newWin = new BrowserWindow(constant.tabbedConfig);
    newWin.setMenuBarVisibility(false) //Remove default electron menu
    newWin.loadURL(constant.pagesPath);
}

function executeOnFocused(mainWin, funcForWindow, considerDF = false){
    // Friendly reminder for BrowserWindow.getAllWindows() existing

    var focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow === null) {
        // No AquaStar Windows are focused. Do nothing.
        return;
    }
    
    // Test Time! Only game windows can have keybindings
    var u = focusedWindow.webContents.getURL();
    console.log(u);
    if (u == constant.aqlitePath || u == constant.vanillaAQW) {
        funcForWindow(focusedWindow);
    }
    else if (considerDF && u === constant.df_url) {
        console.log("tried");
        funcForWindow(focusedWindow);
    }
    // Every other URL are websites. Keep that in mind...
}

// Test if the window focused is a Aqlite window (more like if
//  one of the aqlite windows is focused) so it can use keybinds
function testForFocus(){
    for (var i = 0; i < aqliteWindowArray.length; i++){
        if (aqliteWindowArray[i].isFocused()) return true;
    }
    return false;
}

exports.newTabbedWindow = newTabbedWindow;
exports.newBrowserWindow = newBrowserWindow;

exports.testForFocus = testForFocus;
exports.executeOnFocused = executeOnFocused;
