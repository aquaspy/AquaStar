// To-Do window - persistence + IPC. Shares the "per-character list" shape with Reminders
// (character tabs, seasonal tagging, shared/individual hidden-map - see
// res/features/common/list_window_common.js for the renderer-side logic they both use),
// but items are simple one-off tasks instead of recurring quests: no type/reset math and
// no `done` map - "hidden" doubles as "completed" here, there being nothing to reset.
const fs       = require('fs');
const path     = require('path');
const { app, ipcMain, clipboard } = require('electron');
const constant = require('../../const.js');
const locale   = require('../../locale.js');
const jsonStore = require('../../repositories/json-store.js');

const todoJsonFileName = constant.appName.toLocaleLowerCase() + '_todo.json'; // "aquastar_todo.json"
const todoJsonPath = path.join(constant.appDataDirectory, todoJsonFileName);

function _genId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Kept in sync with list_window_common.js's SEASONAL_EVENT_KEYS by hand (same reasoning as
// reminders.js's own copy: this one only needs to validate persisted data, not render it).
const SEASONAL_EVENT_KEYS = [
    'nulgathBirthday', 'carnival', 'dageBirthday', 'aprilFools', 'mayThe4th', 'starFestival',
    'kalaSeason', 'friday13', 'pirateDay', 'anniversary', 'blackFriday', 'frostval'
];
const CATEGORY_KEYS = ['drop', 'dailyDrop', 'shopMerge', 'questReward', 'hardFarm', 'reputationFarm'];

function _migrateTask(t) {
    t = (t && typeof t === 'object') ? t : {};
    return {
        id: typeof t.id === 'string' ? t.id : _genId('t'),
        name: typeof t.name === 'string' ? t.name : '',
        wikiLink: typeof t.wikiLink === 'string' ? t.wikiLink : '',
        joinCommand: typeof t.joinCommand === 'string' ? t.joinCommand : '',
        category: CATEGORY_KEYS.indexOf(t.category) !== -1 ? t.category : 'drop',
        priority: t.priority === true,
        seasonal: t.seasonal === true && SEASONAL_EVENT_KEYS.indexOf(t.seasonalEvent) !== -1,
        seasonalEvent: (t.seasonal === true && SEASONAL_EVENT_KEYS.indexOf(t.seasonalEvent) !== -1) ? t.seasonalEvent : null,
        hiddenBy: (t.hiddenBy && typeof t.hiddenBy === 'object') ? t.hiddenBy : {}
    };
}

function _loadTodo() {
    if (!fs.existsSync(todoJsonPath)) {
        const fresh = { characters: [], tasks: [], individualHiddenMode: false };
        jsonStore.write(todoJsonPath, fresh);
        return fresh;
    }
    try {
        const parsed = jsonStore.read(todoJsonPath);
        return {
            characters: Array.isArray(parsed.characters) ? parsed.characters : [],
            tasks:      (Array.isArray(parsed.tasks) ? parsed.tasks : []).map(_migrateTask),
            individualHiddenMode: parsed.individualHiddenMode === true
        };
    } catch (e) {
        console.log('[AquaStar] Failed to parse ' + todoJsonPath + ': ' + e.message);
        return { characters: [], tasks: [], individualHiddenMode: false };
    }
}

ipcMain.handle('getTodo', () => {
    return { data: _loadTodo(), savePath: todoJsonPath };
});

ipcMain.handle('getTodoMessages', () => {
    return locale.strings.todoMessages;
});

ipcMain.handle('saveTodo', (event, fullState) => {
    const toSave = {
        characters: Array.isArray(fullState && fullState.characters) ? fullState.characters : [],
        tasks:      Array.isArray(fullState && fullState.tasks) ? fullState.tasks : [],
        individualHiddenMode: (fullState && fullState.individualHiddenMode) === true
    };
    jsonStore.write(todoJsonPath, toSave);
    return { savedTo: todoJsonPath };
});

// Wiki links open in AquaStar's own tabbed window (same mechanism as the Wiki/Design Notes/
// Account menu items - see res/instances.js's newBrowserWindow), not the OS default browser,
// so WikiView hover-preview and the rest of the in-app browsing UX stay consistent. Restricted
// to http(s) so a task's free-text link field can't be used to launch an arbitrary protocol
// handler. Required lazily to avoid a circular require (instances.js pulls in keybindings.js
// which is loaded before this module).
ipcMain.on('todoOpenLink', (event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
        require('../../instances.js').newBrowserWindow(url);
    }
});

// Clipboard is main-process-only under sandbox:true/nodeIntegration:false, same reasoning
// as Reminders' "Copy this /join command" button.
ipcMain.on('todoCopyText', (event, text) => {
    clipboard.writeText(typeof text === 'string' ? text : '');
});

exports.todoJsonPath = todoJsonPath;
