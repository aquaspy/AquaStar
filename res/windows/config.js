// BrowserWindow configs + file:// URLs for every window AquaStar opens. Split out of
// const.js so window-shape concerns live in one place instead of mixed in with app-wide
// constants, keybind defaults, and IPC handlers.
const path     = require('path');
const constant = require('../const.js');

const appRoot   = constant.appRootPath;
const iconPath  = constant.iconPath;
const toFileUrl = constant.toFileUrl;

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
                preload: isGame ?
                    path.join(appRoot, 'res', 'features', 'capture', 'preload_capture.js') :
                    path.join(appRoot, 'res', 'features', 'wikiview', 'preload_wikiview.js'),
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
            preload: path.join(appRoot, 'res', 'features', 'charpage', 'preload_charpage.js'),
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
        preload: path.join(appRoot, 'res', 'features', 'settings', 'preload_settings.js'),
        plugins: false,
        contextIsolation: true
    }
};
exports.settingsUrl = toFileUrl(path.join(appRoot, 'res', 'features', 'settings', 'settings.html'));

// Reminders screen - own preload, needed for IPC (read/write aquastar_reminders.json) under contextIsolation.
// Width needs to fit every fixed-width quest-row column (type/category/seasonal badges,
// /join box, copy/switch/time, Hide/Delete buttons) plus a readable amount of quest name
// text, or the name column gets squeezed down to near-nothing by its flex-shrink.
exports.remindersConfig = {
    width: 1040,
    height: 620,
    useContentSize: true,
    icon: iconPath,
    resizable: true,
    webPreferences: {
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        preload: path.join(appRoot, 'res', 'features', 'reminders', 'preload_reminders.js'),
        plugins: false,
        contextIsolation: true
    }
};
exports.remindersUrl = toFileUrl(path.join(appRoot, 'res', 'features', 'reminders', 'reminders.html'));

// To-Do screen - same per-character list shape as Reminders (see
// res/features/common/list_window_common.js) but without the type/join/time columns, so a
// narrower window still fits its own fixed-width columns (priority star, category, seasonal).
exports.todoConfig = {
    width: 960,
    height: 620,
    useContentSize: true,
    icon: iconPath,
    resizable: true,
    webPreferences: {
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        preload: path.join(appRoot, 'res', 'features', 'todo', 'preload_todo.js'),
        plugins: false,
        contextIsolation: true
    }
};
exports.todoUrl = toFileUrl(path.join(appRoot, 'res', 'features', 'todo', 'todo.html'));

// Inventory screen - same per-character list shape as Reminders/Todo. Own preload merges
// the synced-data bridge (aquastarInventory) with a re-exposed aquastarWiki.fetchWikiPage
// so hover-preview (res/features/wikiview/hoverPreview.js) works inside this window too.
exports.inventoryConfig = {
    width: 1040,
    height: 620,
    useContentSize: true,
    icon: iconPath,
    resizable: true,
    webPreferences: {
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        preload: path.join(appRoot, 'res', 'features', 'inventory', 'preload_inventory.js'),
        plugins: false,
        contextIsolation: true
    }
};
exports.inventoryUrl = toFileUrl(path.join(appRoot, 'res', 'features', 'inventory', 'inventory.html'));

exports.strategyConfig = {
    width: 1040, height: 680, useContentSize: true, icon: iconPath, resizable: true,
    webPreferences: { nodeIntegration: false, sandbox: true, webviewTag: false,
        preload: path.join(appRoot, 'res', 'features', 'strategy', 'preload_strategy.js'),
        plugins: false, contextIsolation: true }
};
exports.strategyUrl = toFileUrl(path.join(appRoot, 'res', 'features', 'strategy', 'strategy.html'));

// Local feature windows all use the same singleton lifecycle.  Keeping their
// declarative metadata here prevents every caller from reimplementing it.
exports.featureWindows = {
    settings:  { config: exports.settingsConfig,  url: exports.settingsUrl,  title: 'AquaStar - Settings' },
    reminders: { config: exports.remindersConfig, url: exports.remindersUrl, title: 'AquaStar - Reminders' },
    todo:      { config: exports.todoConfig,      url: exports.todoUrl,      title: 'AquaStar - To-Do List' },
    inventory: { config: exports.inventoryConfig, url: exports.inventoryUrl, title: 'AquaStar - Inventory' },
    strategy:  { config: exports.strategyConfig,  url: exports.strategyUrl,  title: 'AquaStar - Strategy' }
};
