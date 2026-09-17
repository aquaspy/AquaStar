// Public surface for the plugin platform.

module.exports = {
    manifestSchema: require('./manifest-schema.js'),
    createPluginHost: require('./plugin-host.js').createPluginHost,
    PLATFORM_RESERVED_KEYBIND_IDS: require('./plugin-host.js').PLATFORM_RESERVED_KEYBIND_IDS,
    discoverPlugins: require('./plugin-loader.js').discoverPlugins,
    activatePlugin: require('./plugin-loader.js').activatePlugin,
    activateSelected: require('./plugin-loader.js').activateSelected,
    resolvePluginFlags: require('./plugin-loader.js').resolvePluginFlags,
    isLocalTrusted: require('./plugin-loader.js').isLocalTrusted,
    legacyChannels: require('./legacy-channels.js'),
    readSettingsObject: require('./settings-flags.js').readSettingsObject,
    readPluginFlagsFromDisk: require('./settings-flags.js').readPluginFlagsFromDisk,
    applySessionRules: require('./session-rules.js').applySessionRules,
    createNamespacedStore: require('./storage/namespaced-store.js').createNamespacedStore,
    resolveOption: require('./settings-resolve.js').resolveOption,
    menuRegistry: require('./menu-registry.js'),
    settingsRegistry: require('./settings-registry.js')
};
