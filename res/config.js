// old const.js
const {app, BrowserWindow, dialog}  = require("electron");
const path   = require("path");
const locale = require("./locale.js");
const fs     = require("fs");
const url    = require("url");

// WARNING - ENABLES DEBUG MODE:
const isDebugBuild = true;
exports.isDebugBuild = isDebugBuild;

class constant {
    static appName     = "AquaStar";

    static appRoot = __dirname.substring(0,__dirname.lastIndexOf(path.sep)); // Inside the app itself. Root of the project
    static appCurrentDirectory = process.cwd(); // Where app is ran from.
    static appVersion  = require('electron').app.getVersion();

    // Imagery paths
    static sshotPath   = path.join(app.getPath("pictures"),"AquaStar Screenshots");
    static iconPath    = path.join(this.appRoot, 'Icon', (isDebugBuild)? 'Icondeb_1024.png' : 'Icon_1024.png');
    static iconRedPath = path.join(this.appRoot, 'Icon', 'Iconred_1024.png');

    /// Icon Setup
    static nativeImageIcon    = require('electron').nativeImage.createFromPath(this.iconPath)
    static nativeImageRedIcon = require('electron').nativeImage.createFromPath(this.iconRedPath);

    static githubPage   = "https://github.com/aquaspy/AquaStar/releases";

    // Links with keybinds
    static charLookup   = 'https://account.aq.com/CharPage';
    static designNotes  = 'https://www.aq.com/gamedesignnotes/';
    static accountAq    = 'https://account.aq.com/';
    static wikiReleases = 'http://aqwwiki.wikidot.com/new-releases';
    static wikiUrlBase  = 'aqwwiki.wikidot.com';// for custom filtering later

    // Extra usefull links
    static aqwg         = 'https://www.aqwg.net/home';
    static heromart     = 'https://www.heromart.com/';
    static battleon     = 'https://portal.battleon.com/';
    static calendar     = 'https://www.aq.com/lore/calendar';
    static dailyGifts   = 'https://www.aq.com/lore/dailygifts';
    static forgeEnchants= 'https://www.aq.com/lore/guides/enhancementtraits';

    // Social Media stuff
    static twtAlina     = "https://twitter.com/Alina_AE";
    static redditAqw    = "https://www.reddit.com/r/AQW/";

    // Other SWF
    static testingAQW = ('https://game.aq.com/game/gamefiles/Loader_Spider.swf?ver=' +
                            Math.floor(Math.random() * (900)) + 100); //random ending bt 100 and 1k. IT WAS ABOUT BROWSER CACHE!
                            // The above exists bc spider can mess up again the cache. so aqw WONT CACHE anymore.
    static df_url     = 'https://play.dragonfable.com/game/DFLoader.swf?ver=2'

    /// Saving SWF paths...
    static swflogPath = path.join(this.sshotPath,"SWFLogging");
    static isSwfLogEnabled = false;
    static enableSWFLogging() { this.isSwfLogEnabled = true;} // TODO - ffs. detect and remove it.

    // Custom aqlite stuff
    static isOldAqlite = fs.existsSync( path.join(this.appCurrentDirectory,'aqlite_old.swf'));
    static mainPath = this.isOldAqlite ? 
                this._getFileUrl(path.join(this.appCurrentDirectory, 'aqlite_old.swf')) :
                "https://game.aq.com/game/gamefiles/Loader3.swf?ver=a"
    
    // Fixing file:// urls. 
    // TODO: Make it non outdated. url.format is depracated.
    static _getFileUrl(path) {
        return url.format({
            pathname: path,
            protocol: 'file:',
            slashes: true
        })
    }

    static changeMainUrl(newAqUrl){
        if (!this.isOldAqlite) {
            this.mainPath = newAqUrl;
        }
    }

}
// Cant recall what this is for. but was needed last time XD
constant.nativeImageIcon.setTemplateImage(true)


/// -------------------------------
/// Section 2 - Locale stuff
/// -------------------------------

// Better for internal constjs usage
class localeStrings {
    static menuMessages
    static dialogMessages
    static titleMessages

    // Main window will call this first.
    static setLocale (loc,keyb){
        locale.detectLang(loc,keyb);
        const strings = locale.strings;
        // Title messages are only used on instances.js
        this.titleMessages = strings.titleMessages;

        // Menu messages are only used here
        this.menuMessages = strings.menuMessages;
        //exports.menuMessages = menuMessages;

        // Dialog messages are only used here
        this.dialogMessages = strings.dialogMessages;
    }
}

/// -------------------------------
/// Section 3 - Original KeyBindings and Custom swf stuff
/// -------------------------------

