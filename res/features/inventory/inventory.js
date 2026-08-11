// Inventory window - persistence + IPC. Mirrors res/features/reminders/reminders.js's
// shape (storage path, migrate-on-load, ipcMain handlers) but the data itself is synced
// from account.aq.com rather than authored by the user, so there's no generic "save whole
// state" handler exposed to the renderer - only setInventoryActiveChar (which tab is open)
// and syncInventoryNow (which actually mutates item data) are writable from the UI side.
//
// Cookie/session note: no cookie is ever read, stored, or reattached by this module. The
// user logs into account.aq.com once through the existing Alt+A window (res/instances.js's
// newBrowserWindow uses windowConfig.winConfig, which implicitly uses session.defaultSession).
// net.request() below shares that same default session automatically - same mechanism
// res/ipc/wikiFetch.js already relies on for wiki pages, just against an authenticated
// endpoint here instead of a public one.
const fs       = require('fs');
const path     = require('path');
const { app, ipcMain, net, session } = require('electron');
const constant = require('../../const.js');
const locale   = require('../../locale.js');

const inventoryJsonFileName = constant.appName.toLocaleLowerCase() + '_inventory.json'; // "aquastar_inventory.json"
const inventoryJsonPath = path.join(constant.appDataDirectory, inventoryJsonFileName);

const INVENTORY_PAGE_SIZE = 100;
const BUYBACK_PAGE_SIZE = 100;

function _migrateItem(raw) {
    raw = raw || {};
    return {
        id:     Number.isFinite(raw.id) ? raw.id : null,
        name:   typeof raw.name === 'string' ? raw.name : '',
        type:   typeof raw.type === 'string' ? raw.type : '',
        count:  Number.isFinite(raw.count) ? raw.count : 0,
        bank:   raw.bank === true,
        coins:  raw.coins === true,
        member: raw.member === true,
        added:  typeof raw.added === 'string' ? raw.added : null
    };
}

function _migrateBuyBackItem(raw) {
    raw = raw || {};
    return {
        itemId:     Number.isFinite(raw.itemId) ? raw.itemId : null,
        name:       typeof raw.name === 'string' ? raw.name : '',
        type:       typeof raw.type === 'string' ? raw.type : '',
        cost:       Number.isFinite(raw.cost) ? raw.cost : 0,
        amount:     Number.isFinite(raw.amount) ? raw.amount : 0,
        inserted:   typeof raw.inserted === 'string' ? raw.inserted : null,
        typeId:     Number.isFinite(raw.typeId) ? raw.typeId : null,
        rarity:     Number.isFinite(raw.rarity) ? raw.rarity : null,
        rarityName: typeof raw.rarityName === 'string' ? raw.rarityName : ''
    };
}

function _migrateCharacter(charId, raw) {
    raw = raw || {};
    return {
        charId: Number(charId) || 0,
        name: typeof raw.name === 'string' ? raw.name : null,
        lastInventorySync: typeof raw.lastInventorySync === 'string' ? raw.lastInventorySync : null,
        lastBuyBackSync:   typeof raw.lastBuyBackSync   === 'string' ? raw.lastBuyBackSync   : null,
        lastWheelSync:     typeof raw.lastWheelSync     === 'string' ? raw.lastWheelSync     : null,
        inventory: Array.isArray(raw.inventory) ? raw.inventory.map(_migrateItem) : [],
        buyback:   Array.isArray(raw.buyback)   ? raw.buyback.map(_migrateBuyBackItem) : [],
        // Reserved shape - Wheel of Doom has no known JSON endpoint yet, left unimplemented
        // until one is confirmed. Not synced anywhere below.
        wheel: Array.isArray(raw.wheel) ? raw.wheel : []
    };
}

function _loadInventory() {
    if (!fs.existsSync(inventoryJsonPath)) {
        return { characters: {}, lastActiveCharId: '' };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(inventoryJsonPath));
        const rawChars = (parsed.characters && typeof parsed.characters === 'object') ? parsed.characters : {};
        const characters = {};
        Object.keys(rawChars).forEach((charId) => {
            characters[charId] = _migrateCharacter(charId, rawChars[charId]);
        });
        return {
            characters: characters,
            lastActiveCharId: typeof parsed.lastActiveCharId === 'string' ? parsed.lastActiveCharId : ''
        };
    } catch (e) {
        console.log('[AquaStar] Failed to parse ' + inventoryJsonPath + ': ' + e.message);
        return { characters: {}, lastActiveCharId: '' };
    }
}

