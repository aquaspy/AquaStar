// Generic singleton controller for local feature windows.  Electron is injected
// so lifecycle behavior can be tested with a small fake BrowserWindow.
const path = require('path');

function resolveFeatureDefinition(definition, pluginRoot) {
    if (!definition || !definition.config || !definition.config.webPreferences) {
        return definition;
    }
    const preload = definition.config.webPreferences.preload;
    if (typeof preload !== 'string' || path.isAbsolute(preload) || !pluginRoot) {
        return definition;
    }
    const webPreferences = Object.assign({}, definition.config.webPreferences, {
        preload: path.join(pluginRoot, preload)
    });
    const config = Object.assign({}, definition.config, { webPreferences: webPreferences });
    return Object.assign({}, definition, { config: config });
}

function createFeatureWindowController(definitions, BrowserWindow) {
    const windows = new Map();

    function open(featureId, overrideDefinition, pluginRoot) {
        const raw = overrideDefinition || (definitions && definitions[featureId]);
        if (!raw) throw new Error('Unknown local feature window: ' + featureId);
        const definition = resolveFeatureDefinition(raw, pluginRoot);
        const existing = windows.get(featureId);
        if (existing && !existing.isDestroyed()) {
            existing.focus();
            return existing;
        }
        const win = new BrowserWindow(definition.config);
        windows.set(featureId, win);
        win.setMenuBarVisibility(false);
        win.setTitle(definition.title);
        if (typeof definition.configure === 'function') definition.configure(win);
        win.loadURL(definition.url);
        win.on('closed', () => { windows.delete(featureId); });
        return win;
    }

    return {
        open: open,
        get: (featureId) => windows.get(featureId) || null,
        resolveFeatureDefinition: resolveFeatureDefinition
    };
}

module.exports = createFeatureWindowController;
module.exports.resolveFeatureDefinition = resolveFeatureDefinition;
