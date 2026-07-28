const {app, BrowserWindow}  = require("electron");
const path        = require("path");
const locale      = require("./locale.js");
const fs          = require("fs");
const url         = require("url");
const socketProxy = require("./socketProxy.js");

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
const wikiReleases = 'http://aqwwiki.wikidot.com/new-releases';

// Extra usefull links
const heromart     = 'https://www.heromart.com/';
const battleon     = 'https://portal.battleon.com/';
const calendar     = 'https://www.aq.com/lore/calendar';
const dailyGifts   = 'https://www.aq.com/lore/dailygifts';
const forgeEnchants= 'https://www.aq.com/lore/guides/enhancementtraits';

// Social Media stuff
const twtAlina     = "https://twitter.com/Alina_AE";
const redditAqw    = "https://www.reddit.com/r/AQW/";

//exports.vanillaAQW = 'https://www.aq.com/game/gamefiles/Loader.swf'
Object.defineProperty(exports, 'testingAQW', {
    get() {
        // Random ending between 100 and 999. Prevents browser cache per load.
        return 'https://game.aq.com/game/gamefiles/Loader_Spider.swf?ver=' +
               (Math.floor(Math.random() * 900) + 100);
    }
});
exports.df_url     = 'https://play.dragonfable.com/game/DFLoader.swf?ver=2'

// Export farm

exports.githubPage       = githubPage;
exports.wikiReleases     = wikiReleases;
exports.accountAq        = accountAq;
exports.designNotes      = designNotes;
exports.charLookup       = charLookup;

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

// Lets DevTools be opened on startup without needing an actual Debug build -
// set via the "enableDevTools" flag in aquastar.json. See KEYBINDING.md.
var isDevToolsEnabled = false;
exports.isDevToolsEnabled = isDevToolsEnabled;
exports.enableDevTools = () => {
    isDevToolsEnabled = true;
    exports.isDevToolsEnabled = true;
}

// Performance: wmode=direct via HTML wrapper (enabled by default)
exports.useDirectWmode = true;
exports.setUseDirectWmode = (val) => {
    exports.useDirectWmode = val !== false;
}

const swfWrapperUrl = _getFileUrl(path.join(appRoot, 'res', 'swf_wrapper.html'));
exports.wrapSwfUrl = function(swfUrl) {
    if (!swfUrl) return swfUrl;
    return swfWrapperUrl + '?swf=' + encodeURIComponent(swfUrl);
}

// Ruffle (open-source Flash emulator) as an alternative to the PPAPI Flash plugin -
// see res/ruffle_wrapper.html. Only covers what AquaStar loads directly (main AQW,
// new instance, Testing AQW); DragonFable is intentionally left out for now, and the
// AQW Char Page already loads Ruffle unconditionally from Artix's own page regardless
// of this setting, so it needs no wrapper of its own.
const ruffleWrapperUrl = _getFileUrl(path.join(appRoot, 'res', 'ruffle_wrapper.html'));
exports.isRuffleEligible = function(swfUrl) {
    if (!swfUrl) return false;
    if (swfUrl === exports.mainPath) return true;
    // testingAQW carries a random cache-busting "?ver=" suffix per call, so match by prefix.
    if (swfUrl.indexOf('https://game.aq.com/game/gamefiles/Loader_Spider.swf') === 0) return true;
    return false;
}
exports.wrapRuffleUrl = function(swfUrl) {
    if (!swfUrl) return swfUrl;
    return ruffleWrapperUrl + '?swf=' + encodeURIComponent(swfUrl) +
        '&proxy=' + encodeURIComponent(socketProxy.proxyUrl);
}

exports.settingsUrl  = _getFileUrl(path.join(appRoot, 'res', 'settings.html'));
exports.remindersUrl = _getFileUrl(path.join(appRoot, 'res', 'reminders.html'));

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
    reminders: "Alt+T",
    record:   "Ctrl+J"
}
exports.originalKeybinds = originalKeybinds;