function _saveInventory(state) {
    fs.writeFileSync(inventoryJsonPath, JSON.stringify(state, null, 4));
}

// --- account.aq.com fetch helpers ---
// Plain net.request(), promise-resolve-never-reject, mirroring res/ipc/wikiFetch.js's
// established pattern in this codebase. Requests share Electron's default persistent
// session automatically, which is what carries the login cookie from the Alt+A window.

// net.request() does NOT send session cookies by default (useSessionCookies defaults to
// false) - unlike a real BrowserWindow navigation, which always behaves like a browser.
// Without this, every request here would look logged-out even with a valid Alt+A session.
function _fetchText(url) {
    return new Promise((resolve) => {
        const request = net.request({
            url: url,
            session: session.defaultSession,
            useSessionCookies: true
        });
        let body = '';
        request.on('response', (response) => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
                resolve({ ok: false, error: 'network' });
                return;
            }
            response.on('data', (chunk) => { body += chunk.toString(); });
            response.on('end', () => resolve({ ok: true, body: body }));
            response.on('error', () => resolve({ ok: false, error: 'network' }));
        });
        request.on('error', () => resolve({ ok: false, error: 'network' }));
        request.end();
    });
}

async function _fetchJsonPage(baseUrl, skip, take) {
    const url = baseUrl + '&skip=' + skip + '&take=' + take + '&requireTotalCount=true&_=' + Date.now();
    const result = await _fetchText(url);
    if (!result.ok) return { ok: false, error: result.error };
    try {
        const parsed = JSON.parse(result.body);
        if (!Array.isArray(parsed.data)) return { ok: false, error: 'unauthenticated' };
        return { ok: true, data: parsed.data };
    } catch (e) {
        return { ok: false, error: 'unauthenticated' }; // HTML login/error page instead of JSON = no valid session
    }
}

async function _fetchAllPages(baseUrl, take) {
    const items = [];
    let skip = 0;
    for (;;) {
        const page = await _fetchJsonPage(baseUrl, skip, take);
        if (!page.ok) return page;
        items.push.apply(items, page.data);
        if (page.data.length < take) break;
        skip += take;
        if (skip > 20000) break; // sanity cap, avoids an infinite loop against a misbehaving API
    }
    return { ok: true, data: items };
}

// Username display name, scraped from the logged-in landing page.
async function _fetchUsername() {
    const result = await _fetchText('https://account.aq.com/Home');
    if (!result.ok) return { ok: false, error: result.error };
    const match = result.body.match(/<span class="small fw-bold ml-1 ms-lg-3">([^<]+)<\/span>/i);
    if (!match) return { ok: false, error: 'unauthenticated' };
    return { ok: true, name: match[1].trim() };
}

// CharPage doesn't require authentication - resolves a character name to its numeric
// AQW_CharID ("ccid"). Inventory API rows carry no character-linkage field of their own
// (only BuyBack rows do), so this is the canonical way to know which character a sync run
// belongs to, not a fallback.
async function _fetchCharId(charName) {
    const result = await _fetchText('https://account.aq.com/CharPage?id=' + encodeURIComponent(charName));
    if (!result.ok) return { ok: false, error: result.error };
    const match = result.body.match(/var ccid = (\d+);/);
    if (!match) return { ok: false, error: 'parse' };
    return { ok: true, charId: parseInt(match[1], 10) };
}

