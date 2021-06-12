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

const charLookup   = 'https://account.aq.com/CharPage';
const designNotes  = 'https://www.aq.com/gamedesignnotes/';
const accountAq    = 'https://account.aq.com/';
const wikiReleases = 'http://aqwwiki.wikidot.com/new-releases';

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

exports.wikiReleases = wikiReleases;
exports.accountAq    = accountAq;
exports.designNotes  = designNotes;
exports.charLookup   = charLookup;

// Fixing file:// urls
function _getFileUrl(path) {
    return url.format({
        pathname: path,
        protocol: 'file:',
        slashes: true
    })
}

// For customizing windows themselfs
function _getWinConfig(type){
    //tab
    //win
    //main
    //cprint
    //const {width, height} = require("electron").screen.getPrimaryDisplay().workAreaSize; 
    return (type != "cprint")? 
    {
        width: 960,
        height: 550,
        icon: iconImage,
        webPreferences: {
            nodeIntegration: false,
            webviewTag: ((type == "tab")? true : false),
            plugins: true,
            javascript: true,
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegrationInWorker: false //maybe better performance for more instances in future... Needs testing.
        }
    }:
    {   
        // First off, yes, this is 4K res, no, it wont be your print size.
        // The window caps (in Cinnamon's Muffin at least) at your window size
        // And bc of that, i setted the number as high as i imagined w/o having the chance
        // of the OS complain about the 1 billion window size. I think 4k is a nice number...
        // Sec. YES, it NEEDS both Show off (so doesnt show in user's face) and
        // resizable false, so it stays "maxed size";
        
        width: 3840,
        height: 2160,
        show: false,
        resizable: false,
        webPreferences: {
            nodeIntegration: false,
            plugins: true,
            javascript: true,
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegrationInWorker: false,
            preload: path.join(appRoot,'res','preload_charpage.js'),
        }
    }
}

exports.tabbedConfig = _getWinConfig("tab");
exports.winConfig    = _getWinConfig("win");
exports.mainConfig   = _getWinConfig("main");
exports.charConfig   = _getWinConfig("cprint");

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
        }, // Sorry Mac, you cant have those next ones as its not worth it.
        {
            label: 'Wiki (New Releases)',
            click() {
                var br = BrowserWindow.getFocusedWindow().webContents;
                br.loadURL(wikiReleases);
            }
        },
        {
            label: 'Design notes',
            click() {
                var br = BrowserWindow.getFocusedWindow().webContents;
                br.loadURL(designNotes);
            }
        },
        {
            label: 'Char pages',
            click() {
                var br = BrowserWindow.getFocusedWindow().webContents;
                br.loadURL(charLookup);
            }
        },
        {
            label: 'AQW Account',
            click() {
                var br = BrowserWindow.getFocusedWindow().webContents;
                br.loadURL(accountAq);
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
