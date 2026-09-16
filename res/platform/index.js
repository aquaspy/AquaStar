// Public surface for the plugin platform.

module.exports = {
    manifestSchema: require('./manifest-schema.js'),
    createPluginHost: require('./plugin-host.js').createPluginHost,
    PLATFORM_RESERVED_KEYBIND_IDS: require('./plugin-host.js').PLATFORM_RESERVED_KEYBIND_IDS,
    discoverPlugins: require('./plugin-loader.js').discoverPlugins,
    activatePlugin: require('./plugin-loader.js').activatePlugin,
    activateSelected: require('./plugin-loader.js').activateSelected,
    resolvePluginFlags: require('./plugin-loader.js').resolvePluginFlags,
    legacyChannels: require('./legacy-channels.js'),
    readSettingsObject: require('./settings-flags.js').readSettingsObject,
    readPluginFlagsFromDisk: require('./settings-flags.js').readPluginFlagsFromDisk
};
