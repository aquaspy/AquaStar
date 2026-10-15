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
// Keep mutable data outside the installation. This also works for portable/readonly
// installs and avoids replacing files that an older AquaStar still expects.
const appDataDirectory = path.join(app.getPath("appData"), appName);
if (!fs.existsSync(appDataDirectory)) fs.mkdirSync(appDataDirectory, { recursive: true });
// A downloaded update is staged as ruffle-next while the app is running. Promote
// it only on the next launch, so no browser process ever reads files mid-replace.
const stagedRuffleDirectory = path.join(appDataDirectory, 'ruffle-next');
const currentRuffleDirectory = path.join(appDataDirectory, 'ruffle-current');
const restoreBundledRuffleMarker = path.join(appDataDirectory, 'restore-bundled-ruffle');
if (fs.existsSync(restoreBundledRuffleMarker)) {
    try {
        if (fs.existsSync(currentRuffleDirectory)) fs.rmdirSync(currentRuffleDirectory, { recursive: true });
        if (fs.existsSync(stagedRuffleDirectory)) fs.rmdirSync(stagedRuffleDirectory, { recursive: true });
        fs.unlinkSync(restoreBundledRuffleMarker);
    } catch (e) { console.log('[AquaStar] Could not restore bundled Ruffle: ' + e.message); }
} else if (fs.existsSync(path.join(stagedRuffleDirectory, 'ruffle.js'))) {
    try {
        if (fs.existsSync(currentRuffleDirectory)) fs.rmdirSync(currentRuffleDirectory, { recursive: true });
        fs.renameSync(stagedRuffleDirectory, currentRuffleDirectory);
    } catch (e) { console.log('[AquaStar] Could not activate downloaded Ruffle: ' + e.message); }
}

/// Pictures save location.
const sshotPath   = path.join(app.getPath("pictures"),"AquaStar Screenshots");
const iconPath    = path.join(appRoot, 'Icon', (isDebugBuild)? 'Icondeb_1024.png' : 'Icon_1024.png');
const iconRedPath = path.join(appRoot, 'Icon', 'Iconred_1024.png');

const githubPage   = "https://github.com/aquaspy/AquaStar/releases";

// Export farm

exports.githubPage       = githubPage;

exports.appName          = appName;
exports.appVersion       = appVersion;
exports.appRootPath      = appRoot;
exports.appDirectoryPath = appCurrentDirectory;
exports.appDataDirectory = appDataDirectory;
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
// Exported for res/windows/config.js to build window URLs with -
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
// opts: optional { wmode, scale } forwarded to swf_wrapper.html query string.
// Plugins pick the options per game through their wrap config; the default is wmode=direct.
// The wrapper's base= param keeps relative loads resolving against the game's own origin.
exports.wrapSwfUrl = function(swfUrl, opts) {
    if (!swfUrl) return swfUrl;
    var q = '?swf=' + encodeURIComponent(swfUrl);
    if (opts && opts.wmode) q += '&wmode=' + encodeURIComponent(opts.wmode);
    if (opts && opts.scale) q += '&scale=' + encodeURIComponent(opts.scale);
    return swfWrapperUrl + q;
}

