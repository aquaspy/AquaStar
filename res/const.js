const {app, BrowserWindow}  = require("electron");
const path   = require("path");
const locale = require("./locale.js");
const fs     = require("fs");
const url    = require("url");

// WARNING - ENABLES DEBUG MODE:
const isDebugBuild = false;
//const isDebugBuild = true;
exports.isDebugBuild = isDebugBuild;

/// -------------------------------
/// Section 1 - Setup of URLs and files
/// -------------------------------

/// Inside the app itself. Root of the project
const appRoot = __dirname.substring(0,__dirname.lastIndexOf(path.sep));
/// Where app is ran from.
const appCurrentDirectory = process.cwd();
const appVersion  = require('electron').app.getVersion();
const appName     = "AquaStar";

/// Pictures save location.
const sshotPath   = path.join(app.getPath("pictures"),"AquaStar Screenshots");
const iconPath    = path.join(appRoot, 'Icon', (isDebugBuild)? 'Icondeb_1024.png' : 'Icon_1024.png');
const iconRedPath = path.join(appRoot, 'Icon', 'Iconred_1024.png');

const githubPage   = "https://github.com/aquaspy/AquaStar/releases";

// Links with keybinds
const charLookup   = 'https://account.aq.com/CharPage';
const designNotes  = 'https://www.aq.com/gamedesignnotes/';
const accountAq    = 'https://account.aq.com/';
const wikiReleases = 'https://aqwwiki.wikidot.com/new-releases';

// Extra usefull links
const aqwg         = 'https://aqwg.weebly.com/';
const heromart     = 'https://www.heromart.com/';
const battleon     = 'https://portal.battleon.com/';
const calendar     = 'https://www.aq.com/lore/calendar';
const dailyGifts   = 'https://www.aq.com/lore/dailygifts';

// Social Media stuff
const twtAlina     = "https://twitter.com/Alina_AE";
const redditAqw    = "https://www.reddit.com/r/AQW/";

//exports.vanillaAQW = 'https://www.aq.com/game/gamefiles/Loader.swf'
exports.testingAQW = ('https://game.aq.com/game/gamefiles/Loader_Spider.swf?ver=' +
                        Math.floor(Math.random() * (900)) + 100); //random ending bt 100 and 1k. IT WAS ABOUT BROWSER CACHE!
                        // The above exists bc spider can mess up again the cache. so aqw WONT CACHE anymore.
exports.df_url     = 'https://play.dragonfable.com/game/DFLoader.swf?ver=2'

// Export farm

exports.githubPage       = githubPage;
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

/// Icon Stuff
const nativeImage = require('electron').nativeImage.createFromPath(iconPath)
    nativeImage.setTemplateImage(true);
exports.iconPath = iconPath;
exports.nativeImageIcon    = nativeImage;
exports.nativeImageRedIcon = require('electron').nativeImage.createFromPath(iconRedPath);

// Fixing file:// urls
function _getFileUrl(path) {
    return url.format({
        pathname: path,
        protocol: 'file:',
        slashes: true
    })
}

/// Saving SWF pathes...

exports.swflogPath = path.join(sshotPath,"SWFLogging");
var isSwfLogEnabled = false;
exports.isSwfLogEnabled = isSwfLogEnabled;
exports.enableSWFLogging = () => {
    isSwfLogEnabled = true;
    exports.isSwfLogEnabled = true;
}

/// -------------------------------
/// Section 2 - Original KeyBindings and Custom swf stuff
/// -------------------------------

// Default values - Also present at aquastar_testing.json as a copy of easy access!
const originalKeybinds = {
    wiki:        "Alt+W",
    account:     "Alt+A",
    design:      "Alt+D",
    charpage:    "Alt+P",
    newAqw:      "Alt+N",
    newTest:     "Alt+Q",
    about:       "F9",
    fullscreen:  "F11",
    sshot:       "F2",
    cpSshot:     "Alt+K",
    reload:      [
        "CmdOrCtrl+F5",
        "CmdOrCtrl+R"
    ],
    reloadCache: "CmdOrCtrl+Shift+F5",
    dragon:      "Alt+1",
    forward:     "Alt+F",
    backward:    "Alt+B",
    help : [
        "Alt+H",
        "CmdOrCtrl+H",
        "F1"
    ],
    settings: "Alt+9", //TODO - Make a screen and do your stuff XD. This is for future proofing
    record:   "Ctrl+J"
}
exports.originalKeybinds = originalKeybinds;

