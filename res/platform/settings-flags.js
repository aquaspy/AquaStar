// Lightweight aquastar.json read for plugin boot flags (no Electron UI).
const fs = require('fs');
const path = require('path');
const { resolvePluginFlags } = require('./plugin-loader.js');

function readSettingsObject(candidates) {
    const list = Array.isArray(candidates) ? candidates : [candidates];
    for (let i = 0; i < list.length; i++) {
        const filePath = list[i];
        if (!filePath || !fs.existsSync(filePath)) continue;
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (e) {
            console.log('[AquaStar:plugins] Could not parse ' + filePath + ': ' + e.message);
        }
    }
    return {};
}

function readPluginFlagsFromDisk(appDataDirectory, env) {
    const appdataJson = path.join(appDataDirectory, 'aquastar.json');
    const settings = readSettingsObject([appdataJson]);
    return {
        settings: settings,
        flags: resolvePluginFlags(settings, env)
    };
}

module.exports = {
    readSettingsObject: readSettingsObject,
    readPluginFlagsFromDisk: readPluginFlagsFromDisk
};
