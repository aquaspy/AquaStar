/**
 * Helper text/template for sandboxed plugin preloads (Electron 11).
 * Sandboxed preloads may ONLY require('electron'). Copy-paste into your
 * plugin preload and adjust CHANNEL_PREFIX + methods.
 *
 * Example generated shape:
 *
 *   const { contextBridge, ipcRenderer } = require('electron');
 *   const P = 'plugin:my-id:';
 *   contextBridge.exposeInMainWorld('aquastarPlugin', {
 *     getState: function () { return ipcRenderer.invoke(P + 'getState'); }
 *   });
 */

function buildSandboxedPreloadSource(options) {
    options = options || {};
    const pluginId = options.pluginId || 'my-plugin';
    const worldKey = options.worldKey || 'aquastarPlugin';
    const methods = Array.isArray(options.methods) ? options.methods : ['getState'];
    const lines = [
        "const { contextBridge, ipcRenderer } = require('electron');",
        "const P = 'plugin:" + pluginId + ":';",
        "contextBridge.exposeInMainWorld('" + worldKey + "', {"
    ];
    methods.forEach(function (name, i) {
        const comma = i < methods.length - 1 ? ',' : '';
        lines.push(
            "  " + name + ": function () {",
            "    return ipcRenderer.invoke(P + '" + name + "', ...arguments);",
            "  }" + comma
        );
    });
    lines.push("});", "");
    return lines.join("\n");
}

module.exports = {
    buildSandboxedPreloadSource: buildSandboxedPreloadSource
};
