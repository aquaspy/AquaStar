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

function buildSettingsLayout() {
    return {
        plugin: activePluginInfo || { id: '', name: '' },
        pluginSections: getSettingsSections()
    };
}

module.exports = {
    clear: clear,
    adoptHostState: adoptHostState,
    getActivePluginInfo: getActivePluginInfo,
    getSettingsSections: getSettingsSections,
    buildSettingsLayout: buildSettingsLayout
};
