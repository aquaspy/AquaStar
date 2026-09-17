// Hybrid aquastar.json merge: platform top-level + plugins[activeId] overlay.
const { PLATFORM_RESERVED_KEYBIND_IDS } = require('./plugin-host.js');

const PLATFORM_OPTION_KEYS = {
    customUrl: true,
    recordingFormat: true,
    renderMode: true,
    ruffleUpdateChannel: true,
    ruffleAutoUpdate: true,
    showGameMenu: true,
    enableDevTools: true,
    useDirectWmode: true,
    swfLog: true,
    // Plugin system flags
    activePluginId: true,
    pluginSystem: true,
    enableLocalPlugins: true,
    allowLocalPluginOverride: true,
    trustedLocalPlugins: true
};

function isPlatformKey(key) {
    if (PLATFORM_RESERVED_KEYBIND_IDS[key]) return true;
    if (PLATFORM_OPTION_KEYS[key]) return true;
    return false;
}

/**
 * Merge settings for the active plugin.
 * Order: platformDefaults → pluginDefaults → top-level file → plugins[id] overlay.
 * Platform keys in top-level always win over plugins[id] for those keys.
 * Plugin keys: plugins[id] wins; fall back to top-level (legacy AQW).
 */
function mergeLoadedSettings(opts) {
    opts = opts || {};
    const activeId = opts.activePluginId || 'adventure-quest-worlds';
    const platformDefaults = opts.platformDefaults || {};
    const pluginDefaults = opts.pluginDefaults || {};
    const topLevel = opts.topLevel || {};
    const pluginSlice = (opts.plugins && opts.plugins[activeId]) || {};

    const merged = {};
    Object.assign(merged, platformDefaults);
    Object.assign(merged, pluginDefaults);

    Object.keys(topLevel).forEach(function (key) {
        if (key === 'plugins') return;
        merged[key] = topLevel[key];
    });

    Object.keys(pluginSlice).forEach(function (key) {
        if (isPlatformKey(key)) return; // platform top-level already applied; ignore nested platform
        merged[key] = pluginSlice[key];
    });

    // Re-apply platform keys from top-level so they win.
    Object.keys(topLevel).forEach(function (key) {
        if (key === 'plugins') return;
        if (isPlatformKey(key)) merged[key] = topLevel[key];
    });

    return merged;
}

/**
 * Split a flat changed map into top-level vs plugins[activeId] for save.
 */
function splitSavePatch(changed, activePluginId, existingFile) {
    existingFile = existingFile && typeof existingFile === 'object' ? existingFile : {};
    const topLevel = Object.assign({}, existingFile);
    if (!topLevel.plugins || typeof topLevel.plugins !== 'object') topLevel.plugins = {};
    const id = activePluginId || 'adventure-quest-worlds';
    const pluginSlice = Object.assign({}, topLevel.plugins[id] || {});

    Object.keys(changed || {}).forEach(function (key) {
        if (key === 'plugins') return;
        if (isPlatformKey(key)) {
            topLevel[key] = changed[key];
        } else {
            pluginSlice[key] = changed[key];
            // Keep legacy top-level copy for one release (dual-write) so older builds still read.
            topLevel[key] = changed[key];
        }
    });

    topLevel.plugins[id] = pluginSlice;
    return topLevel;
}

module.exports = {
    PLATFORM_OPTION_KEYS: PLATFORM_OPTION_KEYS,
    isPlatformKey: isPlatformKey,
    mergeLoadedSettings: mergeLoadedSettings,
    splitSavePatch: splitSavePatch
};
