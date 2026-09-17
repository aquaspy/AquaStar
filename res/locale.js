const path = require("path");

// Default is english.
let   lang       = "en-US";
let   pathToFile;
const langFolder = "po";

// Pending plugin catalogs keyed by locale id (e.g. 'en-US'). Applied in detectLang
// and whenever mergePluginLocales is called after strings are loaded.
let pendingPluginCatalog = null;

const PLATFORM_PROTECTED_NS = {
    platformMessages: true
};

const NESTED_MERGE_KEYS = {
    settingsMessages: ['labels', 'optionLabels', 'optionHints', 'optionWarnings'],
    menuMessages: null,
    dialogMessages: null
};

// Accelerators are kept as Electron's "CmdOrCtrl" internally (needed for key
// registration); only the text shown to the user in the F1 help dialog is
// swapped to the actual key for the OS its running on.
function _displayKeybinds(keyb){
    const modLabel = (process.platform === 'darwin') ? 'Cmd' : 'Ctrl';
    function fmt(v){
        return typeof v === 'string' ? v.replace(/CmdOrCtrl/g, modLabel) : v;
    }
    var display = {};
    Object.keys(keyb).forEach((k) => {
        display[k] = Array.isArray(keyb[k]) ? keyb[k].map(fmt) : fmt(keyb[k]);
    });
    return display;
}

function _mergeNamespace(target, source, ns) {
    if (source == null) return;
    const nested = NESTED_MERGE_KEYS[ns];
    if (nested === null || (Array.isArray(nested) && target && typeof target === 'object' &&
        source && typeof source === 'object' && typeof source !== 'function')) {
        const merged = Object.assign({}, target || {}, source);
        if (Array.isArray(nested)) {
            nested.forEach(function (key) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    merged[key] = Object.assign({}, (target && target[key]) || {}, source[key]);
                }
            });
        }
        return merged;
    }
    return source;
}

/**
 * Merge active-plugin locale catalogs into the loaded platform strings.
 * Catalog shape: { 'en-US': { remindersMessages: {...}, ... }, 'pt-BR': {...} }
 * Reserved platformMessages from a plugin are ignored with a warning.
 */
function mergePluginLocales(catalog) {
    if (!catalog || typeof catalog !== 'object') return;
    pendingPluginCatalog = catalog;
    if (!exports.strings) return;

    const plugin = catalog[lang] || catalog['en-US'];
    if (!plugin || typeof plugin !== 'object') return;

    Object.keys(plugin).forEach(function (ns) {
        if (PLATFORM_PROTECTED_NS[ns]) {
            console.log('[AquaStar:i18n] Ignoring plugin key under reserved namespace "' + ns + '"');
            return;
        }
        exports.strings[ns] = _mergeNamespace(exports.strings[ns], plugin[ns], ns);
    });
}

function resolveLangFile(requestedLang) {
    const fs = require('fs');
    const candidates = [];
    if (requestedLang) candidates.push(requestedLang);
    // pt → pt-BR, en → en-US, etc.
    if (requestedLang && requestedLang.indexOf('-') === -1) {
        if (requestedLang.toLowerCase() === 'pt') candidates.push('pt-BR');
        if (requestedLang.toLowerCase() === 'en') candidates.push('en-US');
        candidates.push(requestedLang + '-' + requestedLang.toUpperCase());
    } else if (requestedLang && requestedLang.indexOf('-') !== -1) {
        candidates.push(requestedLang.split('-')[0]);
    }
    candidates.push('en-US');
    for (let i = 0; i < candidates.length; i++) {
        const code = candidates[i];
        const filePath = path.join(__dirname, langFolder, code + '.js');
        if (fs.existsSync(filePath)) {
            return { code: code, filePath: filePath };
        }
    }
    return {
        code: 'en-US',
        filePath: path.join(__dirname, langFolder, 'en-US.js')
    };
}

function detectLang(systemLang, keyb){
    const resolved = resolveLangFile(systemLang);
    lang = resolved.code;
    pathToFile = resolved.filePath;
    let langFile;
    function loadPo(filePath) {
        // Fresh copy so prior plugin merges do not stick on the cached module.
        try { delete require.cache[require.resolve(filePath)]; } catch (e) { /* ignore */ }
        return require(filePath);
    }
    if (resolved.code !== systemLang) {
        console.log('[AquaStar:i18n] Locale "' + systemLang + '" → using "' + resolved.code + '"');
    }
    langFile = loadPo(pathToFile);

    exports.strings = langFile;

    // Apply plugin catalogs before materializing helpDetail (plugin may replace it).
    if (pendingPluginCatalog) {
        mergePluginLocales(pendingPluginCatalog);
    }

    // Platform helpDetail + optional plugin helpDetailExtra (appended).
    if (langFile.dialogMessages) {
        const keys = _displayKeybinds(keyb);
        let detail = '';
        if (typeof langFile.dialogMessages.helpDetail === 'function') {
            detail = langFile.dialogMessages.helpDetail(keys);
        } else if (typeof langFile.dialogMessages.helpDetail === 'string') {
            detail = langFile.dialogMessages.helpDetail;
        }
        const extra = langFile.dialogMessages.helpDetailExtra;
        if (typeof extra === 'function') {
            const extraText = extra(keys);
            if (extraText) detail = detail + (detail ? '\n\n' : '') + extraText;
        } else if (typeof extra === 'string' && extra) {
            detail = detail + (detail ? '\n\n' : '') + extra;
        }
        langFile.dialogMessages.helpDetail = detail;
    }

    return lang;
}

exports.detectLang = detectLang;
exports.mergePluginLocales = mergePluginLocales;
exports.getLang = function () { return lang; };