// Screen recording (Ctrl+J) format choices, shown as a <select> in Settings.
// Verified against this Electron's bundled Chromium via MediaRecorder.isTypeSupported() -
// real "video/mp4" muxing isn't available (would need a much newer Chromium than the one
// bundled here, which would drop PPAPI Flash support - see flash.js). H.264/MKV is kept
// as the default since H.264 is by far the most widely compatible codec of the three.
// audioMimeType is used when the capture stream actually got an audio track (desktop
// audio loopback - Windows only, see preload_capture.js) - Opus muxes fine into both containers.
const recordingFormats = {
    'h264-mkv': { mimeType: 'video/x-matroska;codecs=avc1', audioMimeType: 'video/x-matroska;codecs=avc1,opus', extension: 'mkv',  label: 'MKV (H.264)' },
    'vp9-webm': { mimeType: 'video/webm;codecs=vp9',        audioMimeType: 'video/webm;codecs=vp9,opus',        extension: 'webm', label: 'WebM (VP9)'  },
    'vp8-webm': { mimeType: 'video/webm;codecs=vp8',        audioMimeType: 'video/webm;codecs=vp8,opus',        extension: 'webm', label: 'WebM (VP8)'  }
}
exports.recordingFormats = recordingFormats;
exports.defaultRecordingFormat = 'h264-mkv';
exports.recordingFormatChoices = Object.keys(recordingFormats).map((id) => (
    { id: id, label: recordingFormats[id].label }
));
exports.resolveRecordingFormat = function(id, hasAudio) {
    var fmt = recordingFormats[id] || recordingFormats[exports.defaultRecordingFormat];
    return {
        mimeType:  (hasAudio && fmt.audioMimeType) ? fmt.audioMimeType : fmt.mimeType,
        extension: fmt.extension
    };
}

// Which Flash runtime to use for the SWFs AquaStar loads directly, shown as a <select>
// in Settings. "flash" (default) keeps the exact current PPAPI plugin behavior. "ruffle"
// is new and marked experimental - see isRuffleEligible()/wrapRuffleUrl() above.
const renderModes = {
    'flash':  { label: 'Flash Player' },
    'ruffle': { label: 'Ruffle (Experimental)' }
}
exports.renderModes = renderModes;
exports.defaultRenderMode = 'flash';
exports.renderModeChoices = Object.keys(renderModes).map((id) => (
    { id: id, label: renderModes[id].label }
));

// Non-keybind settings. Saved to the same aquastar.json file as the keybinds
// above, but shown in the Settings screen as plain fields instead of recorders.
const originalOptions = {
    playerCharacter:   "",
    featurePlayerName: false,
    recordingFormat:   exports.defaultRecordingFormat,
    renderMode:        exports.defaultRenderMode,
    // Dev-only escape hatch, warned about on enable in the Settings screen.
    // Keep this key last - new options should be added above it.
    enableDevTools:    false
}
exports.originalOptions = originalOptions;

// Keeps only what's safe to drop straight into a URL query string / window title -
// matches the input filter on the Settings screen's Player Character field.
function _sanitizePlayerCharacter(raw) {
    if (raw == null) return '';
    return String(raw).trim().replace(/[^a-zA-Z0-9]/g, '');
}
exports.buildCharLookupUrl = function(playerCharacter) {
    var id = _sanitizePlayerCharacter(playerCharacter);
    return id === '' ? charLookup : charLookup + '?id=' + encodeURIComponent(id);
}

// When featurePlayerName is on and a Player Character is set, it replaces "AquaStar"
// in the main window's title. Falls back to the app name otherwise.
exports.resolveAppDisplayName = function(k) {
    if (!k || k.featurePlayerName !== true) return appName;
    var id = _sanitizePlayerCharacter(k.playerCharacter);
    return id === '' ? appName : id;
}

// Finding out which one to load and if it should load...
var keybingJsonFileName = appName.toLocaleLowerCase() + '.json';
var appdataJsonPath = path.join(app.getPath("appData"), keybingJsonFileName)
var inPathJsonPath  = path.join(appCurrentDirectory, keybingJsonFileName);
var listValidKeybindLocations = [];
if (fs.existsSync(appdataJsonPath)) { listValidKeybindLocations.push(appdataJsonPath) }
if (fs.existsSync(inPathJsonPath))  { listValidKeybindLocations.push(inPathJsonPath)  }

exports.listValidKeybindLocations = listValidKeybindLocations;
exports.appdataJsonPath = appdataJsonPath;
exports.inPathJsonPath  = inPathJsonPath;

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
    if (type != "cprint") {
        const isGame = (type == "game" || type == "main");
        return {
            width: 960,
            height: 530,
            useContentSize: true,
            icon: iconPath,
            webPreferences: {
                nodeIntegration: false,
                sandbox: isGame ? false : true,
                webviewTag: false,
                preload: isGame ? path.join(appRoot, 'res', 'preload_capture.js') : path.join(appRoot, 'res', 'preload_wikiview.js'),
                // Plugins (Flash) enabled everywhere - Blame Char page breaking in a update or two.
                // AquaStar shouldnt navigate to random websites anyway. Not endorsed to.
                plugins: true,
                contextIsolation: true,
                backgroundThrottling: !isGame
            }
        };
    }
    return {
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
            sandbox: false,
            plugins: true,
            contextIsolation: true,
            preload: path.join(appRoot,'res','preload_charpage.js'),
        }
    };
}

exports.winConfig    = _getWinConfig("win");
exports.mainConfig   = _getWinConfig("main");
exports.charConfig   = _getWinConfig("cprint");
exports.gameConfig   = _getWinConfig("game");

