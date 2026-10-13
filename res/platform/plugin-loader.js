// Discovers, validates, and activates AquaStar plugins (CommonJS / Electron 11).
// PR 1: no boot integration — callers/tests drive discovery + activateSelected.

const fs = require('fs');
const path = require('path');
const Module = require('module');
const schema = require('./manifest-schema.js');
const { createPluginHost } = require('./plugin-host.js');

/** Builtins local plugins must not load directly (Host / platform own these). */
const BLOCKED_LOCAL_REQUIRES = {
    fs: true,
    'fs/promises': true,
    'node:fs': true,
    'node:fs/promises': true,
    child_process: true,
    'node:child_process': true,
    worker_threads: true,
    'node:worker_threads': true,
    cluster: true,
    'node:cluster': true
};

function defaultLog(msg) {
    console.log('[AquaStar:plugins] ' + msg);
}

function isInsidePluginRoot(candidatePath, rootResolved) {
    const full = path.resolve(candidatePath);
    const prefix = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
    return full === rootResolved || full.indexOf(prefix) === 0;
}

function isFilesystemRequireRequest(request) {
    if (typeof request !== 'string' || request.length === 0) return false;
    if (path.isAbsolute(request)) return true;
    if (request[0] !== '.') return false;
    if (request.length === 1) return true;
    const second = request[1];
    return second === '/' || second === '\\' || second === '.';
}

/**
 * Temporarily wrap Module.prototype.require so code under pluginRoot cannot
 * load blocked builtins or resolve filesystem paths outside the plugin tree.
 * Bare specifiers (path, electron, packages) stay allowed. Restored in finally
 * (including when fn returns a thenable).
 * @param {string} pluginRoot
 * @param {Function} fn
 */
