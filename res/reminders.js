// Reminders window - persistence + IPC. Mirrors keybindings.js's Settings IPC
// section but simpler: single storage file, no default-merging (there are no
// sensible defaults - a fresh install just gets {characters:[], quests:[]}),
// and saveReminders overwrites the whole file wholesale since the renderer
// always sends its full current in-memory state back.
const fs       = require('fs');
const path     = require('path');
const { app, ipcMain, clipboard } = require('electron');
const constant = require('./const.js');
const locale   = require('./locale.js');

const remindersJsonFileName = constant.appName.toLocaleLowerCase() + '_reminders.json'; // "aquastar_reminders.json"
const remindersJsonPath = path.join(app.getPath('appData'), remindersJsonFileName);

function _loadReminders() {
    if (!fs.existsSync(remindersJsonPath)) return { characters: [], quests: [] };
    try {
        const parsed = JSON.parse(fs.readFileSync(remindersJsonPath));
        return {
            characters: Array.isArray(parsed.characters) ? parsed.characters : [],
            quests:     Array.isArray(parsed.quests) ? parsed.quests : []
        };
    } catch (e) {
        console.log('[AquaStar] Failed to parse ' + remindersJsonPath + ': ' + e.message);
        return { characters: [], quests: [] };
    }
}

ipcMain.handle('getReminders', () => {
    return { data: _loadReminders(), savePath: remindersJsonPath };
});

ipcMain.handle('getRemindersMessages', () => {
    return locale.strings.remindersMessages;
});

ipcMain.handle('saveReminders', (event, fullState) => {
    const toSave = {
        characters: Array.isArray(fullState && fullState.characters) ? fullState.characters : [],
        quests:     Array.isArray(fullState && fullState.quests) ? fullState.quests : []
    };
    fs.writeFileSync(remindersJsonPath, JSON.stringify(toSave, null, 4));
    return { savedTo: remindersJsonPath };
});

// Clipboard is main-process-only under sandbox:true/nodeIntegration:false, same
// reasoning as the existing "Copy this page's URL" context-menu item in const.js.
ipcMain.on('remindersCopyText', (event, text) => {
    clipboard.writeText(typeof text === 'string' ? text : '');
});

exports.remindersJsonPath = remindersJsonPath;