// Finding out which one to load and if it should load...
var keybingJsonFileName = appName.toLocaleLowerCase() + '.json';
var appdataJsonPath = path.join(app.getPath("appData"), keybingJsonFileName)
var inPathJsonPath  = path.join(appCurrentDirectory, keybingJsonFileName);
var listValidKeybindLocations = [];
if (fs.existsSync(appdataJsonPath)) { listValidKeybindLocations.push(appdataJsonPath) }
if (fs.existsSync(inPathJsonPath))  { listValidKeybindLocations.push(inPathJsonPath)  }

exports.listValidKeybindLocations = listValidKeybindLocations;

// Custom aqlite stuff
var oldAqlite = fs.existsSync( path.join(appCurrentDirectory,'aqlite_old.swf'));
exports.mainPath = oldAqlite ? 
            _getFileUrl(path.join(appCurrentDirectory, 'aqlite_old.swf')) :
            "https://game.aq.com/game/gamefiles/Loader3.swf?ver=a"
exports.isOldAqlite = oldAqlite;

exports.changeMainUrl = function(newAqUrl){
    if (!oldAqlite) {
        exports.mainPath = newAqUrl;
    }
}

/// -------------------------------
/// Section 3 - Window and Menu configuration
/// -------------------------------

// For customizing windows themselfs
function _getWinConfig(type){
    //win
    //main
    //cprint
    //game
    return (type != "cprint")? 
    {
        width: 960,
        height: 550,
        icon: iconPath,
        webPreferences: {
            nodeIntegration: false,
            sandbox:    true,
            webviewTag: false, 
            preload: ((type == "game" || type == "main")? path.join(appRoot,'res','preload_capture.js'): null),
            plugins: true,
            javascript: true,
            contextIsolation: true,
            enableRemoteModule: ((type == "game" || type == "main")? true : false), // Recording screen needs to save it.
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
            sandbox: true,
            plugins: true,
            javascript: true,
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegrationInWorker: false,
            preload: path.join(appRoot,'res','preload_charpage.js'),
        }
    }
}

exports.winConfig    = _getWinConfig("win");
exports.mainConfig   = _getWinConfig("main");
exports.charConfig   = _getWinConfig("cprint");
exports.gameConfig   = _getWinConfig("game");

exports.getMenu = (keybinds, funcTakeSS, isContext = false) => {
    // needs to be like that as the function is located on instances...
    if (isContext == false && process.platform == 'darwin') return null;

    function generateLink (label,link,keybind = null) {
        return {
            label: label,
            accelerator: keybind,
            click(menuItem,focusedWin) {
                focusedWin.webContents.loadURL(link);
            }
        }
    }
    var links = 
    [
        {
            label: '<<< ' + menuMessages.menuBackward,
            accelerator: keybinds.backward,
            click(menuItem,focusedWin) {
                var br = focusedWin.webContents;
                if (br.canGoBack()) br.goBack();
            } 
        },
        {
            label: '>>> ' + menuMessages.menuFoward,
            accelerator: keybinds.forward,
            click(menuItem,focusedWin) {
                var br = focusedWin.webContents;
                if (br.canGoForward()) br.goForward();
            }
        }, // Sorry Mac, you cant have those next ones as its not worth it... There is still right click tho
        {
            label: menuMessages.menuOtherPages,
            submenu: [
                generateLink(menuMessages.menuWiki,wikiReleases,keybinds.wiki),
                generateLink(menuMessages.menuDesign,designNotes,keybinds.design),
                generateLink(menuMessages.menuAccount,accountAq,keybinds.account),
                generateLink(menuMessages.menuCharpage,charLookup,keybinds.charpage),
                // No keybind now...
                {type: 'separator'},
                {
                    label: menuMessages.menuOtherPages2,
                    submenu: [
                        generateLink(menuMessages.menuDailyGifts,dailyGifts),
                        generateLink(menuMessages.menuCalendar,calendar),
                        generateLink(menuMessages.menuGuide,aqwg),
                        generateLink(menuMessages.menuHeromart,heromart),
                        generateLink(menuMessages.menuPortal,battleon)
                    ]
                },
                {
                    label: menuMessages.menuSocialMedia,
                    submenu: [
                        generateLink(menuMessages.menuTwitter,twtAlina),
                        generateLink(menuMessages.menuReddit,redditAqw)
                    ]
                }
            ]
        },
        {
            label: menuMessages.menuTakeShot,
            accelerator: keybinds.cpSshot,
            click() {
                funcTakeSS();
            }
        }
    ];
    if (isContext){
        var ret = [
            {
                label: menuMessages.menuCopyURL,
                click(menuItem,focusedWin) {
                    require('electron').clipboard.writeText(
                        focusedWin.webContents.getURL(),'clipboard');
                }
            },
            {
                label: menuMessages.menuReloadPage,
                click(menuItem,focusedWin) {
                    focusedWin.reload();
                }
            },
            { type: 'separator' }
        ];
        ret.reverse().forEach((e) => {links.splice(0, 0, e)}); // Insert at the beginning
    }
    return links;
}