function _toIsoOrNull(value) {
    if (typeof value !== 'string' || !value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

function _convertInventoryRow(row) {
    return {
        id: Number.isFinite(row.ID) ? row.ID : null,
        name: typeof row.Name === 'string' ? row.Name : '',
        type: typeof row.Type === 'string' ? row.Type : '',
        count: Number.isFinite(row.Count) ? row.Count : 0,
        bank: row.Bank === 1 || row.Bank === true,
        coins: row.Coins === 1 || row.Coins === true,
        member: row.Member === 1 || row.Member === true,
        added: _toIsoOrNull(row.Added)
    };
}

function _convertBuyBackRow(row) {
    return {
        itemId: Number.isFinite(row.AQW_ItemID) ? row.AQW_ItemID : null,
        name: typeof row.strName === 'string' ? row.strName : '',
        type: typeof row.strType === 'string' ? row.strType : '',
        cost: Number.isFinite(row.intCost) ? row.intCost : 0,
        amount: Number.isFinite(row.intAmount) ? row.intAmount : 0,
        inserted: _toIsoOrNull(row.dateInsert),
        typeId: Number.isFinite(row.AQW_TypeID) ? row.AQW_TypeID : null,
        rarity: Number.isFinite(row.intRarity) ? row.intRarity : null,
        rarityName: typeof row.sRarityName === 'string' ? row.sRarityName : ''
    };
}

// Syncs whichever character is active in the current account.aq.com session. There is no
// way to target a different character without the user actually switching characters on
// the AQW site itself first - Electron only ever holds one active session/cookie, and the
// API differentiates characters via that session, not a request parameter.
async function syncActiveCharacter() {
    const userResult = await _fetchUsername();
    if (!userResult.ok) return { ok: false, error: userResult.error };

    const charIdResult = await _fetchCharId(userResult.name);
    if (!charIdResult.ok) return { ok: false, error: charIdResult.error };

    // One request in flight at a time, deliberately - classic ASP.NET session state (which
    // account.aq.com appears to use) serializes/locks concurrent requests sharing the same
    // session cookie, and firing this alongside whatever the account.aq.com page itself has
    // in flight (e.g. right after clicking the injected Sync Now button) can make the page's
    // own request queue up behind ours and time out. Sequential is slower but much gentler.
    const inventoryResult = await _fetchAllPages('https://account.aq.com/myapi/inventory/InventoryData?', INVENTORY_PAGE_SIZE);
    if (!inventoryResult.ok) return { ok: false, error: inventoryResult.error };

    const buybackResult = await _fetchAllPages('https://account.aq.com/myapi/inventory/BuyBackData?', BUYBACK_PAGE_SIZE);
    if (!buybackResult.ok) return { ok: false, error: buybackResult.error };

    const state = _loadInventory();
    const charIdKey = String(charIdResult.charId);
    const existing = state.characters[charIdKey];
    const nowIso = new Date().toISOString();

    state.characters[charIdKey] = _migrateCharacter(charIdKey, {
        name: userResult.name,
        lastInventorySync: nowIso,
        lastBuyBackSync: nowIso,
        lastWheelSync: existing ? existing.lastWheelSync : null,
        inventory: inventoryResult.data.map(_convertInventoryRow),
        buyback: buybackResult.data.map(_convertBuyBackRow),
        wheel: existing ? existing.wheel : []
    });
    state.lastActiveCharId = charIdKey;
    _saveInventory(state);

    return { ok: true, charId: charIdResult.charId, charName: userResult.name, syncedAt: nowIso };
}

// The AQW wiki disambiguates items that can be acquired more than one way (a drop AND a
// merge-shop version, an AC-shop version...) by stacking parenthetical qualifiers onto the
// page name - e.g. "Proto Legion Dark Caster (Merge)", "Legion DoomKnight (Class) (AC)".
// Different acquisition method, but the same item as far as a player cares, so matching
// strips every trailing parenthetical group before comparing names. (Loosely mirrors what
// res/features/wikiview/hoverPreview.js does when trying to find the page in the first
// place - that side has to enumerate specific suffixes to construct a URL, this side just
// needs a normalized key to compare against, so it can be more aggressive.)
function _normalizeItemName(name) {
    if (typeof name !== 'string') return '';
    let normalized = name.trim();
    for (;;) {
        const next = normalized.replace(/\s*\([^()]*\)\s*$/, '');
        if (next === normalized) break;
        normalized = next;
    }
    return normalized.toLowerCase();
}

// Checks the given (or currently active) character's synced data for an item matching the
// wiki page title. BuyBack entries aren't stackable counts like inventory items - each row
// is its own past sale, so "buyback" here is how many times that item shows up in the
// BuyBack history, not a quantity.
function matchWikiItem(wikiTitle, charId) {
    const state = _loadInventory();
    const resolvedCharId = charId || state.lastActiveCharId;
    const character = resolvedCharId ? state.characters[String(resolvedCharId)] : null;
    if (!character) return { owned: false, bank: 0, inventory: 0, buyback: 0, matchedName: null };

    const target = _normalizeItemName(wikiTitle);
    if (!target) return { owned: false, bank: 0, inventory: 0, buyback: 0, matchedName: null };

    let bank = 0, inventoryCount = 0, buyback = 0, matchedName = null;
    character.inventory.forEach((item) => {
        if (_normalizeItemName(item.name) === target) {
            matchedName = matchedName || item.name;
            if (item.bank) bank += item.count;
            else inventoryCount += item.count;
        }
    });
    character.buyback.forEach((item) => {
        if (_normalizeItemName(item.name) === target) {
            matchedName = matchedName || item.name;
            buyback += 1;
        }
    });

    return { owned: (bank + inventoryCount + buyback) > 0, bank: bank, inventory: inventoryCount, buyback: buyback, matchedName: matchedName };
}

ipcMain.handle('getInventory', () => {
    return { data: _loadInventory(), savePath: inventoryJsonPath };
});

ipcMain.handle('getInventoryMessages', () => {
    return locale.strings.inventoryMessages;
});

ipcMain.handle('syncInventoryNow', async () => {
    try {
        return await syncActiveCharacter();
    } catch (e) {
        console.log('[AquaStar] Inventory sync failed: ' + e.message);
        return { ok: false, error: 'network' };
    }
});

ipcMain.handle('setInventoryActiveChar', (event, charId) => {
    const state = _loadInventory();
    state.lastActiveCharId = typeof charId === 'string' ? charId : '';
    _saveInventory(state);
    return { ok: true };
});

// Used by the wiki-page ownership badge (res/features/wikiview/wikiviewsource.js) - matches
// against whichever character is currently active (state.lastActiveCharId), which the same
// script's character-switcher chip keeps up to date via setInventoryActiveChar above.
ipcMain.handle('matchWikiItem', (event, wikiTitle) => {
    return matchWikiItem(wikiTitle);
});

const AUTO_SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Gated on the "autoSync" Settings option. Lazily requires keybindings.js (rather than at
// module load) to avoid a circular require - same reasoning as res/windows/menu.js's own
// lazy require of instances.js.
function _isAutoSyncEnabled() {
    try {
        const keybindings = require('../../keybindings.js');
        return !!(keybindings.keybinds && keybindings.keybinds.autoSync);
    } catch (e) {
        return false;
    }
}

function _autoSyncTick() {
    if (!_isAutoSyncEnabled()) return;
    syncActiveCharacter().catch((e) => {
        console.log('[AquaStar] Background inventory sync failed: ' + e.message);
    });
}

// Don't make a freshly-opened AquaStar wait a full interval before its first background
// sync - if autoSync is on and the last sync is already stale, catch up soon after boot
// instead. A short fixed delay (rather than 0) gives the app a moment to finish starting
// and, more importantly, gives the user a moment to log in via Alt+A on a fresh install.
setTimeout(() => {
    if (!_isAutoSyncEnabled()) return;
    const state = _loadInventory();
    const charIds = Object.keys(state.characters);
    const mostRecentSync = charIds.reduce((latest, id) => {
        const character = state.characters[id];
        const t = character.lastInventorySync ? new Date(character.lastInventorySync).getTime() : 0;
        return Math.max(latest, t);
    }, 0);
    if (Date.now() - mostRecentSync >= AUTO_SYNC_INTERVAL_MS) _autoSyncTick();
}, 30000);
setInterval(_autoSyncTick, AUTO_SYNC_INTERVAL_MS);

exports.inventoryJsonPath = inventoryJsonPath;
exports.syncActiveCharacter = syncActiveCharacter;
exports.matchWikiItem = matchWikiItem;
