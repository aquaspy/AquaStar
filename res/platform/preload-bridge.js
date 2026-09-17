// Helpers for plugin feature-window preloads (contextIsolation).
// Usage in a plugin preload:
//   const { exposePluginApi } = require('.../preload-bridge.js');
//   exposePluginApi('my-flash-game', { getProgress: () => invoke('getProgress') });

const { contextBridge, ipcRenderer } = require('electron');

function pluginChannel(pluginId, channel) {
    return 'plugin:' + pluginId + ':' + channel;
}

function createInvoker(pluginId) {
    return {
        invoke: function (channel, ...args) {
            return ipcRenderer.invoke(pluginChannel(pluginId, channel), ...args);
        },
        send: function (channel, ...args) {
            ipcRenderer.send(pluginChannel(pluginId, channel), ...args);
        },
        on: function (channel, listener) {
            const wrapped = function (_event, ...args) { listener(...args); };
            ipcRenderer.on(pluginChannel(pluginId, channel), wrapped);
            return function off() {
                ipcRenderer.removeListener(pluginChannel(pluginId, channel), wrapped);
            };
        },
        channel: function (channel) { return pluginChannel(pluginId, channel); }
    };
}

/**
 * Expose a safe API object on window under `worldKey` (default aquastarPlugin).
 */
function exposePluginApi(pluginId, api, worldKey) {
    const invoker = createInvoker(pluginId);
    const exposed = Object.assign({ pluginId: pluginId, ipc: invoker }, api || {});
    contextBridge.exposeInMainWorld(worldKey || 'aquastarPlugin', exposed);
    return exposed;
}

module.exports = {
    pluginChannel: pluginChannel,
    createInvoker: createInvoker,
    exposePluginApi: exposePluginApi
};
