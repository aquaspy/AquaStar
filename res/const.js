const {app, BrowserWindow}  = require("electron");
const path   = require("path");
const locale = require("./locale.js");
const fs     = require("fs");
const url    = require("url");

/// Inside the app itself. Root of the project
const appRoot = __dirname.substring(0,__dirname.lastIndexOf(path.sep));
/// Where app is ran from.
const appCurrentDirectory = process.cwd();
const appVersion  = require('electron').app.getVersion();
const appName     = "AquaStar";

/// Pictures save location.
const sshotPath = path.join(app.getPath("pictures"),"AquaStar Screenshots");
const iconPath  = path.join(appRoot, 'Icon', 'Icon_1024.png');

const charLookup   = 'https://account.aq.com/CharPage';
const designNotes  = 'https://www.aq.com/gamedesignnotes/';
const accountAq    = 'https://account.aq.com/';
const wikiReleases = 'http://aqwwiki.wikidot.com/new-releases';
const aqwg         = 'https://aqwg.weebly.com/';
exports.vanillaAQW = 'https://www.aq.com/game/gamefiles/Loader.swf'
exports.df_url     = 'https://play.dragonfable.com/game/DFLoader.swf'
exports.pagesPath  =  _getFileUrl(path.join(appRoot, 'pages', 'pages.html'))

exports.wikiReleases     = wikiReleases;
exports.accountAq        = accountAq;
exports.designNotes      = designNotes;
exports.charLookup       = charLookup;
exports.aqwg             = aqwg;

exports.appName          = appName;
exports.appVersion       = appVersion;
exports.appRootPath      = appRoot;
exports.appDirectoryPath = appCurrentDirectory;
exports.sshotPath        = sshotPath;

const keyBinds = {
    wiki:        "Alt+W",
    account:     "Alt+A",
    design:      "Alt+D",
    charpage:    "Alt+P",
    newAqlite:   "Alt+N",
    newAqw:      "Alt+Q",
    newTabbed:   "Alt+Y",
    about:       "F9",
    fullscreen:  "F11",
    sshot:       "F2",
    cpSshot:     "Alt+K",
    reload:      "CmdOrCtrl+F5",
    reload2:     "CmdOrCtrl+R", // Here bc FireFox uses it.
    reloadCache: "CmdOrCtrl+Shift+F5",
    dragon:      "Alt+1",
    foward:      "Alt+F",
    backward:    "Alt+B",
    help : [
        "Alt+H",
        "CmdOrCtrl+H",
        "F1"
    ]
}
exports.keyBinds = keyBinds;

var oldAqlite = fs.existsSync( path.join(appCurrentDirectory,'aqlite_old.swf'));
exports.aqlitePath = oldAqlite ? 
            _getFileUrl(path.join(appCurrentDirectory, 'aqlite_old.swf')) :
            //_getFileUrl(path.join(appRoot, 'aqlite.swf'))
            'https://game.aq.com/game/gamefiles/Loader_Spider.swf';
exports.isOldAqlite = oldAqlite;

/// Icon Stuff
//const nativeImage = require('electron').nativeImage;
//var iconImage = nativeImage.createFromPath(iconPath);
//    iconImage.setTemplateImage(true);
exports.iconPath = iconPath;

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
    return (type != "cprint")? 
    {
        width: 960,
        height: 550,
        icon: iconPath,
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

exports.getMenu = (funcTakeSS, isContext = false) => {
    // needs to be like that as the function is located on instances... arg is isFoward
    // Mac uses a forced keybind here, while the others can use the & symbol and have the same keybind NATIVE to the app.
    if (isContext == false && process.platform == 'darwin') return null;

    var links = 
    [
        {
            //TODO - change for accelerator instead of &. better for translations!
            label: '<<< ' + menuMessages.backward,
            accelerator: keyBinds.backward,
            click(menuItem,focusedWin) {
                var br = focusedWin.webContents;
                if (br.canGoBack()) br.goBack();
            } 
        },
        {
            label: '>>> ' + menuMessages.foward,
            accelerator: keyBinds.foward,
            click(menuItem,focusedWin) {
                var br = focusedWin.webContents;
                if (br.canGoForward()) br.goForward();
            }
        }, // Sorry Mac, you cant have those next ones as its not worth it.
        {
            label: menuMessages.otherPages,
            submenu: [
                {
                    label: menuMessages.wiki,
                    click(menuItem,focusedWin) {
                        focusedWin.webContents.loadURL(wikiReleases);
                    }
                },
                {
                    label: menuMessages.design,
                    click(menuItem,focusedWin) {
                        focusedWin.webContents.loadURL(designNotes);
                    }
                },
                {
                    label: menuMessages.account,
                    click(menuItem,focusedWin) {
                        focusedWin.webContents.loadURL(accountAq);
                    }
                },
                {
                    label: menuMessages.charpage,
                    click(menuItem,focusedWin) {
                        focusedWin.webContents.loadURL(charLookup);
                    }
                },
                {
                    // Just a bonus. no keybind or anything.
                    label: menuMessages.aqwg,
                    click(menuItem,focusedWin) {
                        focusedWin.webContents.loadURL(aqwg);
                    }
                }
            ]
        },
        {
            label: menuMessages.takeCPSshot,
            accelerator: keyBinds.cpSshot,
            click() {
                funcTakeSS();
            }
        }
    ];
    var ret;
    if (isContext){
        ret = [
           {
                label: menuMessages.copyPageURL,
                click(menuItem,focusedWin) {
                    require('electron').clipboard.writeText(
                        focusedWin.webContents.getURL(),'clipboard');
                }
           }
        ];
        ret.push({ type: 'separator' });
        links.forEach((e) => {
            ret.push(e);
        });
        return ret;
    }
    else return links;
}

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

let menuMessages;
// LOCALE SETUP
exports.setLocale        = (loc, keyb)=> {
    locale.detectLang(loc,keyb);
    exports.titleMessages = {
        invalidCharpage:  locale.getInvalidCharpage,
        loadingCharpage:  locale.getLoadingCharpage,
        buildingCharpage: locale.getBuildingCharpage,
        cpDone:           locale.getCPDone,
        doneSavedAs :     locale.getDoneSavedAs
    }    
    menuMessages = {
        backward:     locale.getMenuBackward,
        foward:       locale.getMenuFoward,
        otherPages:   locale.getMenuOtherPages,
        wiki:         locale.getMenuWiki,
        design:       locale.getMenuDesign,
        account:      locale.getMenuAccount,
        charpage:     locale.getMenuCharpage,
        aqwg:         locale.getMenuGuide,
        takeCPSshot:  locale.getMenuTakeShot,
        copyPageURL:  locale.getMenuCopyURL
    }
    exports.menuMessages = menuMessages;
}