// Ruffle (open-source Flash emulator) as an alternative to the PPAPI Flash plugin -
// see res/ruffle_wrapper.html. Covers the active plugin's Flash games when Settings →
// renderMode is "ruffle".
const ruffleWrapperUrl = _getFileUrl(path.join(appRoot, 'res', 'ruffle_wrapper.html'));
exports.isRuffleEligible = function(swfUrl) {
    if (!swfUrl) return false;
    // HTML/stage pages are never Ruffle SWF targets.
    if (!/\.swf(\?|#|$)/i.test(swfUrl)) return false;
    // Eligibility is the active plugin's call: any game it owns (primary or launch), unless
    // its wrap config opts out with ruffleEligible: false.
    try {
        const entry = require('./platform').pluginRuntime.findGameEntry(swfUrl);
        return !!entry && !(entry.wrap && entry.wrap.ruffleEligible === false);
    } catch (e) { return false; }
}
// ruffleOpts: the owning plugin's wrap.ruffle ({ socket: { serversApi, fallbackHosts, policyPort } }).
exports.wrapRuffleUrl = function(swfUrl, ruffleOpts) {
    if (!swfUrl) return swfUrl;
    const cfg = ruffleOpts && ruffleOpts.socket ? { socket: ruffleOpts.socket } : {};
    return ruffleWrapperUrl + '?swf=' + encodeURIComponent(swfUrl) +
        '&cfg=' + encodeURIComponent(JSON.stringify(cfg)) +
        '&proxy=' + encodeURIComponent(socketProxy.proxyUrl) +
        '&ruffle=' + encodeURIComponent(exports.rufflePlayerUrl);
}

/// -------------------------------
/// Section 2 - Original KeyBindings and Custom swf stuff
/// -------------------------------

// Platform-only defaults. Game/plugin keybinds are registered by the active plugin via
// host.registerKeybindDefaults.
const originalKeybinds = {
    about:       "F9",
    fullscreen:  "F11",
    sshot:       "F2",
    reload:      [
        "CmdOrCtrl+F5",
        "CmdOrCtrl+R"
    ],
    reloadCache: "CmdOrCtrl+Shift+F5",
    forward:     "Alt+F",
    backward:    "Alt+B",
    help : [
        "Alt+H",
        "CmdOrCtrl+H",
        "F1"
    ],
    settings: "Alt+9",
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

const ruffleUpdateChannels = {
    latest:  { label: 'Latest (Stable)' },
    nightly: { label: 'Nightly (Experimental)' }
};
exports.ruffleUpdateChannelChoices = Object.keys(ruffleUpdateChannels).map((id) => (
    { id: id, label: ruffleUpdateChannels[id].label }
));

exports.appLanguageChoices = [
    { id: 'system', label: 'System default' },
    { id: 'en-US', label: 'English' },
    { id: 'pt-BR', label: 'Português (Brasil)' }
];

// Non-keybind settings. Saved to the same aquastar.json file as the keybinds
// above, but shown in the Settings screen as plain fields instead of recorders.
const originalOptions = {
    // UI language: "system" follows OS; otherwise an explicit catalog id (en-US, pt-BR).
    appLanguage:       "system",

    // Optional URL override for the active plugin's primary game. Ignored when a
    // local SWF override is active — see plugin-runtime getPrimaryUrl().
    customUrl:         "",
    recordingFormat:   exports.defaultRecordingFormat,
    renderMode:        exports.defaultRenderMode,
    ruffleUpdateChannel: 'latest',
    ruffleAutoUpdate:  true,
    // Native menu bar on game windows (mirrors shortcuts). Default on.
    showGameMenu:      true,
    // Dev-only escape hatch, warned about on enable in the Settings screen.
    // Keep this key last - new options should be added above it.
    enableDevTools:    false
}
exports.originalOptions = originalOptions;

// Finding out which one to load and if it should load...
var keybingJsonFileName = appName.toLocaleLowerCase() + '.json';
var legacyAppdataJsonPath = path.join(app.getPath("appData"), keybingJsonFileName);
var appdataJsonPath = path.join(appDataDirectory, keybingJsonFileName);
var inPathJsonPath  = path.join(appCurrentDirectory, keybingJsonFileName);
// One-time non-destructive migration. App-directory files remain readable so old
// portable installations continue to work; the new canonical copy is independent.
if (!fs.existsSync(appdataJsonPath)) {
    var migrationSource = fs.existsSync(inPathJsonPath) ? inPathJsonPath : legacyAppdataJsonPath;
    if (fs.existsSync(migrationSource)) {
        try { fs.copyFileSync(migrationSource, appdataJsonPath); }
        catch (e) { console.log('[AquaStar] Could not migrate settings: ' + e.message); }
    }
}
var listValidKeybindLocations = [];
if (fs.existsSync(legacyAppdataJsonPath)) { listValidKeybindLocations.push(legacyAppdataJsonPath) }
if (fs.existsSync(inPathJsonPath))        { listValidKeybindLocations.push(inPathJsonPath) }
if (fs.existsSync(appdataJsonPath))       { listValidKeybindLocations.push(appdataJsonPath) }

exports.listValidKeybindLocations = listValidKeybindLocations;
exports.appdataJsonPath = appdataJsonPath;
exports.inPathJsonPath  = inPathJsonPath;
exports.legacyAppdataJsonPath = legacyAppdataJsonPath;

// The bundled web/WASM player is always the safe fallback. A downloaded stable
// or nightly build is selected only after validation and promotion at startup.
const bundledRufflePlayerPath = path.join(appRoot, 'res', 'ruffle', 'ruffle.js');
const downloadedRufflePlayerPath = path.join(currentRuffleDirectory, 'ruffle.js');
exports.rufflePlayerUrl = _getFileUrl(fs.existsSync(downloadedRufflePlayerPath)
    ? downloadedRufflePlayerPath : bundledRufflePlayerPath);
exports.ruffleDirectory = appDataDirectory;

// Local SWF override (Settings → Custom SWF File). The lookup lives in customSwf.js; the
// active plugin's manifest may add older file names via setCustomSwfAliases().
const customSwf = require('./customSwf.js').createCustomSwf({
    appDataDirectory: appDataDirectory,
    appCurrentDirectory: appCurrentDirectory,
    toFileUrl: _getFileUrl
});
exports.setCustomSwfAliases = function (aliases) { customSwf.setAliases(aliases); };
// Where Settings writes a newly chosen SWF.
exports.customSwfPath = customSwf.managedPath;
exports.removeCustomSwfFiles = function () { customSwf.removeAll(); };
// The platform applies the override on top of the active plugin's primary game (see
// res/platform/plugin-runtime.js getPrimaryUrl()). Live getters: aliases can arrive after load.
Object.defineProperty(exports, 'activeCustomSwfPath', { enumerable: true, get: function () { return customSwf.activePath(); } });
Object.defineProperty(exports, 'customSwfUrl', { enumerable: true, get: function () { return customSwf.url(); } });
Object.defineProperty(exports, 'hasCustomSwf', { enumerable: true, get: function () { return customSwf.activePath() !== null; } });

/// -------------------------------
/// Section 3 - Locale stuff
/// -------------------------------

exports.setLocale = (loc, keyb) => {
    locale.detectLang(loc, keyb);
    // Title messages are the only locale strings still consumed from const.js -
    // instances.js reads them for window-notification text. Menu/dialog/settings
    // messages are read straight from locale.strings by the modules that actually
    // build that UI (res/windows/menu.js, the Settings window).
    exports.titleMessages = locale.strings.titleMessages;
}