class keybind {
    static originalKeybinds = {
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

    // Finding out which one to load and if it should load...
    static keybindJsonFileName = constant.appName.toLocaleLowerCase() + '.json';
    static appdataJsonPath = path.join(app.getPath("appData"), this.keybindJsonFileName)
    static inPathJsonPath  = path.join(constant.appCurrentDirectory, this.keybindJsonFileName);

    static listValidKeybindLocations = []; // Setup below
}
const addKeybIfFsExists = (path) => {
    if (fs.existsSync(path)) { keybind.listValidKeybindLocations.push(path) }
}
addKeybIfFsExists(keybind.appdataJsonPath)
addKeybIfFsExists(keybind.inPathJsonPath)

/// -------------------------------
/// Section 4 - Window and Menu configuration
/// -------------------------------

class winconf {
    // For customizing windows themselfs
    // warning. DO. NOT. TOUCH. THIS. FUNCTION. EVERYTIME SOMETHING BREAKS.
    static _getWinConfig(type){
        // type is one of: [win,main,cprint,game]
        const preloadCapture = path.join(constant.appRoot,'res','preload_capture.js')
        const preloadWiki = path.join(constant.appRoot,'res','preload_wiki.js')

        return (type != "cprint")? 
        {
            width: 960,
            height: 530,
            useContentSize: true,
            icon: constant.iconPath,
            webPreferences: {
                nodeIntegration: false,
                sandbox:    true,
                webviewTag: false, 
                preload: ((["game","main"].includes(type))? preloadCapture: null),
                plugins: true,
                javascript: true,
                contextIsolation: true,
                enableRemoteModule: ((["game","main"].includes(type))? true : false), // Recording screen needs to save it.
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
            useContentSize: true,
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
                preload: path.join(constant.appRoot,'res','preload_charpage.js'),
            }
        }
    }

    static winConfig  = this._getWinConfig("win");
    static mainConfig = this._getWinConfig("main");
    static charConfig = this._getWinConfig("cprint");
    static gameConfig = this._getWinConfig("game");

    static getMenu(keybinds, funcTakeSS, isContext = false) {
        const menuMessages = localeStrings.menuMessages
        

        if (isContext == false && process.platform == 'darwin') return null;
        const generateLink = (label,link,keybind = null) => {
            return { label: label, accelerator: keybind,
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
                    generateLink(menuMessages.menuWiki, constant.wikiReleases, keybinds.wiki),
                    generateLink(menuMessages.menuDesign, constant.designNotes, keybinds.design),
                    generateLink(menuMessages.menuAccount, constant.accountAq, keybinds.account),
                    generateLink(menuMessages.menuCharpage, constant.charLookup, keybinds.charpage),
                    // No keybind now...
                    {type: 'separator'},
                    {
                        label: menuMessages.menuOtherPages2,
                        submenu: [
                            generateLink(menuMessages.menuDailyGifts, constant.dailyGifts),
                            generateLink(menuMessages.menuCalendar, constant.calendar),
                            generateLink(menuMessages.menuGuide, constant.aqwg),
                            generateLink(menuMessages.menuForge, constant.forgeEnchants),
                            generateLink(menuMessages.menuHeromart, constant.heromart),
                            generateLink(menuMessages.menuPortal, constant.battleon)
                        ]
                    },
                    {
                        label: menuMessages.menuSocialMedia,
                        submenu: [
                            generateLink(menuMessages.menuTwitter, constant.twtAlina),
                            generateLink(menuMessages.menuReddit, constant.redditAqw)
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
}

/// -------------------------------
/// Section 5 - Help and About menus
/// -------------------------------

class helpmsg {
    static showHelpMessage (win) {
        const dialogMessages = localeStrings.dialogMessages
        const dialog_options = {
            buttons: ['Ok'],
            title:   dialogMessages.helpTitle,
            message: dialogMessages.helpMessage,
            detail:  dialogMessages.helpDetail + "\n" +
                dialogMessages.helpCustomKeyPath + constant.appdataJsonPath + "\n" +
                dialogMessages.helpScreenshot + constant.sshotPath + "\n" + 
                dialogMessages.helpAqliteOld + constant.appCurrentDirectory 
        };
        dialog.showMessageBox(win,dialog_options);
    }

    static showAboutMessage(win) {
        const dialogMessages = localeStrings.dialogMessages
        const dialog_options = {
            buttons: [ dialogMessages.aboutClosePrompt,dialogMessages.aboutGithubPrompt],
            title:   dialogMessages.aboutTitle + constant.appVersion,
            message: dialogMessages.aboutMessage,
            detail:  dialogMessages.aboutDetail + constant.githubPage +'\n\n\n' +
            dialogMessages.aboutDebug + ":\n" +
            "OS   - " + process.platform + "\n" +
            "ARCH - " + process.arch     + "\n"
        };
        const response = dialog.showMessageBoxSync(win, dialog_options)
        if (response == 1){
            const newWin = new BrowserWindow(winconf.winConfig);
            newWin.setMenuBarVisibility(true);
            newWin.loadURL(constant.githubPage);
        }
    }
}

/// -------------------------------
/// Section 6 - IPC, or Inter Process Comunication. Way simpler than its name, trust me
/// -------------------------------

const { ipcMain } = require('electron');
// its just some registring of events and stuff. nothing big. Necessary for 

ipcMain.on('saveVideo', (ev, defPath, buffer) =>{
    var filename = dialog.showSaveDialogSync(null,{
        buttonLabel: 'Save video', 
        defaultPath: defPath
    })
    fs.writeFileSync(filename, buffer);
})


ipcMain.on('getTitleID', function (event, arg) {
    var curWindow = BrowserWindow.getFocusedWindow();
    if ([undefined,null].includes(curWindow)) {
        event.sender.send('getTitleIDReply', ["",0]);
    }
    else event.sender.send('getTitleIDReply', [curWindow.getTitle(), curWindow.id] );
});

class recording {
    static wasRecording = false
    // The event for the recording!
    static triggerRecording() {
        this.wasRecording = !this.wasRecording;
        BrowserWindow.getFocusedWindow().webContents.send('record', this.wasRecording);
    }
}

exports.constant = constant
exports.localeStrings = localeStrings
exports.keybind = keybind
exports.winconf = winconf
exports.helpmsg = helpmsg
exports.recording = recording