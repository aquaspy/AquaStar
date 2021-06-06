const path   = require("path");
const {app}  = require("electron");
const locale = require("./locale.js");
const fs     = require("fs");

/// Inside the app itself. Root of the project
const appRoot = __dirname.substring(0,__dirname.lastIndexOf(path.sep));
/// Where app is ran from.
const appCurrentDirectory = process.cwd();
/// Pictures save location.
const sshotPath = path.join(app.getPath("pictures"),"AquaStar Screenshots");
const appVersion = require('electron').app.getVersion();
const appName = "AquaStar";
const iconPath = path.join(appRoot, 'Icon', 'Icon.png');

exports.appName = appName;
exports.appVersion = appVersion;
exports.appRootPath = appRoot;
exports.appDirectoryPath = appCurrentDirectory;
exports.sshotPath = sshotPath;
exports.iconPath = iconPath;

exports.aqlitePath = fs.existsSync(path.join(appCurrentDirectory,'aqlite_old.swf'))? 
            'file://'+ path.join(appCurrentDirectory, 'aqlite_old.swf') : 
            'file://'+ path.join(appRoot, 'aqlite.swf');
exports.isOldAqlite = fs.existsSync( path.join(appCurrentDirectory,'aqlite_old.swf'));

exports.vanillaAQW = 'http://aq.com/game/gamefiles/Loader.swf'
exports.pagesPath = 'file://'+ path.join(appRoot, 'pages', 'pages.html');

exports.wikiReleases = 'http://aqwwiki.wikidot.com/new-releases';
exports.accountAq = 'https://account.aq.com/'
exports.designNotes = 'https://www.aq.com/gamedesignnotes/'
//exports.charLookup = 'https://www.aq.com/character.asp';
exports.charLookup = 'https://account.aq.com/CharPage';

// For customizing windows themselfs
exports.tabbedConfig = {
    'width': 960,
    'height': 550,
    'webPreferences': {
        'plugins': true,
        'nodeIntegration': false,
        'webviewTag': true,
        'javascript': true,
        'contextIsolation': true,
        'enableRemoteModule': false,
        'nodeIntegrationInWorker': false //maybe better performance for more instances in future... Neends testing.
    },
    'icon': iconPath
}

exports.winConfig = {
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
        'nodeIntegrationInWorker': false //maybe better performance for more instances in future... Neends testing.
    },
    'icon': iconPath
}

exports.mainConfig = {
    width: 960,
    height: 550,
    icon: iconPath,
    title: appName,
    webPreferences: {
        nodeIntegration: false,
        webviewTag: false,
        plugins: true,
        javascript: true,
        contextIsolation: true,
        enableRemoteModule: false,
        nodeIntegrationInWorker: false //maybe better performance for more instances in future... Neends testing.
    }
    }
// Show help Function ----------------------------------------------------------------
function showHelpMessage(){
    const { dialog } = require('electron')
    const dialog_options = {
        buttons: ['Ok'],
        title:   locale.getHelpTitle,
        message: locale.getHelpMessage,
        detail:  locale.getHelpDetail + "\n\n" +
            locale.getHelpScreenshot + sshotPath + "\n" + 
            locale.getHelpAqliteOld + appCurrentDirectory 
    };
    const response = dialog.showMessageBox(null,dialog_options);
}

// About function
function showAboutMessage(){
    const { dialog } = require('electron')
    const dialog_options = {
        buttons: ['Ok'],
        title:   locale.getAboutTitle + appVersion,
        message: locale.getAboutMessage,
        detail:  locale.getAboutDetail + 'https://github.com/aquaspy/AquaStar\n\n'
    };
    const response = dialog.showMessageBox(null,dialog_options);
}

exports.showHelpMessage  = showHelpMessage;
exports.showAboutMessage = showAboutMessage;
exports.setLocale = () => {locale.detectLang()};
