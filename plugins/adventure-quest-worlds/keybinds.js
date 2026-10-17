// AQW plugin keybind defaults + actions (PR 6).
// Page-opening actions use new-window (newBrowserWindow), matching keybindings.js.
// Platform-reserved ids (settings, fullscreen, sshot, record, reload, …) stay on the host.

const path = require('path');

const urls = require('./urls.js');

const resRoot = path.join(__dirname, '..', '..', 'res');

const AQW_KEYBIND_DEFAULTS = {
    wiki: 'Alt+W',
    account: 'Alt+A',
    design: 'Alt+D',
    charpage: 'Alt+P',
    newAqw: 'Alt+N',
    dragon: 'Alt+1',
    reminders: 'Alt+T',
    todo: 'Alt+Y',
    inventory: 'Alt+I',
    strategy: 'Alt+U',
    cpSshot: 'Alt+K'
    // 'studio' has no default accelerator: it is menu-only.
};

/**
 * Declarative list for tests / registry. openMode is new-window for URL navigations;
 * feature windows and charpage screenshot have no URL openMode (action-only).
 */
function describeKeybindActions() {
    return [
        { id: 'wiki', openMode: 'new-window', surface: 'keybind' },
        { id: 'account', openMode: 'new-window', surface: 'keybind' },
        { id: 'design', openMode: 'new-window', surface: 'keybind' },
        { id: 'charpage', openMode: 'new-window', surface: 'keybind' },
        { id: 'newAqw', openMode: 'new-window', surface: 'keybind' },
        { id: 'dragon', openMode: 'new-window', surface: 'keybind' },
        { id: 'reminders', surface: 'keybind' },
        { id: 'todo', surface: 'keybind' },
        { id: 'inventory', surface: 'keybind' },
        { id: 'strategy', surface: 'keybind' },
        { id: 'cpSshot', surface: 'keybind' },
        { id: 'studio', surface: 'menu' }
    ];
}

function resolveDeps(deps) {
    deps = deps || {};
    return {
        instances: deps.instances || require(path.join(resRoot, 'instances.js')),
        // Effective URL of the primary game: the plugin's loader unless the user set
        // customUrl / a local SWF (the platform applies those overrides).
        getPrimaryUrl: deps.getPrimaryUrl || function () {
            try {
                return require(path.join(resRoot, 'platform')).pluginRuntime.getPrimaryUrl();
            } catch (e) { return urls.loaderUrl(); }
        },
        getPlayerCharacter: deps.getPlayerCharacter || function () {
            try {
                const keyb = require(path.join(resRoot, 'keybindings.js'));
                if (keyb.keybinds && keyb.keybinds.playerCharacter != null) {
                    return keyb.keybinds.playerCharacter;
                }
            } catch (e) { /* settings may not be loaded yet */ }
            return '';
        },
        // Services the plugin wires from its host (see main.js).
        openFeatureWindow: deps.openFeatureWindow,
        openStudio: deps.openStudio,
        charPagePrint: deps.charPagePrint
    };
}

function createKeybindRegistrations(deps) {
    const d = resolveDeps(deps);
    const inst = d.instances;

    return [
        {
            id: 'wiki',
            openMode: 'new-window',
            action: function () { inst.newBrowserWindow(urls.URLS.wikiReleases); }
        },
        {
            id: 'design',
            openMode: 'new-window',
            action: function () { inst.newBrowserWindow(urls.URLS.designNotes); }
        },
        {
            id: 'account',
            openMode: 'new-window',
            action: function () { inst.newBrowserWindow(urls.URLS.accountAq); }
        },
        {
            id: 'charpage',
            openMode: 'new-window',
            action: function () {
                inst.newBrowserWindow(urls.buildCharLookupUrl(d.getPlayerCharacter()));
            }
        },
        {
            id: 'newAqw',
            openMode: 'new-window',
            action: function () { inst.newBrowserWindow(d.getPrimaryUrl()); }
        },
        {
            id: 'dragon',
            openMode: 'new-window',
            action: function () { inst.newBrowserWindow(urls.URLS.dfLoader); }
        },
        {
            id: 'reminders',
            action: function () { d.openFeatureWindow('reminders'); }
        },
        {
            id: 'todo',
            action: function () { d.openFeatureWindow('todo'); }
        },
        {
            id: 'inventory',
            action: function () { d.openFeatureWindow('inventory'); }
        },
        {
            id: 'strategy',
            action: function () { d.openFeatureWindow('strategy'); }
        },
        {
            id: 'cpSshot',
            // macOS has no per-window menu entry for it: HTML (char page) windows only.
            onlyHtml: process.platform === 'darwin',
            action: function () { d.charPagePrint(); }
        },
        {
            id: 'studio',
            action: function () { d.openStudio(); }
        }
    ];
}

/**
 * Register defaults + actions on the PluginHost.
 * When deps.deferActions is true (Node unit tests without Electron), only
 * defaults and metadata are registered — action stubs that throw if invoked.
 */
function register(host, deps) {
    deps = deps || {};
    host.registerKeybindDefaults(AQW_KEYBIND_DEFAULTS);

    if (deps.deferActions) {
        describeKeybindActions().forEach(function (meta) {
            host.registerKeybinds([{
                id: meta.id,
                openMode: meta.openMode,
                action: function () {
                    throw new Error('[AquaStar:plugins] keybind action not wired: ' + meta.id);
                }
            }]);
        });
        return;
    }

    host.registerKeybinds(createKeybindRegistrations(Object.assign({
        openFeatureWindow: host.windows.openFeatureWindow
    }, deps)));
}

module.exports = {
    AQW_KEYBIND_DEFAULTS: AQW_KEYBIND_DEFAULTS,
    describeKeybindActions: describeKeybindActions,
    createKeybindRegistrations: createKeybindRegistrations,
    register: register
};
