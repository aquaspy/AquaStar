// Reminders window - persistence + IPC. Mirrors keybindings.js's Settings IPC
// section but simpler: single storage file, no default-merging for most fields
// (saveReminders overwrites the whole file wholesale since the renderer always
// sends its full current in-memory state back) - the one exception is quests,
// which get seeded once from reminders_default.json on first run (see below).
const fs       = require('fs');
const path     = require('path');
const { app, ipcMain, clipboard } = require('electron');
const constant = require('../../const.js');
const locale   = require('../../locale.js');

const remindersJsonFileName = constant.appName.toLocaleLowerCase() + '_reminders.json'; // "aquastar_reminders.json"
const legacyRemindersJsonPath = path.join(app.getPath('appData'), remindersJsonFileName);
const remindersJsonPath = path.join(constant.appDataDirectory, remindersJsonFileName);
const remindersDefaultPath = path.join(__dirname, 'reminders_default.json');

if (!fs.existsSync(remindersJsonPath) && fs.existsSync(legacyRemindersJsonPath)) {
    try { fs.copyFileSync(legacyRemindersJsonPath, remindersJsonPath); }
    catch (e) { console.log('[AquaStar] Could not migrate reminders: ' + e.message); }
}

function _genId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Migrates the old single boolean `hidden` field (shared across every character) into the
// `hiddenBy` map (keyed by character id, plus a "__shared__" key) that per-character hiding
// needs. Quests saved before this feature existed only ever had the boolean, so their
// shared-mode hidden status carries over unchanged; quests already on the new shape pass through.
function _migrateQuest(q) {
    if (q.hiddenBy && typeof q.hiddenBy === 'object') return q;
    const hiddenBy = {};
    if (q.hidden === true) hiddenBy.__shared__ = true;
    const migrated = Object.assign({}, q, { hiddenBy: hiddenBy });
    delete migrated.hidden;
    return migrated;
}

// Quickstart list bundled with the app (res/reminders_default.json) - only used to seed
// a brand new aquastar_reminders.json on first run. After that, the user's own copy on
// disk is authoritative; editing or deleting these seeded entries works like any other.
function _buildSeedState() {
    let raw = { quests: [] };
    try {
        raw = JSON.parse(fs.readFileSync(remindersDefaultPath));
    } catch (e) {
        console.log('[AquaStar] Failed to read ' + remindersDefaultPath + ': ' + e.message);
    }
    const SEASONAL_EVENT_KEYS = [
        'nulgathBirthday', 'carnival', 'dageBirthday', 'aprilFools', 'mayThe4th', 'starFestival',
        'kalaSeason', 'friday13', 'pirateDay', 'anniversary', 'blackFriday', 'frostval'
    ];
    const quests = (Array.isArray(raw.quests) ? raw.quests : []).map((q) => ({
        id: _genId('q'),
        name: typeof q.name === 'string' ? q.name : '',
        joinCommand: typeof q.joinCommand === 'string' ? q.joinCommand : '',
        type: (q.type === 'weekly' || q.type === 'monthly') ? q.type : 'daily',
        category: ['class', 'ultra', 'other'].indexOf(q.category) !== -1 ? q.category : 'other',
        member: q.member === true,
        seasonal: q.seasonal === true && SEASONAL_EVENT_KEYS.indexOf(q.seasonalEvent) !== -1,
        seasonalEvent: (q.seasonal === true && SEASONAL_EVENT_KEYS.indexOf(q.seasonalEvent) !== -1) ? q.seasonalEvent : null,
        done: {},
        hiddenBy: {}
    }));
    return { characters: [], quests: quests, showCompleted: true, showMemberDailies: true, individualHiddenMode: false };
}

function _loadReminders() {
    if (!fs.existsSync(remindersJsonPath)) {
        const seeded = _buildSeedState();
        fs.writeFileSync(remindersJsonPath, JSON.stringify(seeded, null, 4));
        return seeded;
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(remindersJsonPath));
        return {
            characters: Array.isArray(parsed.characters) ? parsed.characters : [],
            quests:     (Array.isArray(parsed.quests) ? parsed.quests : []).map(_migrateQuest),
            showCompleted: parsed.showCompleted !== false,
            showMemberDailies: parsed.showMemberDailies !== false,
            individualHiddenMode: parsed.individualHiddenMode === true
        };
    } catch (e) {
        console.log('[AquaStar] Failed to parse ' + remindersJsonPath + ': ' + e.message);
        return { characters: [], quests: [], showCompleted: true, showMemberDailies: true, individualHiddenMode: false };
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
        quests:     Array.isArray(fullState && fullState.quests) ? fullState.quests : [],
        showCompleted: (fullState && fullState.showCompleted) !== false,
        showMemberDailies: (fullState && fullState.showMemberDailies) !== false,
        individualHiddenMode: (fullState && fullState.individualHiddenMode) === true
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