// Settings screen - own preload, needed for IPC (read/write aquastar.json) under contextIsolation.
exports.settingsConfig = {
    width: 640,
    height: 680,
    useContentSize: true,
    icon: iconPath,
    resizable: true,
    webPreferences: {
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        preload: path.join(appRoot, 'res', 'preload_settings.js'),
        plugins: false,
        contextIsolation: true
    }
};

// Reminders screen - own preload, needed for IPC (read/write aquastar_reminders.json) under contextIsolation.
exports.remindersConfig = {
    width: 760,
    height: 620,
    useContentSize: true,
    icon: iconPath,
    resizable: true,
    webPreferences: {
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        preload: path.join(appRoot, 'res', 'preload_reminders.js'),
        plugins: false,
        contextIsolation: true
    }
};

exports.getMenu = (keybinds, funcTakeSS, isContext = false) => {
    // needs to be like that as the function is located on instances...
    if (isContext == false && process.platform == 'darwin') return null;

    function generateLink (label,link,keybind = null) {
        return {
            label: label,
            accelerator: keybind,
            // Show the shortcut hint only - don't actually bind it here. These keys
            // (wiki/design/account/charpage) already open a *new* window via
            // electron-localshortcut; letting the menu also register the accelerator
            // races that handler and can replace the current window's URL instead
            // (most visible once DevTools shifts window focus timing).
            registerAccelerator: false,
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
                        generateLink(menuMessages.menuForge,forgeEnchants),
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
        },
        {
            label: menuMessages.menuSettings,
            accelerator: keybinds.settings,
            click() {
                // Cant pull instances module at top level or else would be cyclical.
                require('./instances.js').openSettingsWindow();
            }
        },
        {
            label: menuMessages.menuReminders,
            accelerator: keybinds.reminders,
            click() {
                require('./instances.js').openRemindersWindow();
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

const { ipcMain, desktopCapturer, net } = require('electron');

// WikiView (wikiviewsource.js) needs to fetch AQW Wiki pages from windows whose
// origin is account.aq.com, where a page-side fetch() would be blocked by CORS.
// Doing the request here in the main process sidesteps that entirely - it's a
// plain HTTP request, not a browser fetch, so there's no origin to police.
// Locked to the wiki domain since this handler is reachable from any window
// that has the wikiview preload (see _getWinConfig) - it shouldn't become a
// general-purpose fetch proxy for whatever a loaded page asks for.
ipcMain.handle('fetchWikiPage', async (event, targetUrl) => {
    if (typeof targetUrl !== 'string' || !/^https?:\/\/aqwwiki\.wikidot\.com\//i.test(targetUrl)) {
        return { ok: false, error: 'blocked' };
    }

    return new Promise((resolve) => {
        const request = net.request(targetUrl);
        let body = '';
        request.on('response', (response) => {
            response.on('data', (chunk) => { body += chunk.toString(); });
            response.on('end', () => resolve({ ok: true, html: body }));
            response.on('error', (err) => resolve({ ok: false, error: err.message }));
        });
        request.on('error', (err) => resolve({ ok: false, error: err.message }));
        request.end();
    });
});

ipcMain.on('saveDialog', async function (event, arg) {
    const { dialog } = require('electron');
    const { canceled, filePath } = await dialog.showSaveDialog({
        buttonLabel: 'Save video',
        defaultPath: arg,
        filters: [{ name: 'WebM Video', extensions: ['webm'] }]
    });
    event.sender.send('saveDialogReply', canceled ? undefined : filePath);
});

ipcMain.on('saveRecording', function (event, filename, buffer) {
    fs.writeFileSync(filename, Buffer.from(buffer));
});

ipcMain.handle('getDesktopCapturerSourceForWindow', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    const sources = await desktopCapturer.getSources({ types: ['window'] });
    const title = win.getTitle();

    for (let i = 0; i < sources.length; i++) {
        if (sources[i].name === title) return { id: sources[i].id, name: sources[i].name };
    }
    for (let i = 0; i < sources.length; i++) {
        if (title && sources[i].name && sources[i].name.indexOf(title) !== -1) {
            return { id: sources[i].id, name: sources[i].name };
        }
    }
    for (let i = 0; i < sources.length; i++) {
        if (sources[i].name && sources[i].name.indexOf('AquaStar') !== -1) {
            return { id: sources[i].id, name: sources[i].name };
        }
    }
    return null;
});

var _wasRecording = false;
exports.wasRecording = () => {return _wasRecording};
exports.triggerRecording = (win) => {
    _wasRecording = !_wasRecording;
    const target = win || BrowserWindow.getFocusedWindow();
    if (target) target.webContents.send('record', _wasRecording);
}
