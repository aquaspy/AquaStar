// Active-plugin settings sections for the Settings window (declarative UI).

let activePluginInfo = null;
let settingsSections = [];

function clear() {
    activePluginInfo = null;
    settingsSections = [];
}

function adoptHostState(hostState, pluginInfo) {
    settingsSections = [];
    activePluginInfo = pluginInfo || null;
    const list = (hostState && hostState.settingsSections) || [];
    list.forEach(function (section) {
        if (!section || typeof section.id !== 'string') return;
        settingsSections.push({
            id: section.id,
            title: section.title || section.id,
            titleKey: section.titleKey || null,
            order: typeof section.order === 'number' ? section.order : 100,
            fields: Array.isArray(section.fields) ? section.fields.slice() : []
        });
    });
    settingsSections.sort(function (a, b) { return a.order - b.order; });
}

function getActivePluginInfo() {
    return activePluginInfo;
}

function getSettingsSections() {
    return settingsSections.slice();
}

/** Fallback when pluginSystem is off so AQW fields still appear on the plugin tab. */
function getLegacyAqwSettingsSections() {
    return [{
        id: 'aqw-account',
        title: 'Account & Inventory',
        titleKey: 'account',
        order: 10,
        fields: [
            { key: 'playerCharacter', type: 'text', sanitize: 'alphanumeric' },
            { key: 'featurePlayerName', type: 'boolean' },
            { key: 'autoSync', type: 'boolean' }
        ]
    }];
}

function buildSettingsLayout(opts) {
    opts = opts || {};
    const sections = settingsSections.length
        ? getSettingsSections()
        : (opts.includeLegacyAqwFallback === false ? [] : getLegacyAqwSettingsSections());
    return {
        plugin: activePluginInfo || {
            id: 'adventure-quest-worlds',
            name: 'Adventure Quest Worlds'
        },
        pluginSections: sections
    };
}

module.exports = {
    clear: clear,
    adoptHostState: adoptHostState,
    getActivePluginInfo: getActivePluginInfo,
    getSettingsSections: getSettingsSections,
    getLegacyAqwSettingsSections: getLegacyAqwSettingsSections,
    buildSettingsLayout: buildSettingsLayout
};
