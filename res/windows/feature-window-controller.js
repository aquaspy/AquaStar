// Generic singleton controller for local feature windows.  Electron is injected
// so lifecycle behavior can be tested with a small fake BrowserWindow.
function createFeatureWindowController(definitions, BrowserWindow) {
    const windows = new Map();

    function open(featureId) {
        const definition = definitions[featureId];
        if (!definition) throw new Error('Unknown local feature window: ' + featureId);
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

    return { open: open, get: (featureId) => windows.get(featureId) || null };
}

module.exports = createFeatureWindowController;
