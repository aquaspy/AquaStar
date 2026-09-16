// AQW plugin keybind defaults + actions (PR 6).
// Page-opening actions use new-window (newBrowserWindow), matching keybindings.js.
// Platform-reserved ids (settings, fullscreen, sshot, record, reload, …) stay on the host.

const path = require('path');

const resRoot = path.join(__dirname, '..', '..', 'res');

const AQW_KEYBIND_DEFAULTS = {
    wiki: 'Alt+W',
    account: 'Alt+A',
    design: 'Alt+D',
    charpage: 'Alt+P',
    newAqw: 'Alt+N',
    newTest: 'Alt+Q',
    dragon: 'Alt+1',
    reminders: 'Alt+T',
    todo: 'Alt+Y',
    inventory: 'Alt+I',
    strategy: 'Alt+U',
    cpSshot: 'Alt+K'
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
        { id: 'newTest', openMode: 'new-window', surface: 'keybind' },
        { id: 'dragon', openMode: 'new-window', surface: 'keybind' },
        { id: 'reminders', surface: 'keybind' },
        { id: 'todo', surface: 'keybind' },
        { id: 'inventory', surface: 'keybind' },
        { id: 'strategy', surface: 'keybind' },
        { id: 'cpSshot', surface: 'keybind' }
    ];
}

function resolveDeps(deps) {
    deps = deps || {};
    return {
        instances: deps.instances || require(path.join(resRoot, 'instances.js')),
        constant: deps.constant || require(path.join(resRoot, 'const.js')),
        getPlayerCharacter: deps.getPlayerCharacter || function () {
            try {
                const keyb = require(path.join(resRoot, 'keybindings.js'));
                if (keyb.keybinds && keyb.keybinds.playerCharacter != null) {
                    return keyb.keybinds.playerCharacter;
                }
            } catch (e) { /* settings may not be loaded yet */ }
            return '';
        }
    };
}

function createKeybindRegistrations(deps) {
    const d = resolveDeps(deps);
    const inst = d.instances;
    const constant = d.constant;

    return [
        {
            id: 'wiki',
            openMode: 'new-window',
            action: function () { inst.newBrowserWindow(constant.wikiReleases); }
        },
        {
            id: 'design',
            openMode: 'new-window',
            action: function () { inst.newBrowserWindow(constant.designNotes); }
        },
        {
            id: 'account',
            openMode: 'new-window',
            action: function () { inst.newBrowserWindow(constant.accountAq); }
        },
        {
            id: 'charpage',
            openMode: 'new-window',
            action: function () {
                inst.newBrowserWindow(constant.buildCharLookupUrl(d.getPlayerCharacter()));
            }
        },
        {
            id: 'newAqw',
            openMode: 'new-window',
            action: function () { inst.newBrowserWindow(constant.mainPath); }
        },
        {
            id: 'newTest',
            openMode: 'new-window',
            action: function () { inst.newBrowserWindow(constant.testingAQW); }
        },
        {
            id: 'dragon',
            openMode: 'new-window',
            action: function () { inst.newBrowserWindow(constant.df_url); }
        },
        {
            id: 'reminders',
            action: function () { inst.openRemindersWindow(); }
        },
        {
            id: 'todo',
            action: function () { inst.openTodoWindow(); }
        },
        {
            id: 'inventory',
            action: function () { inst.openInventoryWindow(); }
        },
        {
            id: 'strategy',
            action: function () { inst.openStrategyWindow(); }
        },
        {
            id: 'cpSshot',
            action: function () { inst.charPagePrint(); }
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

    host.registerKeybinds(createKeybindRegistrations(deps));
}

module.exports = {
    AQW_KEYBIND_DEFAULTS: AQW_KEYBIND_DEFAULTS,
    describeKeybindActions: describeKeybindActions,
    createKeybindRegistrations: createKeybindRegistrations,
    register: register
};
