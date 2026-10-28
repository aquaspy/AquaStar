// AQW feature windows (Reminders, To-Do, Inventory, Strategy) and the hidden window used by
// the Char Page screenshot. The platform only knows how to open a registered feature window;
// the sizes, preloads and pages below are this plugin's business.

const path = require('path');
const url = require('url');

const pluginRoot = __dirname;
const featuresRoot = path.join(pluginRoot, 'features');

function createWindows(deps) {
    deps = deps || {};
    const iconPath = deps.iconPath;
    const toFileUrl = deps.toFileUrl || function (p) {
        return url.format({ pathname: p, protocol: 'file:', slashes: true });
    };
    const featurePage = function (dir, file) { return toFileUrl(path.join(featuresRoot, dir, file)); };
    const preload = function (dir, file) { return path.join(featuresRoot, dir, file); };

    // Same per-character list shape for Reminders / To-Do / Inventory, each with its own
    // preload (IPC under contextIsolation). Widths fit every fixed-width column of the row.
    function listWindow(dir, size, preloadFile) {
        return {
            width: size.width,
            height: size.height,
            useContentSize: true,
            icon: iconPath,
            resizable: true,
            webPreferences: {
                nodeIntegration: false,
                sandbox: true,
                webviewTag: false,
                preload: preload(dir, preloadFile),
                contextIsolation: true
            }
        };
    }

    const reminders = listWindow('reminders', { width: 1040, height: 620 }, 'preload_reminders.js');
    const todo = listWindow('todo', { width: 960, height: 620 }, 'preload_todo.js');
    // Inventory's preload merges the synced-data bridge with a re-exposed
    // aquastarWiki.fetchWikiPage so hover previews work inside this window too.
    const inventory = listWindow('inventory', { width: 1040, height: 620 }, 'preload_inventory.js');
    const strategy = listWindow('strategy', { width: 1040, height: 680 }, 'preload_strategy.js');

    // Char Page screenshot: a deliberately huge, hidden, non-resizable window. It must be
    // show:false so the user never sees it, and resizable:false so it stays at full size.
    // The window cap is the display size, so the number is simply "as big as imaginable".
    const charPrint = {
        width: 3840,
        height: 2160,
        useContentSize: true,
        show: false,
        paintWhenInitiallyHidden: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: false,
            sandbox: true,
            contextIsolation: true,
            preload: preload('charpage', 'preload_charpage.js')
        }
    };

    return {
        charPrintConfig: charPrint,
        featureWindows: [
            { id: 'reminders', title: 'AquaStar - Reminders', url: featurePage('reminders', 'reminders.html'), config: reminders },
            { id: 'todo', title: 'AquaStar - To-Do List', url: featurePage('todo', 'todo.html'), config: todo },
            { id: 'inventory', title: 'AquaStar - Inventory', url: featurePage('inventory', 'inventory.html'), config: inventory },
            { id: 'strategy', title: 'AquaStar - Strategy', url: featurePage('strategy', 'strategy.html'), config: strategy }
        ]
    };
}

module.exports = { createWindows: createWindows };
