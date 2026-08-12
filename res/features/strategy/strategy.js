const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const constant = require('../../const.js');
const locale = require('../../locale.js');

const strategyJsonPath = path.join(constant.appDataDirectory, constant.appName.toLocaleLowerCase() + '_strategy.json');
const defaultPath = path.join(__dirname, 'strategy_default.json');
const ROLES = ['support', 'dps', 'tank', 'dot'];

function id(prefix) { return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function migrateClass(item) { return { id: typeof item.id === 'string' ? item.id : id('class'), name: text(item.name), role: ROLES.indexOf(item.role) !== -1 ? item.role : 'support' }; }
function migrateBoss(item) { return { id: typeof item.id === 'string' ? item.id : id('boss'), name: text(item.name), joinCommand: text(item.joinCommand), reset: item.reset === 'daily' ? 'daily' : 'weekly', hasZone: item.hasZone === true, kind: item.kind === 'challenge' ? 'challenge' : 'ultra' }; }
function migrateStrategy(item, bosses) {
    const boss = bosses.find((entry) => entry.id === item.bossId);
    const limit = boss && boss.kind === 'challenge' ? 7 : 4;
    return { id: typeof item.id === 'string' ? item.id : id('strategy'), bossId: boss ? boss.id : '', classIds: Array.isArray(item.classIds) ? item.classIds.slice(0, limit).map((value) => typeof value === 'string' ? value : '') : Array(limit).fill(''), notes: typeof item.notes === 'string' ? item.notes : '' };
}
function migrate(raw) {
    raw = raw || {};
    const bosses = Array.isArray(raw.bosses) ? raw.bosses.map(migrateBoss).filter((item) => item.name) : [];
    return { classes: Array.isArray(raw.classes) ? raw.classes.map(migrateClass).filter((item) => item.name) : [], bosses: bosses, strategies: Array.isArray(raw.strategies) ? raw.strategies.map((item) => migrateStrategy(item || {}, bosses)).filter((item) => item.bossId) : [] };
}
function load() {
    if (!fs.existsSync(strategyJsonPath)) {
        const fresh = migrate(JSON.parse(fs.readFileSync(defaultPath, 'utf8')));
        fs.writeFileSync(strategyJsonPath, JSON.stringify(fresh, null, 4));
        return fresh;
    }
    try { return migrate(JSON.parse(fs.readFileSync(strategyJsonPath, 'utf8'))); }
    catch (error) { console.log('[AquaStar] Failed to parse ' + strategyJsonPath + ': ' + error.message); return migrate({}); }
}
function save(data) { const clean = migrate(data); fs.writeFileSync(strategyJsonPath, JSON.stringify(clean, null, 4)); return clean; }

ipcMain.handle('getStrategy', () => ({ data: load(), savePath: strategyJsonPath }));
ipcMain.handle('getStrategyMessages', () => locale.strings.strategyMessages);
ipcMain.handle('saveStrategy', (event, data) => ({ data: save(data), savePath: strategyJsonPath }));

exports.strategyJsonPath = strategyJsonPath;
