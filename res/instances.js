const constant        = require('./const.js');
const {BrowserWindow} = require('electron');

let aqliteWindowArray = []; // Store the alt windows
let usedAltPagesNumbers = [];

// New page function
function newBrowserWindow(new_path){
    const newWin = new BrowserWindow({
        'width': 960,
        'height': 550,
        'webPreferences': {
            'plugins': true,
            'nodeIntegration': false,
            'webviewTag': false,
            'javascript': true,
            'contextIsolation': true,
            //'preload': __dirname + '/../preload.js',
            'enableRemoteModule': false,
            'nodeIntegrationInWorker': true //maybe better performance for more instances in future... Neends testing.
        },
        'icon': constant.iconPath
    });
    newWin.setMenuBarVisibility(false); //Remove default electron menu
    /*
    console.log(new_path);
    console.log( __dirname + '/../preload.js');
    */
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
            winTitle = "AquaStar - AQLite (Window " + windowNumber + ")" : 
            winTitle = "AquaStar - Adventure Quest Worlds (Window " + windowNumber + ")";
        
        newWin.setTitle(winTitle);

        // ...and add them in the arrays
        aqliteWindowArray.push(newWin);
        usedAltPagesNumbers.push(windowNumber);

        newWin.on('closed', () => {
            // Remove it from array! Will cause problems if not!
            for( var i = 0; i < aqliteWindowArray.length; i++){
                if ( aqliteWindowArray[i] === newWin) {
                    aqliteWindowArray.splice(i, 1);
                    // For numbering, as the order in both arrays should be the same
                    usedAltPagesNumbers.splice(i, 1);
                }
            }
        });
    }
}

function newTabbedWindow(){
    const newWin = new BrowserWindow({
        'width': 960,
        'height': 550,
        'webPreferences': {
            'plugins': true,
            'nodeIntegration': false,
            'webviewTag': true,
            'javascript': true,
            'contextIsolation': true,
            'enableRemoteModule': false,
            'nodeIntegrationInWorker': true //maybe better performance for more instances in future... Neends testing.
        },
        'icon': constant.iconPath
    });
    newWin.setMenuBarVisibility(false) //Remove default electron menu
    newWin.loadURL(constant.pagesPath);
}

function executeOnFocused(mainWin, funcForWindow){
    // First the alt windows
    for (var i = 0; i < aqliteWindowArray.length; i++){
        if (aqliteWindowArray[i].isFocused()){
            funcForWindow(aqliteWindowArray[i]);
            break;
        }
    }
    
    // Now the test for the main one... if doesnt exist it could crash (S.A. keybinding's add keybind func.
    try{
        if (mainWin.isFocused())
            funcForWindow(mainWin);
    }
    catch (ex){
        // Do nothing with it. if the main window does not exist anymore, it would do nothing anyway.
        // This is to avoid error.
    }
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
