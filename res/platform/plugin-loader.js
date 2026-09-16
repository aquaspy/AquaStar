// Discovers, validates, and activates AquaStar plugins (CommonJS / Electron 11).
// PR 1: no boot integration — callers/tests drive discovery + activateSelected.

const fs = require('fs');
const path = require('path');
const schema = require('./manifest-schema.js');
const { createPluginHost } = require('./plugin-host.js');

function defaultLog(msg) {
    console.log('[AquaStar:plugins] ' + msg);
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

    const mod = require(mainPath);
    if (!mod || typeof mod.activate !== 'function') {
        throw new Error('Plugin main must export activate(host)');
    }

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
        legacyIpc: options.legacyIpc,
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

/**
 * Pick active plugin id and activate it.
 * @returns {Promise<{ plugin, host, module }|null>}
 */
function activateSelected(options) {
    options = options || {};
    const settings = options.platformSettings || {};
    const discovered = discoverPlugins(options);
    const log = options.log || defaultLog;

    discovered.errors.forEach(function (err) {
        log('Discovery: ' + err);
    });

    if (!discovered.plugins.length) {
        log('No plugins discovered');
        return Promise.resolve(null);
    }

    const wantedId = settings.activePluginId || options.defaultPluginId ||
        'adventure-quest-worlds';
    let selected = null;
    for (let i = 0; i < discovered.plugins.length; i++) {
        if (discovered.plugins[i].manifest.id === wantedId) {
            selected = discovered.plugins[i];
            break;
        }
    }
    if (!selected) {
        // Prefer bundled AQW fallback, else first bundled, else first plugin.
        for (let j = 0; j < discovered.plugins.length; j++) {
            const p = discovered.plugins[j];
            if (p.manifest.id === 'adventure-quest-worlds' && p.source === 'bundled') {
                selected = p;
                break;
            }
        }
        if (!selected) {
            for (let k = 0; k < discovered.plugins.length; k++) {
                if (discovered.plugins[k].source === 'bundled') {
                    selected = discovered.plugins[k];
                    break;
                }
            }
        }
        if (!selected) selected = discovered.plugins[0];
        log('Requested plugin "' + wantedId + '" missing; falling back to "' +
            selected.manifest.id + '"');
    }

    return activatePlugin(selected, options).catch(function (err) {
        log('Activation failed for "' + selected.manifest.id + '": ' + err.message);
        if (selected.manifest.id !== 'adventure-quest-worlds') {
            const aqw = discovered.plugins.filter(function (p) {
                return p.manifest.id === 'adventure-quest-worlds' && p.source === 'bundled';
            })[0];
            if (aqw) {
                log('Falling back to bundled adventure-quest-worlds');
                return activatePlugin(aqw, options);
            }
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
    return {
        pluginSystem: disabled ? false : settings.pluginSystem === true,
        enableLocalPlugins: settings.enableLocalPlugins === true,
        allowLocalPluginOverride: settings.allowLocalPluginOverride === true,
        activePluginId: settings.activePluginId || 'adventure-quest-worlds'
    };
}

module.exports = {
    discoverPlugins: discoverPlugins,
    activatePlugin: activatePlugin,
    activateSelected: activateSelected,
    resolvePluginFlags: resolvePluginFlags,
    isLocalTrusted: isLocalTrusted,
    listPluginDirs: listPluginDirs
};
