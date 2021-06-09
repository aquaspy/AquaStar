const {app, BrowserWindow}  = require("electron");

const path   = require("path");
const locale = require("./locale.js");
const fs     = require("fs");
const url    = require("url");

/// Inside the app itself. Root of the project
const appRoot = __dirname.substring(0,__dirname.lastIndexOf(path.sep));
/// Where app is ran from.
const appCurrentDirectory = process.cwd();
/// Pictures save location.
const sshotPath = path.join(app.getPath("pictures"),"AquaStar Screenshots");
const appVersion = require('electron').app.getVersion();
const appName = "AquaStar";
const iconPath = path.join(appRoot, 'Icon', 'Icon_1024.png');

exports.appName = appName;
exports.appVersion = appVersion;
exports.appRootPath = appRoot;
exports.appDirectoryPath = appCurrentDirectory;
exports.sshotPath = sshotPath;

/// Icon Stuff
const nativeImage = require('electron').nativeImage;
var iconImage = nativeImage.createFromPath(iconPath);
    iconImage.setTemplateImage(true);
    
exports.iconPath = iconPath;

exports.aqlitePath = fs.existsSync(path.join(appCurrentDirectory,'aqlite_old.swf'))? 
            _getFileUrl(path.join(appCurrentDirectory, 'aqlite_old.swf')) :
            _getFileUrl(path.join(appRoot, 'aqlite.swf'))
exports.isOldAqlite = fs.existsSync( path.join(appCurrentDirectory,'aqlite_old.swf'));

exports.vanillaAQW = 'https://www.aq.com/game/gamefiles/Loader.swf'
exports.df_url     = 'https://play.dragonfable.com/game/DFLoader.swf'
exports.pagesPath  =  _getFileUrl(path.join(appRoot, 'pages', 'pages.html'))

exports.wikiReleases = 'http://aqwwiki.wikidot.com/new-releases';
exports.accountAq = 'https://account.aq.com/'
exports.designNotes = 'https://www.aq.com/gamedesignnotes/'
exports.charLookup = 'https://account.aq.com/CharPage';

// Fixing file:// urls
function _getFileUrl(path) {
    return url.format({
        pathname: path,
        protocol: 'file:',
        slashes: true
    })
}

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
    'icon': iconImage
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
    'icon': iconImage
}
exports.mainConfig = {
    width: 960,
    height: 550,
    icon: iconImage,
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

exports.getMenu = () => {
    // needs to be like that as the function is located on instances... arg is isFoward
    // Mac uses a forced keybind here, while the others can use the & symbol and have the same keybind NATIVE to the app.
    if (process.platform == 'darwin') return null;
    return [
        {
            label: '<<< &Backward',
            click() {
                var br = BrowserWindow.getFocusedWindow().webContents;
                if (br.canGoBack()) br.goBack();
            } 

        },
        {
            label: '>>> &Forward',
            click() {
                var br = BrowserWindow.getFocusedWindow().webContents;
                if (br.canGoForward()) br.goForward();
            }
        }
    ];
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
