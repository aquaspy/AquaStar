const {app}  = require("electron");
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
exports.heromart         = heromart;
exports.battleon         = battleon;
exports.calendar         = calendar;
exports.dailyGifts       = dailyGifts;
exports.forgeEnchants    = forgeEnchants;
exports.twtAlina         = twtAlina;
exports.redditAqw        = redditAqw;

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
// Exported for res/windows/config.js to build the settings/reminders window URLs with -
// keeps the file://-URL-building logic in one place instead of duplicated per module.
exports.toFileUrl = _getFileUrl;

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
// audio loopback - Windows only, see res/features/capture/preload_capture.js) - Opus muxes fine into both containers.
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
/// Section 3 - Locale stuff
/// -------------------------------

exports.setLocale = (loc, keyb) => {
    locale.detectLang(loc, keyb);
    // Title messages are the only locale strings still consumed from const.js -
    // instances.js reads them for window-notification text. Menu/dialog/settings/
    // reminders messages are read straight from locale.strings by the modules that
    // actually build that UI (res/windows/menu.js, the Settings/Reminders windows).
    exports.titleMessages = locale.strings.titleMessages;
}
