const constant        = require('./const.js');
const {BrowserWindow, Menu} = require('electron');

let usedAltPagesNumbers = [];

// New page function
function newBrowserWindow(new_path){
    const config = (new_path == constant.pagesPath)? constant.tabbedConfig : constant.winConfig;
    const newWin = new BrowserWindow(config);
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
    else if (new_path == constant.df_url) {
        newWin.setTitle("AquaStar - DragonFable");
    }
    else if (new_path != constant.pagesPath) {
        /// Its a usual HTML page window then! features incomming
        /// ... but only if its win or lunix. Mac doesnt have the feature -_-
        /// Mac still get keybinds tho, just not the menu.
        newWin.setMenuBarVisibility(true);
        
        /// Keybinds are on the keybinds file.
    }
}

/// GAME WINDOW ONLY
function executeOnFocused(funcForWindow, onlyHtml = false, considerDF = false){
    // Friendly reminder for BrowserWindow.getAllWindows() existing

    var focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow === null) {
        // No AquaStar Windows are focused. Do nothing.
        return;
    }
    // Is it a game or is it a HTML..?
    var isGame = _isGameWindow(focusedWindow.webContents.getURL(), considerDF);
    
    // Compacting of the XOR gave me this... LOOL
    if (onlyHtml == !isGame) funcForWindow(focusedWindow);
    
}

/// ANY APP WINDOW WILL DO
function executeOnAnyFocused(funcForWindow){
    // NO FUNCTION USES IT, HERE FOR THE FUTURE!
    var focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow === null) {
        // No AquaStar Windows are focused. Do nothing.
        return;
    }
    funcForWindow(focusedWindow);
}

// Test if the window focused is a Aqlite window (more like if
//  one of the aqlite windows is focused) so it can use keybinds
function testForFocus(){
    for (var i = 0; i < aqliteWindowArray.length; i++){
        if (aqliteWindowArray[i].isFocused()) return true;
    }
    return false;
}

function _isGameWindow(url, considerDF = true){
    if (url == constant.aqlitePath) return true;
    if (url == constant.vanillaAQW) return true;
    if (considerDF && u === constant.df_url) {
        return true;
    }
    
    return false;
}

exports.navFunction = (isFoward) => {
    if (!isFoward) executeOnFocused((focusedWindow) => {
        if (focusedWindow.webContents.canGoBack()) focusedWindow.webContents.goBack();
    },true);
    else executeOnFocused((focusedWindow) => {
        if (focusedWindow.webContents.canGoForward()) focusedWindow.webContents.goForward();
    },true);
}

exports.newBrowserWindow = newBrowserWindow;

exports.testForFocus        = testForFocus;
exports.executeOnFocused    = executeOnFocused;
