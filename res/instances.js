const constant        = require('./const.js');
const {BrowserWindow} = require('electron');

let altPages = 1;           // Total Aqlite windows opened
let aqliteWindowArray = []; // Store the alt windows

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
            'enableRemoteModule': false,
            'nodeIntegrationInWorker': true //maybe better performance for more instances in future... Neends testing.
        },
        'icon': constant.iconPath
    });
    newWin.setMenuBarVisibility(false) //Remove default electron menu
    newWin.loadURL(new_path);

    if (new_path == constant.aqlitePath) {
        // Its alt window, Put the aqlite title...
        altPages++;
        newWin.setTitle("AQLite (Window " + altPages + ")");
        // ...and add it in the arrays
        aqliteWindowArray.push(newWin);

        newWin.on('closed', () => {
            // Remove it from array! Will cause problems if not!
            for( var i = 0; i < aqliteWindowArray.length; i++){
                if ( aqliteWindowArray[i] === newWin) {
                    aqliteWindowArray.splice(i, 1);
                }
            }
        });
    }
    else if (new_path == constant.vanillaAQW) {
        // Its alt window, but for vanilla.
        altPages++;
        newWin.setTitle("Adventure Quest Worlds (Window " + altPages + ")");
        // ...and add it in the arrays
        aqliteWindowArray.push(newWin);

        newWin.on('closed', () => {
            // Remove it from array! Will cause problems if not!
            for( var i = 0; i < aqliteWindowArray.length; i++){
                if ( aqliteWindowArray[i] === newWin) {
                    aqliteWindowArray.splice(i, 1);
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
    if(mainWin.isFocused()) {
        funcForWindow(mainWin);
        return;
    }
    else {
        for (var i = 0; i < aqliteWindowArray.length; i++){
            if (aqliteWindowArray[i].isFocused())
                funcForWindow(aqliteWindowArray[i]);
        }
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
