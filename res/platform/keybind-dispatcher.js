// Maps keybind ids → actions for the active plugin + platform chrome.

const PLATFORM_RESERVED = {
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

/**
 * @param {{
 *   platformActions: Object.<string, Function>,
 *   pluginBindings: Array<{id: string, action: Function, global?: boolean}>,
 * }} sources
 * @returns {{ run: function(string, any): any, listPluginIds: function(): string[] }}
 */
function createDispatcher(sources) {
    sources = sources || {};
    const platformActions = sources.platformActions || {};
    const pluginMap = {};
    (sources.pluginBindings || []).forEach(function (binding) {
        if (!binding || !binding.id || typeof binding.action !== 'function') return;
        if (PLATFORM_RESERVED[binding.id]) return;
        pluginMap[binding.id] = binding;
    });

    function run(id, focusedWin) {
        if (PLATFORM_RESERVED[id] && typeof platformActions[id] === 'function') {
            return platformActions[id](focusedWin);
        }
        if (pluginMap[id]) return pluginMap[id].action(focusedWin);
        if (typeof platformActions[id] === 'function') return platformActions[id](focusedWin);
        return undefined;
    }

    function listPluginIds() {
        return Object.keys(pluginMap);
    }

    function getPluginBinding(id) {
        return pluginMap[id] || null;
    }

    return {
        run: run,
        listPluginIds: listPluginIds,
        getPluginBinding: getPluginBinding,
        PLATFORM_RESERVED: PLATFORM_RESERVED
    };
}

module.exports = {
    createDispatcher: createDispatcher,
    PLATFORM_RESERVED: PLATFORM_RESERVED
};