/// -------------------------------
/// Section 4 - Help and About menus
/// -------------------------------

function showHelpMessage(win){
    const dialog_options = {
        buttons: ['Ok'],
        title:   dialogMessages.helpTitle,
        message: dialogMessages.helpMessage,
        detail:  dialogMessages.helpDetail + "\n" +
            dialogMessages.helpCustomKeyPath + appdataJsonPath + "\n" +
            dialogMessages.helpScreenshot + sshotPath + "\n" + 
            dialogMessages.helpAqliteOld + appCurrentDirectory 
    };
    require('electron').dialog.showMessageBox(win,dialog_options);
}
function showAboutMessage(win) {
    const dialog_options = {
        buttons: [dialogMessages.aboutGithubPrompt, dialogMessages.aboutClosePrompt],
        title:   dialogMessages.aboutTitle + appVersion,
        message: dialogMessages.aboutMessage,
        detail:  dialogMessages.aboutDetail + githubPage +'\n\n\n' +
        dialogMessages.aboutDebug + ":\n" +
        "OS   - " + process.platform + "\n" +
        "ARCH - " + process.arch     + "\n"
    };
    
    // I wish the worse for who created Promisses and async stuff with such poor way to deal with them.
    // Now i have to do ugly and messy code. Good job. ASSHOLE
    // and no, sync version isnt available on our version. Freaking flash....
    require('electron').dialog.showMessageBox(win,dialog_options, (response) => {
        if (response != 0) return;

        // Cant pull instances module or else would be cyclical.
        const newWin = new BrowserWindow(_getWinConfig("win"));
        newWin.setMenuBarVisibility(true);
        newWin.loadURL(githubPage);
    });
}

exports.showHelpMessage  = showHelpMessage;
exports.showAboutMessage = showAboutMessage;

/// -------------------------------
/// Section 5 - Locale stuff
/// -------------------------------

// Better for internal constjs usage
let menuMessages;
let dialogMessages;

exports.setLocale        = (loc, keyb)=> {
    locale.detectLang(loc,keyb);
    const strings = locale.strings;

    // Title messages are only used on instances.js
    exports.titleMessages = strings.titleMessages;

    // Menu messages are only used here
    menuMessages = strings.menuMessages;
    //exports.menuMessages = menuMessages;

    // Dialog messages are only used here
    dialogMessages = strings.dialogMessages;
    //exports.dialogMessages = dialogMessages;
}

/// -------------------------------
/// Section 6 - IPC, or Inter Process Comunication. Way simpler than its name, trust me
/// -------------------------------

const { ipcMain } = require('electron');

ipcMain.on('getTitleID', function (event, arg) {
    var curWindow = BrowserWindow.getFocusedWindow();
    if (curWindow == null || curWindow == undefined) {
        event.sender.send('getTitleIDReply', ["",0]);
    }
    else {
        event.sender.send('getTitleIDReply', [curWindow.getTitle(), curWindow.id] );
    }
});

ipcMain.on('saveDialog', function (event, arg) {
    require('electron').dialog.showSaveDialog(null,{
        buttonLabel: 'Save video',
        defaultPath: arg
    }, (filename) => {
        event.sender.send('saveDialogReply', filename);
    })
});

var _wasRecording = false;
exports.wasRecording = () => {return _wasRecording};
exports.triggerRecording = () => {
    // The event for the recording!
    _wasRecording = !_wasRecording;
    BrowserWindow.getFocusedWindow().webContents.send('record', _wasRecording);
}
