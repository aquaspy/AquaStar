// Resolve a settings key with top-level aquastar.json winning over plugins[id].

function resolveOption(settings, key, pluginId) {
    const root = settings && typeof settings === 'object' ? settings : {};
    if (Object.prototype.hasOwnProperty.call(root, key)) {
        return root[key];
    }
    const nested = pluginId && root.plugins && root.plugins[pluginId];
    if (nested && typeof nested === 'object' && Object.prototype.hasOwnProperty.call(nested, key)) {
        return nested[key];
    }
    return undefined;
}

module.exports = {
    resolveOption: resolveOption
};