function withLocalRequireGate(pluginRoot, fn) {
    const rootResolved = path.resolve(pluginRoot);
    const originalRequire = Module.prototype.require;
    Module.prototype.require = function gatedLocalPluginRequire(request) {
        const callerFile = this && this.filename;
        if (callerFile && isInsidePluginRoot(callerFile, rootResolved)) {
            const id = String(request);
            if (BLOCKED_LOCAL_REQUIRES[id]) {
                throw new Error(
                    'Local plugin require blocked: "' + id + '"'
                );
            }
            if (isFilesystemRequireRequest(id)) {
                const resolved = path.resolve(path.dirname(callerFile), id);
                if (!isInsidePluginRoot(resolved, rootResolved)) {
                    throw new Error(
                        'Local plugin require blocked: path escapes plugin root (' +
                        id + ')'
                    );
                }
            }
        }
        return originalRequire.apply(this, arguments);
    };
    try {
        const result = fn();
        if (result != null && typeof result.then === 'function') {
            return Promise.resolve(result).finally(function () {
                Module.prototype.require = originalRequire;
            });
        }
        Module.prototype.require = originalRequire;
        return result;
    } catch (err) {
        Module.prototype.require = originalRequire;
        throw err;
    }
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listPluginDirs(rootDir) {
    if (!rootDir || !fs.existsSync(rootDir)) return [];
    return fs.readdirSync(rootDir).filter(function (name) {
        if (name === '_template') return false;
        const full = path.join(rootDir, name);
        try {
            return fs.statSync(full).isDirectory() &&
                fs.existsSync(path.join(full, 'plugin.json'));
        } catch (e) {
            return false;
        }
    }).map(function (name) {
        return path.join(rootDir, name);
    });
}

/**
 * @typedef {Object} DiscoveredPlugin
 * @property {string} root
 * @property {object} manifest
 * @property {'bundled'|'local'} source
 * @property {string[]} [errors]
 */

/**
 * Discover plugins under bundled and optional local directories.
 * @param {{
 *   bundledDir: string,
 *   localDir?: string,
 *   enableLocalPlugins?: boolean,
 *   allowLocalPluginOverride?: boolean,
 *   appVersion?: string,
 *   log?: Function
 * }} options
 * @returns {{ plugins: DiscoveredPlugin[], errors: string[] }}
 */
function discoverPlugins(options) {
    options = options || {};
    const log = options.log || defaultLog;
    const appVersion = options.appVersion;
    const plugins = [];
    const errors = [];
    const byId = {};

    function consider(dir, source) {
        const manifestPath = path.join(dir, 'plugin.json');
        let raw;
        try {
            raw = readJson(manifestPath);
        } catch (e) {
            errors.push('Failed to read ' + manifestPath + ': ' + e.message);
            return;
        }
        const result = schema.validateManifest(raw, { appVersion: appVersion });
        if (!result.ok) {
            errors.push(
                'Invalid manifest in ' + dir + ': ' + result.errors.join('; ')
            );
            return;
        }
        const manifest = result.manifest;
        const existing = byId[manifest.id];
        if (existing) {
            if (existing.source === 'bundled' && source === 'local') {
                if (options.allowLocalPluginOverride === true) {
                    log('Local plugin overrides bundled id "' + manifest.id + '"');
                    const idx = plugins.indexOf(existing);
                    if (idx !== -1) plugins.splice(idx, 1);
                } else {
                    errors.push(
                        'Local plugin id "' + manifest.id +
                        '" conflicts with bundled plugin; enable allowLocalPluginOverride or rename'
                    );
                    return;
                }
            } else {
                errors.push('Duplicate plugin id "' + manifest.id + '" at ' + dir);
                return;
            }
        }
        const entry = {
            root: dir,
            manifest: manifest,
            source: source
        };
        byId[manifest.id] = entry;
        plugins.push(entry);
    }

    listPluginDirs(options.bundledDir).forEach(function (dir) {
        consider(dir, 'bundled');
    });

    if (options.enableLocalPlugins === true && options.localDir) {
        listPluginDirs(options.localDir).forEach(function (dir) {
            consider(dir, 'local');
        });
    }

    return { plugins: plugins, errors: errors };
}

function isLocalTrusted(plugin, settings) {
    settings = settings || {};
    if (plugin.source !== 'local') return true;
    const trusted = settings.trustedLocalPlugins || {};
    const entry = trusted[plugin.manifest.id];
    if (!entry) return false;
    const needed = plugin.manifest.permissions || [];
    if (entry === true) return true;
    if (!entry.permissions || !Array.isArray(entry.permissions)) return false;
    for (let i = 0; i < needed.length; i++) {
        if (entry.permissions.indexOf(needed[i]) === -1) return false;
    }
    return true;
}

/**
 * Load plugin main module and call activate(host).
 * @param {DiscoveredPlugin} plugin
 * @param {{
 *   appVersion?: string,
 *   appRootPath?: string,
 *   appDataDirectory?: string,
 *   platformSettings?: object,
 *   deps?: object,
 *   legacyIpc?: boolean,
 *   log?: Function
 * }} options
 */
function activatePlugin(plugin, options) {
    options = options || {};
    const log = options.log || defaultLog;
    const settings = options.platformSettings || {};

    if (!isLocalTrusted(plugin, settings)) {
        throw new Error(
            'Local plugin "' + plugin.manifest.id +
            '" is not trusted for its requested permissions'
        );
    }

    const mainRel = plugin.manifest.main;
    const mainPath = path.join(plugin.root, mainRel);
    if (!fs.existsSync(mainPath)) {
        throw new Error('Plugin main not found: ' + mainPath);
    }

    // Clear cache so tests can reload fixtures; production activates once per process.
    if (options.clearRequireCache) {
        try { delete require.cache[require.resolve(mainPath)]; } catch (e) { /* ignore */ }
    }

    function runActivate() {
        const mod = require(mainPath);
        if (!mod || typeof mod.activate !== 'function') {
            throw new Error('Plugin main must export activate(host)');
        }

        // Unprefixed (legacy) IPC channel names are a bundled-only privilege that the plugin
        // asks for in its manifest. Everything else uses plugin:<id>:<channel> (preload and
        // Host must agree).
        const useLegacyIpc = plugin.source === 'bundled' &&
            plugin.manifest.unprefixedIpc === true &&
            (options.legacyIpc === true || options.legacyIpc == null);

        const host = createPluginHost({
            manifest: plugin.manifest,
            pluginRoot: plugin.root,
            appVersion: options.appVersion,
            appRootPath: options.appRootPath,
            appDataDirectory: options.appDataDirectory,
            pluginDataDirectory: options.pluginDataDirectory ||
                path.join(options.appDataDirectory || '', 'plugins', plugin.manifest.id),
            platformSettings: settings,
            deps: options.deps,
            legacyIpc: useLegacyIpc,
            log: log
        });

        log('Activating plugin "' + plugin.manifest.id + '" from ' + plugin.root);
        const maybePromise = mod.activate(host);
        return Promise.resolve(maybePromise).then(function () {
            return {
                plugin: plugin,
                host: host,
                module: mod
            };
        });
    }

    if (plugin.source === 'local') {
        return withLocalRequireGate(plugin.root, runActivate);
    }
    return runActivate();
}

/** The bundled plugin that declares bundledDefault in its manifest, or null. */
function pickBundledDefault(plugins) {
    for (let i = 0; i < (plugins || []).length; i++) {
        if (plugins[i].source === 'bundled' && plugins[i].manifest.bundledDefault === true) return plugins[i];
    }
    return null;
}

/**
 * Decide which discovered plugin runs. Pure: no activation, no Electron.
 * The platform names no plugin: the default is whichever bundled plugin declares
 * "bundledDefault" in its manifest. safeMode narrows the choice to that plugin (or, if none
 * declares it, to the bundled ones) whatever settings.activePluginId says.
 * @returns {{ selected: object|null, bundledDefault: object|null, plugins: object[], notes: string[] }}
 */
function selectPlugin(discoveredPlugins, settings, options) {
    options = options || {};
    settings = settings || {};
    const notes = [];
    let plugins = (discoveredPlugins || []).slice();

    const bundledDefault = pickBundledDefault(plugins);
    if (options.safeMode) {
        plugins = bundledDefault
            ? [bundledDefault]
            : plugins.filter(function (p) { return p.source === 'bundled'; });
    }
    if (!plugins.length) return { selected: null, bundledDefault: bundledDefault, plugins: plugins, notes: notes };

    const wantedId = (options.safeMode ? '' : settings.activePluginId) ||
        (bundledDefault && bundledDefault.manifest.id) || '';
    let selected = null;
    for (let i = 0; i < plugins.length; i++) {
        if (plugins[i].manifest.id === wantedId) { selected = plugins[i]; break; }
    }
    if (!selected) {
        // Prefer the bundled default, else the first bundled plugin, else the first plugin.
        selected = bundledDefault && plugins.indexOf(bundledDefault) !== -1 ? bundledDefault : null;
        if (!selected) {
            for (let k = 0; k < plugins.length; k++) {
                if (plugins[k].source === 'bundled') { selected = plugins[k]; break; }
            }
        }
        if (!selected) selected = plugins[0];
        notes.push('Requested plugin "' + wantedId + '" missing; falling back to "' +
            selected.manifest.id + '"');
    }
    return { selected: selected, bundledDefault: bundledDefault, plugins: plugins, notes: notes };
}

/**
 * Pick the active plugin (see selectPlugin) and activate it; if that fails, fall back to the
 * bundled default.
 * @returns {Promise<{ plugin, host, module }|null>}
 */
function activateSelected(options) {
    options = options || {};
    const discovered = discoverPlugins(options);
    const log = options.log || defaultLog;

    discovered.errors.forEach(function (err) {
        log('Discovery: ' + err);
    });

    const choice = selectPlugin(discovered.plugins, options.platformSettings, options);
    if (!choice.selected) {
        log('No plugins discovered');
        return Promise.resolve(null);
    }
    choice.notes.forEach(function (note) { log(note); });

    const selected = choice.selected;
    const bundledDefault = choice.bundledDefault;
    return activatePlugin(selected, options).catch(function (err) {
        log('Activation failed for "' + selected.manifest.id + '": ' + err.message);
        if (bundledDefault && selected !== bundledDefault) {
            log('Falling back to bundled default "' + bundledDefault.manifest.id + '"');
            return activatePlugin(bundledDefault, options);
        }
        throw err;
    });
}

/**
 * Flag helpers for PR milestones. PR 1 keeps pluginSystem off by default.
 */
function resolvePluginFlags(settings, env) {
    settings = settings || {};
    env = env || process.env;
    const disabled = env.AQUASTAR_DISABLE_PLUGINS === '1';
    // PR 2+: plugin system is on unless explicitly disabled in settings or via env.
    const pluginSystem = disabled ? false : settings.pluginSystem !== false;
    return {
        pluginSystem: pluginSystem,
        enableLocalPlugins: settings.enableLocalPlugins === true,
        allowLocalPluginOverride: settings.allowLocalPluginOverride === true,
        // Empty = the bundled default (see pickBundledDefault); the platform names no plugin.
        activePluginId: settings.activePluginId || ''
    };
}

module.exports = {
    discoverPlugins: discoverPlugins,
    activatePlugin: activatePlugin,
    activateSelected: activateSelected,
    pickBundledDefault: pickBundledDefault,
    selectPlugin: selectPlugin,
    resolvePluginFlags: resolvePluginFlags,
    isLocalTrusted: isLocalTrusted,
    listPluginDirs: listPluginDirs,
    withLocalRequireGate: withLocalRequireGate,
    BLOCKED_LOCAL_REQUIRES: BLOCKED_LOCAL_REQUIRES
};
