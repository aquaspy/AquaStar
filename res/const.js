const path = require("path");

const appRoot = __dirname.substring(0,__dirname.lastIndexOf(path.sep));
const appVersion = require('electron').app.getVersion();
const appName = "AquaStar"

exports.appName = appName;
exports.appVersion = appVersion;
exports.iconPath = path.join(appRoot, 'Icon', 'Icon.png');

exports.aqlitePath = 'file://'+ path.join(appRoot, 'aqlite.swf');
exports.vanillaAQW = 'http://aq.com/game/gamefiles/Loader.swf'
exports.pagesPath = 'file://'+ path.join(appRoot, 'pages', 'pages.html');

exports.wikiReleases = 'http://aqwwiki.wikidot.com/new-releases';
exports.accountAq = 'https://account.aq.com/'
exports.designNotes = 'https://www.aq.com/gamedesignnotes/'
exports.charLookup = 'https://www.aq.com/character.asp';


// Show help Function ----------------------------------------------------------------
function showHelpMessage(){
    const { dialog } = require('electron')
    const dialog_options = {
        buttons: ['Ok'],
        title: 'Help:',
        message: "These are the keybindings added to the game.",
        detail: 'Alt + W - AQW Wiki\n' +
            'Alt + D - AQW Design notes\n' +
            'Alt + A - Account page\n' +
            //'Alt + P - Character (Player) lookup. You can also just use the in-game lookup.\n' +
            'Alt + N - Opens a new Aqlite instance.\n' +
            'Alt + Q - Opens a Vanilla AQW instance as in aq.com/game/ (keybind subject to change as its temporary)\n' +
            'Alt + Y - Opens a new Window with the usefull browser pages with tabs, being grouped up so doesnt spam windows. Uses more memory (300mb) tho.\n' +
            'F9 - About ' + appName + '.\n' +
            'F11 - Toggles Fullscreen\n' +
            'Shift + F5 - Clears all game cache, some cookies and refresh the window (can fix some bugs in game).\n\n' +
            'Note: F1, or Cmd/Ctrl + H, or Alt + H Shows this message.',
    };
    const response = dialog.showMessageBox(null,dialog_options);
}

// About function
function showAboutMessage(){
    const { dialog } = require('electron')
    const dialog_options = {
        buttons: ['Ok'],
        title: 'About AquaStar Version:  ' + appVersion,
        message: "Aquastar would not be possible without the help of:",
        detail: '133spider (github) for creating AQLite itself\n' +
         'CaioFViana (github)\n' +
         'aquaspy (github)\n' +
         'Artix Entertainment (artix.com)\n' +
         'ElectronJs (electronjs.org)\n' +
         'Adobe Flash Player (adobe.com)\n' +
         'YOU! (Yes, You! Thanks for supporting us!)\n\n' +
        'Note: This is NOT an official Artix product. Artix Entertainment does not recommends it by any means. You are at your own risk using it.\n\n' +
        'You can give your opinion, contribute and follow the project here: https://github.com/aquaspy/AquaStar',
    };
    const response = dialog.showMessageBox(null,dialog_options);
}

exports.showHelpMessage  = showHelpMessage;
exports.showAboutMessage = showAboutMessage;
