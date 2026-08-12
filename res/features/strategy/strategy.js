// Strategy persistence and timer-shortcut bridge. The renderer owns the live countdown;
// the main process only registers Electron's PC-wide shortcut while this window asks for it.
const fs = require('fs');
const path = require('path');
const { ipcMain, globalShortcut } = require('electron');
const constant = require('../../const.js');
const locale = require('../../locale.js');

const strategyJsonPath = path.join(constant.appDataDirectory, constant.appName.toLocaleLowerCase() + '_strategy.json');
const defaultPath = path.join(__dirname, 'strategy_default.json');
const ROLES = ['support', 'dps', 'tank', 'dot'];
const POTION_KINDS = ['tonic', 'elixir', 'potion'];
const DEFAULT_TIMER_TYPES = [{ id: 'taunt', name: 'Taunt' }, { id: 'decay', name: 'Decay' }, { id: 'zone', name: 'Zone' }];
const DEFAULT_POTIONS = JSON.parse(fs.readFileSync(defaultPath, 'utf8')).potions;

function id(prefix) { return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function limit(boss) { return boss && boss.kind === 'challenge' ? 7 : 4; }
function timerEvent(raw, types) {
    raw = raw || {};
    return { id: typeof raw.id === 'string' ? raw.id : id('timer'), delay: Math.max(0, Number(raw.delay) || 0),
        typeId: types.some((type) => type.id === raw.typeId) ? raw.typeId : types[0].id,
        target: ['main', 'left', 'right'].indexOf(raw.target) !== -1 ? raw.target : 'main',
        player: Number.isInteger(raw.player) && raw.player >= 0 && raw.player < 7 ? raw.player : 0,
        assignment: text(raw.assignment), label: text(raw.label) };
}
// A timer role is an independent recurring responsibility: e.g. T1 fires at 6s and every
// 20s after that, while T2 fires at 16s and every 20s. It deliberately is not a shared
// event timeline.
function timerRole(raw, types) {
    raw = raw || {};
    return {
        id: typeof raw.id === 'string' ? raw.id : id('timerRole'),
        name: text(raw.name) || 'T1',
        offset: Math.max(0, Number(raw.offset) || 0),
        interval: Math.max(1, Number(raw.interval) || 1),
        typeId: types.some((type) => type.id === raw.typeId) ? raw.typeId : types[0].id,
        target: ['main', 'left', 'right'].indexOf(raw.target) !== -1 ? raw.target : 'main',
        note: text(raw.note)
    };
}
function strategy(raw, boss, types) {
    raw = raw || {};
    const slots = Array.isArray(raw.classIds) ? raw.classIds.slice(0, limit(boss)).map((value) => typeof value === 'string' ? value : '') : [];
    while (slots.length < limit(boss)) slots.push('');
    const rawTimers = raw.timers || {};
    return { id: typeof raw.id === 'string' ? raw.id : id('strategy'), name: text(raw.name) || 'Strategy', classIds: slots,
        bossNotes: typeof raw.bossNotes === 'string' ? raw.bossNotes : '',
        strategyNotes: typeof raw.strategyNotes === 'string' ? raw.strategyNotes : (typeof raw.notes === 'string' ? raw.notes : ''),
        timerRoles: Array.isArray(raw.timerRoles) ? raw.timerRoles.map((item) => timerRole(item, types)) : [],
        timers: { intro: Array.isArray(rawTimers.intro) ? rawTimers.intro.map((item) => timerEvent(item, types)) : [],
            loop: Array.isArray(rawTimers.loop) ? rawTimers.loop.map((item) => timerEvent(item, types)) : [] } };
}
function migrate(raw) {
    raw = raw || {};
    const timerTypes = (Array.isArray(raw.timerTypes) ? raw.timerTypes : DEFAULT_TIMER_TYPES)
        .map((item) => ({ id: typeof item.id === 'string' ? item.id : id('type'), name: text(item.name) }))
        .filter((item) => item.name);
    DEFAULT_TIMER_TYPES.forEach((item) => { if (!timerTypes.some((type) => type.id === item.id)) timerTypes.unshift(item); });
    const potions = (Array.isArray(raw.potions) ? raw.potions : []).map((item) => ({ id: typeof item.id === 'string' ? item.id : id('potion'), name: text(item.name), kind: POTION_KINDS.indexOf(item.kind) !== -1 ? item.kind : 'potion' })).filter((item) => item.name);
    // Default consumables are additive, so an existing strategy file gains new curated
    // items without losing custom entries or user choices.
    DEFAULT_POTIONS.forEach((item) => {
        if (!potions.some((potion) => potion.name.toLowerCase() === item.name.toLowerCase())) potions.push(item);
    });
    const classes = (Array.isArray(raw.classes) ? raw.classes : []).map((item) => ({ id: typeof item.id === 'string' ? item.id : id('class'), name: text(item.name), role: ROLES.indexOf(item.role) !== -1 ? item.role : 'support', favorites: { tonicId: text(item.favorites && item.favorites.tonicId), elixirId: text(item.favorites && item.favorites.elixirId), potionId: text(item.favorites && item.favorites.potionId) } })).filter((item) => item.name);
    const bosses = (Array.isArray(raw.bosses) ? raw.bosses : []).map((item) => ({ id: typeof item.id === 'string' ? item.id : id('boss'), name: text(item.name), joinCommand: text(item.joinCommand), generalInfo: typeof item.generalInfo === 'string' ? item.generalInfo : '', reset: item.reset === 'daily' ? 'daily' : 'weekly', hasZone: item.hasZone === true, kind: item.kind === 'challenge' ? 'challenge' : 'ultra', strategies: [] })).filter((item) => item.name);
    // The first version stored strategies at the root. Adopt them under their boss.
    const legacy = Array.isArray(raw.strategies) ? raw.strategies : [];
    bosses.forEach((boss) => {
        const own = Array.isArray((raw.bosses.find((item) => item && item.id === boss.id) || {}).strategies) ? (raw.bosses.find((item) => item && item.id === boss.id)).strategies : legacy.filter((item) => item && item.bossId === boss.id);
        boss.strategies = own.map((item) => strategy(item, boss, timerTypes));
    });
    return { potions: potions, classes: classes, timerTypes: timerTypes, bosses: bosses, timerShortcut: text(raw.timerShortcut) || 'Alt+Shift+U' };
}
function load() {
    if (!fs.existsSync(strategyJsonPath)) { const fresh = migrate(JSON.parse(fs.readFileSync(defaultPath, 'utf8'))); fs.writeFileSync(strategyJsonPath, JSON.stringify(fresh, null, 4)); return fresh; }
    try { return migrate(JSON.parse(fs.readFileSync(strategyJsonPath, 'utf8'))); }
    catch (error) { console.log('[AquaStar] Failed to parse ' + strategyJsonPath + ': ' + error.message); return migrate({}); }
}
function save(data) { const clean = migrate(data); fs.writeFileSync(strategyJsonPath, JSON.stringify(clean, null, 4)); return clean; }

let shortcutOwner = null;
let registeredShortcut = null;
function clearShortcut() { if (registeredShortcut) globalShortcut.unregister(registeredShortcut); registeredShortcut = null; shortcutOwner = null; }
ipcMain.handle('getStrategy', () => ({ data: load(), savePath: strategyJsonPath }));
ipcMain.handle('getStrategyMessages', () => locale.strings.strategyMessages);
ipcMain.handle('saveStrategy', (event, data) => ({ data: save(data), savePath: strategyJsonPath }));
ipcMain.handle('setStrategyTimerShortcut', (event, accelerator) => {
    clearShortcut();
    const key = text(accelerator);
    if (!key) return { ok: true };
    try {
        const registered = globalShortcut.register(key, () => { if (shortcutOwner && !shortcutOwner.isDestroyed()) shortcutOwner.send('strategyTimerToggle'); });
        if (!registered) return { ok: false, error: 'unavailable' };
        shortcutOwner = event.sender;
        registeredShortcut = key;
        event.sender.once('destroyed', clearShortcut);
        return { ok: true };
    } catch (error) { return { ok: false, error: 'invalid' }; }
});
ipcMain.on('clearStrategyTimerShortcut', (event) => { if (event.sender === shortcutOwner) clearShortcut(); });

exports.strategyJsonPath = strategyJsonPath;
