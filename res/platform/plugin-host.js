// PluginHost facade. Records capability registrations and enforces manifest
// permissions. Electron wiring (webRequest, BrowserWindow, ipcMain) is injected
// later by PR 2+; PR 1 keeps this module testable under plain Node.

const path = require('path');
const schema = require('./manifest-schema.js');

const PLATFORM_RESERVED_KEYBIND_IDS = {
    settings: true,
    fullscreen: true,
    sshot: true,
    record: true,
    reload: true,
    reloadCache: true,
    help: true,
    about: true,
    forward: true,
    backward: true
};

function createPermissionError(pluginId, method, permission) {
    return new Error(
        '[AquaStar:plugins] Plugin "' + pluginId + '" called ' + method +
        ' without permission "' + permission + '"'
    );
}

function createPluginHost(options) {
    if (!options || !options.manifest || !options.pluginRoot) {
        throw new Error('createPluginHost requires manifest and pluginRoot');
    }

    const manifest = options.manifest;
    const pluginId = manifest.id;
    const permissions = {};
    (manifest.permissions || []).forEach(function (perm) {
        permissions[perm] = true;
    });

    const state = {
        primaryGame: null,
        launches: [],
        sessionRules: [],
        navigationHooks: null,
        featureWindows: [],
        keybindDefaults: {},
        keybinds: [],
        menus: [],
        menuProviders: null,
        locales: {},
        settingsSections: [],
        trustedFlashUrls: [],
        ipcHandlers: [],
        ipcListeners: [],
        stores: {}
    };

    const deps = options.deps || {};
    const log = typeof options.log === 'function'
        ? options.log
        : function (msg) { console.log('[AquaStar:plugins] ' + msg); };

    function requirePermission(method, permission) {
        if (!permissions[permission]) {
            throw createPermissionError(pluginId, method, permission);
        }
    }

    function assertUniqueIds(list, item, label) {
        for (let i = 0; i < list.length; i++) {
            if (list[i].id === item.id) {
                throw new Error(
                    '[AquaStar:plugins] Duplicate ' + label + ' id "' + item.id +
                    '" in plugin "' + pluginId + '"'
                );
            }
        }
    }

    function resolveChannel(channel, opts) {
        opts = opts || {};
        const legacyBundled = options.legacyIpc === true ||
            (pluginId === 'adventure-quest-worlds' && manifest.apiVersion === 1);
        if (legacyBundled || opts.raw === true) return channel;
        return 'plugin:' + pluginId + ':' + channel;
    }

    function urlAllowedByFetchAllowlist(url) {
        const list = manifest.fetchAllowlist;
        if (!Array.isArray(list) || list.length === 0) return false;
        for (let i = 0; i < list.length; i++) {
            const pattern = list[i];
            if (pattern === url) return true;
            if (pattern.slice(-1) === '*' && url.indexOf(pattern.slice(0, -1)) === 0) {
                return true;
            }
        }
        return false;
    }

    function hostPathInsidePlugin(relativePath) {
        if (schema.hasPathEscape(relativePath)) {
            throw new Error(
                '[AquaStar:plugins] scriptRelativePath must stay inside the plugin root'
            );
        }
        const resolved = path.resolve(options.pluginRoot, relativePath);
        const rootResolved = path.resolve(options.pluginRoot);
        const prefix = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
        if (resolved !== rootResolved && resolved.indexOf(prefix) !== 0) {
            throw new Error(
                '[AquaStar:plugins] scriptRelativePath escaped plugin root'
            );
        }
        return resolved;
    }

    const host = {
        appVersion: options.appVersion || '0.0.0',
        appRootPath: options.appRootPath || '',
        appDataDirectory: options.appDataDirectory || '',
        pluginId: pluginId,
        pluginRoot: options.pluginRoot,
        pluginDataDirectory: options.pluginDataDirectory ||
            path.join(options.appDataDirectory || '', 'plugins', pluginId),

        getStore: function (ns) {
            requirePermission('getStore', 'persistent-store');
            if (typeof ns !== 'string' || !ns) {
                throw new Error('[AquaStar:plugins] getStore requires a namespace string');
            }
            if (state.stores[ns]) return state.stores[ns];
            if (typeof deps.createStore === 'function') {
                state.stores[ns] = deps.createStore(ns, host);
                return state.stores[ns];
            }
            // Placeholder until PR 7a wires namespaced-store.
            const memory = { value: undefined };
            state.stores[ns] = {
                read: function () { return memory.value; },
                write: function (value) { memory.value = value; return value; },
                readOrCreate: function (createValue) {
                    if (memory.value === undefined) memory.value = createValue();
                    return memory.value;
                }
            };
            return state.stores[ns];
        },

        registerKeybindDefaults: function (defs) {
            if (!defs || typeof defs !== 'object') {
                throw new Error('[AquaStar:plugins] registerKeybindDefaults expects an object');
            }
            Object.keys(defs).forEach(function (key) {
                state.keybindDefaults[key] = defs[key];
            });
        },

        registerKeybinds: function (bindings) {
            if (!Array.isArray(bindings)) {
                throw new Error('[AquaStar:plugins] registerKeybinds expects an array');
            }
            bindings.forEach(function (binding) {
                if (!binding || typeof binding.id !== 'string') {
                    throw new Error('[AquaStar:plugins] keybind requires id');
                }
                if (PLATFORM_RESERVED_KEYBIND_IDS[binding.id]) {
                    throw new Error(
                        '[AquaStar:plugins] keybind id "' + binding.id +
                        '" is reserved for the platform'
                    );
                }
                assertUniqueIds(state.keybinds, binding, 'keybind');
                state.keybinds.push(binding);
            });
        },

        registerMenus: function (contributor) {
            if (typeof contributor !== 'function') {
                throw new Error('[AquaStar:plugins] registerMenus expects a function');
            }
            state.menus.push(contributor);
        },

        registerMenuPages: function (providers) {
            if (!providers || typeof providers !== 'object') {
                throw new Error('[AquaStar:plugins] registerMenuPages expects an object');
            }
            if (providers.appUsefulPages != null &&
                typeof providers.appUsefulPages !== 'function') {
                throw new Error(
                    '[AquaStar:plugins] registerMenuPages.appUsefulPages expects a function'
                );
            }
            if (providers.gameMenuPages != null &&
                typeof providers.gameMenuPages !== 'function') {
                throw new Error(
                    '[AquaStar:plugins] registerMenuPages.gameMenuPages expects a function'
                );
            }
            const next = state.menuProviders
                ? Object.assign({}, state.menuProviders)
                : {};
            if (typeof providers.appUsefulPages === 'function') {
                next.appUsefulPages = providers.appUsefulPages;
            }
            if (typeof providers.gameMenuPages === 'function') {
                next.gameMenuPages = providers.gameMenuPages;
            }
            state.menuProviders = next;
        },

        registerFeatureWindows: function (windows) {
            if (!Array.isArray(windows)) {
                throw new Error('[AquaStar:plugins] registerFeatureWindows expects an array');
            }
            windows.forEach(function (winDef) {
                if (!winDef || typeof winDef.id !== 'string') {
                    throw new Error('[AquaStar:plugins] feature window requires id');
                }
                const cfg = winDef.config || {};
                const needsUnsafe =
                    cfg.webSecurity === false ||
                    (cfg.webPreferences && cfg.webPreferences.webSecurity === false) ||
                    (cfg.webPreferences && cfg.webPreferences.plugins === true);
                if (needsUnsafe) requirePermission('registerFeatureWindows', 'unsafe-renderer');
                assertUniqueIds(state.featureWindows, winDef, 'feature window');
                state.featureWindows.push(winDef);
            });
        },

        registerSessionRules: function (rules) {
            requirePermission('registerSessionRules', 'web-request');
            if (!Array.isArray(rules)) {
                throw new Error('[AquaStar:plugins] registerSessionRules expects an array');
            }
            rules.forEach(function (rule) {
                if (!rule || typeof rule.id !== 'string') {
                    throw new Error('[AquaStar:plugins] session rule requires id');
                }
                assertUniqueIds(state.sessionRules, rule, 'session rule');
                state.sessionRules.push(rule);
            });
        },

        registerNavigationHooks: function (hooks) {
            hooks = hooks || {};
            if (typeof hooks.onDidFinishLoad === 'function') {
                requirePermission('registerNavigationHooks', 'inject-scripts');
            }
            state.navigationHooks = hooks;
        },

        registerLaunches: function (entries) {
            if (!Array.isArray(entries)) {
                throw new Error('[AquaStar:plugins] registerLaunches expects an array');
            }
            entries.forEach(function (entry) {
                if (!entry || typeof entry.id !== 'string' || typeof entry.getUrl !== 'function') {
                    throw new Error('[AquaStar:plugins] launch requires id and getUrl()');
                }
                assertUniqueIds(state.launches, entry, 'launch');
                state.launches.push(entry);
            });
        },

        setPrimaryGame: function (cfg) {
            if (!cfg || typeof cfg.id !== 'string' || typeof cfg.getUrl !== 'function') {
                throw new Error('[AquaStar:plugins] setPrimaryGame requires id and getUrl()');
            }
            if (typeof cfg.isGameUrl !== 'function') {
                throw new Error('[AquaStar:plugins] setPrimaryGame requires isGameUrl()');
            }
            state.primaryGame = cfg;
        },

        trustFlashUrls: function (urls) {
            requirePermission('trustFlashUrls', 'flash-trust');
            if (!Array.isArray(urls)) {
                throw new Error('[AquaStar:plugins] trustFlashUrls expects an array');
            }
            state.trustedFlashUrls = state.trustedFlashUrls.concat(urls);
            if (typeof deps.trustFlashUrls === 'function') {
                deps.trustFlashUrls(urls);
            }
        },

        registerLocales: function (catalog) {
            if (!catalog || typeof catalog !== 'object') {
                throw new Error('[AquaStar:plugins] registerLocales expects an object');
            }
            Object.keys(catalog).forEach(function (localeId) {
                state.locales[localeId] = catalog[localeId];
            });
        },

        getPlatformSettings: function () {
            if (typeof deps.getPlatformSettings === 'function') {
                return deps.getPlatformSettings();
            }
            return options.platformSettings || {};
        },

        registerSettingsSection: function (section) {
            if (!section || typeof section !== 'object') {
                throw new Error('[AquaStar:plugins] registerSettingsSection expects an object');
            }
            state.settingsSections.push(section);
        },

        ipc: {
            handle: function (channel, listener, opts) {
                const resolved = resolveChannel(channel, opts);
                state.ipcHandlers.push({ channel: resolved, listener: listener });
                if (typeof deps.ipcHandle === 'function') {
                    deps.ipcHandle(resolved, listener);
                }
            },
            on: function (channel, listener, opts) {
                const resolved = resolveChannel(channel, opts);
                state.ipcListeners.push({ channel: resolved, listener: listener });
                if (typeof deps.ipcOn === 'function') {
                    deps.ipcOn(resolved, listener);
                }
            },
            removeHandler: function (channel, opts) {
                const resolved = resolveChannel(channel, opts);
                state.ipcHandlers = state.ipcHandlers.filter(function (item) {
                    return item.channel !== resolved;
                });
                if (typeof deps.ipcRemoveHandler === 'function') {
                    deps.ipcRemoveHandler(resolved);
                }
            }
        },

        net: {
            fetchText: function (url, fetchOpts) {
                requirePermission('net.fetchText', 'net-fetch');
                if (!urlAllowedByFetchAllowlist(url)) {
                    return Promise.resolve({
                        ok: false,
                        error: 'URL not in fetchAllowlist'
                    });
                }
                if (typeof deps.fetchText === 'function') {
                    return deps.fetchText(url, fetchOpts);
                }
                return Promise.resolve({ ok: false, error: 'net.fetchText not wired' });
            }
        },

        windows: {
            openPrimaryGame: function (opts) {
                if (typeof deps.openPrimaryGame === 'function') {
                    return deps.openPrimaryGame(opts);
                }
                throw new Error('[AquaStar:plugins] windows.openPrimaryGame not wired');
            },
            openLaunch: function (launchId) {
                if (typeof deps.openLaunch === 'function') {
                    return deps.openLaunch(launchId);
                }
                throw new Error('[AquaStar:plugins] windows.openLaunch not wired');
            },
            openFeatureWindow: function (featureId) {
                if (typeof deps.openFeatureWindow === 'function') {
                    return deps.openFeatureWindow(featureId);
                }
                throw new Error('[AquaStar:plugins] windows.openFeatureWindow not wired');
            },
            openUrl: function (url, mode) {
                if (typeof deps.openUrl === 'function') {
                    return deps.openUrl(url, mode || 'new-window');
                }
                throw new Error('[AquaStar:plugins] windows.openUrl not wired');
            },
            spawnHelperProcess: function (spawnOpts) {
                requirePermission('windows.spawnHelperProcess', 'spawn-helper-process');
                if (!spawnOpts || !spawnOpts.argvFlag || !spawnOpts.scriptRelativePath) {
                    throw new Error(
                        '[AquaStar:plugins] spawnHelperProcess requires argvFlag and scriptRelativePath'
                    );
                }
                const scriptPath = hostPathInsidePlugin(spawnOpts.scriptRelativePath);
                if (typeof deps.spawnHelperProcess === 'function') {
                    return deps.spawnHelperProcess({
                        argvFlag: spawnOpts.argvFlag,
                        scriptPath: scriptPath
                    });
                }
                return { scriptPath: scriptPath, argvFlag: spawnOpts.argvFlag, stub: true };
            }
        },

        log: log,

        /** @internal test/PR2 inspection */
        _getState: function () { return state; }
    };

    return host;
}

module.exports = {
    createPluginHost: createPluginHost,
    PLATFORM_RESERVED_KEYBIND_IDS: PLATFORM_RESERVED_KEYBIND_IDS
};
