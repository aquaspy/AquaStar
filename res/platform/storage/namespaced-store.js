// Per-plugin JSON stores wrapping repositories/json-store.js.
// AQW keeps permanent aquastar_*.json filenames; other plugins use aquastar.<id>.<ns>.json.
const path = require('path');
const jsonStore = require('../../repositories/json-store.js');

const AQW_PLUGIN_ID = 'adventure-quest-worlds';

const AQW_ALIASES = {
    reminders: 'aquastar_reminders.json',
    todo: 'aquastar_todo.json',
    strategy: 'aquastar_strategy.json',
    inventory: 'aquastar_inventory.json'
};

function resolveStoreFileName(pluginId, ns, aliases) {
    if (aliases && Object.prototype.hasOwnProperty.call(aliases, ns)) {
        return aliases[ns];
    }
    if (pluginId === AQW_PLUGIN_ID && Object.prototype.hasOwnProperty.call(AQW_ALIASES, ns)) {
        return AQW_ALIASES[ns];
    }
    return 'aquastar.' + pluginId + '.' + ns + '.json';
}

function resolveStorePath(appDataDirectory, pluginId, ns, aliases) {
    return path.join(appDataDirectory, resolveStoreFileName(pluginId, ns, aliases));
}

function bindStore(filePath) {
    return {
        read: function () {
            return jsonStore.read(filePath);
        },
        write: function (value) {
            return jsonStore.write(filePath, value);
        },
        readOrCreate: function (createValue) {
            return jsonStore.readOrCreate(filePath, createValue);
        }
    };
}

function createNamespacedStore(options) {
    if (!options || !options.appDataDirectory) {
        throw new Error('[AquaStar:plugins] createNamespacedStore requires appDataDirectory');
    }
    if (typeof options.pluginId !== 'string' || !options.pluginId) {
        throw new Error('[AquaStar:plugins] createNamespacedStore requires pluginId');
    }

    const appDataDirectory = options.appDataDirectory;
    const pluginId = options.pluginId;
    const aliases = options.aliases || null;

    function getStore(ns) {
        if (typeof ns !== 'string' || !ns) {
            throw new Error('[AquaStar:plugins] getStore requires a namespace string');
        }
        return bindStore(resolveStorePath(appDataDirectory, pluginId, ns, aliases));
    }

    return {
        getStore: getStore,
        resolveStorePath: function (ns) {
            if (typeof ns !== 'string' || !ns) {
                throw new Error('[AquaStar:plugins] resolveStorePath requires a namespace string');
            }
            return resolveStorePath(appDataDirectory, pluginId, ns, aliases);
        }
    };
}

module.exports = {
    createNamespacedStore: createNamespacedStore,
    resolveStoreFileName: resolveStoreFileName,
    AQW_PLUGIN_ID: AQW_PLUGIN_ID,
    AQW_ALIASES: AQW_ALIASES
};
