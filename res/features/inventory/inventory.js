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
const wikiNameVariants = require('../wikiview/nameVariants.js');

const inventoryJsonFileName = constant.appName.toLocaleLowerCase() + '_inventory.json'; // "aquastar_inventory.json"
const inventoryJsonPath = path.join(constant.appDataDirectory, inventoryJsonFileName);

const INVENTORY_PAGE_SIZE = 100;
const BUYBACK_PAGE_SIZE = 100;

function _migrateItem(raw) {
    raw = raw || {};
    const name = typeof raw.name === 'string' ? raw.name.trimStart() : '';
    const type = typeof raw.type === 'string' ? raw.type : '';
    const added = typeof raw.added === 'string' ? raw.added : null;
    return {
        id:     Number.isFinite(raw.id) ? raw.id : null,
        name:   name, type: type,
        count:  Number.isFinite(raw.count) ? raw.count : 0,
        bank:   raw.bank === true,
        coins:  raw.coins === true,
        member: raw.member === true,
        added:  added,
        searchName: name.toLowerCase(), sortName: name.toLowerCase(), addedAt: new Date(added).getTime() || 0
    };
}

function _migrateBuyBackItem(raw) {
    raw = raw || {};
    const name = typeof raw.name === 'string' ? raw.name.trimStart() : '';
    const type = typeof raw.type === 'string' ? raw.type : '';
    const inserted = typeof raw.inserted === 'string' ? raw.inserted : null;
    return {
        itemId:     Number.isFinite(raw.itemId) ? raw.itemId : null,
        name:       name, type: type,
        cost:       Number.isFinite(raw.cost) ? raw.cost : 0,
        amount:     Number.isFinite(raw.amount) ? raw.amount : 0,
        inserted:   inserted,
        typeId:     Number.isFinite(raw.typeId) ? raw.typeId : null,
        rarity:     Number.isFinite(raw.rarity) ? raw.rarity : null,
        rarityName: typeof raw.rarityName === 'string' ? raw.rarityName : '',
        searchName: name.toLowerCase(), sortName: name.toLowerCase(), insertedAt: new Date(inserted).getTime() || 0
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
        return { characters: {}, lastActiveCharId: '', labels: _migrateLabels({}) };
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
            lastActiveCharId: typeof parsed.lastActiveCharId === 'string' ? parsed.lastActiveCharId : '',
            labels: _migrateLabels(parsed.labels)
        };
    } catch (e) {
        console.log('[AquaStar] Failed to parse ' + inventoryJsonPath + ': ' + e.message);
        return { characters: {}, lastActiveCharId: '', labels: _migrateLabels({}) };
    }
}

function _migrateLabels(raw) {
    raw = raw || {};
    const validColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#4da3ff';
    const tags = (Array.isArray(raw.tags) ? raw.tags : []).map((tag) => ({
        id: typeof tag.id === 'string' ? tag.id : 'label_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
        name: typeof tag.name === 'string' ? tag.name.trim() : '', color: validColor(tag.color),
        scope: tag.scope === 'global' || tag.scope === 'character' ? tag.scope : null
    })).filter((tag) => tag.name);
    const maps = (source) => {
        const out = {};
        if (!source || typeof source !== 'object') return out;
        Object.keys(source).forEach((key) => { if (Array.isArray(source[key])) out[key] = source[key].filter((id) => tags.some((tag) => tag.id === id)); });
        return out;
    };
    const characterItemLabels = {};
    if (raw.characterItemLabels && typeof raw.characterItemLabels === 'object') Object.keys(raw.characterItemLabels).forEach((charId) => { characterItemLabels[charId] = maps(raw.characterItemLabels[charId]); });
    // Older label data allowed the same tag in both maps. Infer its scope from an existing
    // global assignment so migration remains visible while future assignments are unambiguous.
    const globalItemLabels = maps(raw.globalItemLabels);
    Object.keys(globalItemLabels).forEach((key) => globalItemLabels[key].forEach((id) => {
        const tag = tags.find((entry) => entry.id === id);
        if (tag && !tag.scope) tag.scope = 'global';
    }));
    tags.forEach((tag) => { if (!tag.scope) tag.scope = 'character'; });
    return { tags: tags, globalItemLabels: globalItemLabels, characterItemLabels: characterItemLabels };
}

function _saveInventory(state) {
    state.labels = _migrateLabels(state.labels);
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

function _normalizeItemName(name) {
    return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

function _normalizeWikiSuffix(suffix) {
    return typeof suffix === 'string' ? suffix.toLowerCase() : '';
}

function _wikiBaseItemName(name) {
    const normalized = _normalizeItemName(name);
    const suffix = wikiNameVariants.allKnownSuffixes
        .filter((candidate) => candidate)
        .map(_normalizeWikiSuffix)
        .find((candidate) => normalized.endsWith(candidate));
    return suffix ? normalized.slice(0, -suffix.length).trim() : normalized;
}

function _matchesWikiItemName(inventoryName, target) {
    const normalizedInventoryName = _normalizeItemName(inventoryName);
    return wikiNameVariants.getSuffixesForName(target).some((suffix) => {
        return normalizedInventoryName === target + _normalizeWikiSuffix(suffix);
    });
}

// The Wiki labels old Unidentified drops with their revealed identity, whereas the AQW
// inventory API still calls them "Unidentified N".  These are intentionally explicit
// aliases, rather than fuzzy matching: a page can only count the single numbered item that
// AQW assigns to it.
const WIKI_UNIDENTIFIED_ALIASES = {
    'trig buster': 'Unidentified 1',
    "sharkbait's true head": 'Unidentified 2',
    'dragon bone hammer': 'Unidentified 3',
    'small hammer': 'Unidentified 4',
    'rounded stone hammer': 'Unidentified 5',
    'parasitic hacker': 'Unidentified 6',
    'star dagger': 'Unidentified 7',
    'bee sting dagger': 'Unidentified 8',
    'ordinary iron wing helm': 'Unidentified 9',
    'bag of dirt': 'Unidentified 10',
    'bone walking cane': 'Unidentified 12',
    'the contract of nulgath': 'Unidentified 13',
    'worn axe': 'Unidentified 14',
    'emblem mace': 'Unidentified 15',
    'iron plate hammer': 'Unidentified 16',
    'duck on a stick': 'Unidentified 17',
    'dark cyclops face': 'Unidentified 18',
    'koi fish in a sphere': 'Unidentified 19',
    'dragonbone blade': 'Unidentified 20',
    'dragonbone axe': 'Unidentified 21',
    'essence of the hex void': 'Unidentified 22',
    'essence of the blood void': 'Unidentified 23',
    'essence of the void fiend': 'Unidentified 24',
    'essence of the shadow void': 'Unidentified 25',
    'ordinary cape': 'Unidentified 26',
    'chameleon cape': 'Unidentified 27',
    'spinal tap': 'Unidentified 28',
    'mysterious walking cane': 'Unidentified 29',
    'platinum twin blade': 'Unidentified 30',
    'platinum battle shank': 'Unidentified 31',
    'cruel dagger of nulgath': 'Unidentified 32',
    'primal dagger tooth': 'Unidentified 33',
    'ball of malignant essence': 'Unidentified 34',
    'essence of the almighty archfiend': 'Unidentified 35',
    'the contract of lae': 'Unidentified 36',
    'bone slasher': 'Unidentified 65',
    'tyrant bone slasher': 'Unidentified 66'
};

// Checks the given (or currently active) character's synced data for an item matching the
// wiki page title. BuyBack entries aren't stackable counts like inventory items - each row
// is its own past sale, so "buyback" here is how many times that item shows up in the
// BuyBack history, not a quantity.
function _matchWikiItemInState(state, wikiTitle, charId) {
    const resolvedCharId = charId || state.lastActiveCharId;
    const character = resolvedCharId ? state.characters[String(resolvedCharId)] : null;
    if (!character) return { owned: false, bank: 0, inventory: 0, buyback: 0, matchedName: null };

    // The title shown in the Wiki is never changed. We only strip a recognized final
    // disambiguation tag for this internal ownership lookup.
    const displayedName = _wikiBaseItemName(wikiTitle);
    const target = _normalizeItemName(WIKI_UNIDENTIFIED_ALIASES[displayedName] || displayedName);
    if (!target) return { owned: false, bank: 0, inventory: 0, buyback: 0, matchedName: null };

    let bank = 0, inventoryCount = 0, buyback = 0, matchedName = null;
    character.inventory.forEach((item) => {
        if (_matchesWikiItemName(item.name, target)) {
            matchedName = matchedName || item.name;
            if (item.bank) bank += item.count;
            else inventoryCount += item.count;
        }
    });
    character.buyback.forEach((item) => {
        if (_matchesWikiItemName(item.name, target)) {
            matchedName = matchedName || item.name;
            buyback += 1;
        }
    });

    return { owned: (bank + inventoryCount + buyback) > 0, bank: bank, inventory: inventoryCount, buyback: buyback, matchedName: matchedName };
}

function matchWikiItem(wikiTitle, charId) {
    return _matchWikiItemInState(_loadInventory(), wikiTitle, charId);
}

ipcMain.handle('getInventory', () => {
    return { data: _loadInventory(), savePath: inventoryJsonPath };
});

ipcMain.handle('saveInventoryLabels', (event, labels) => {
    const state = _loadInventory();
    state.labels = _migrateLabels(labels);
    _saveInventory(state);
    return { labels: state.labels };
});

ipcMain.handle('getInventoryMessages', () => {
    return locale.strings.inventoryMessages;
});

ipcMain.handle('getWikiMessages', () => {
    return locale.strings.wikiMessages;
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

// Wiki pages can contain a fairly long list of linked requirements (merge shops, quest
// rewards, etc.).  Resolve them from one in-memory read instead of making the renderer
// send one IPC call per link, each of which would otherwise reopen the JSON file.
ipcMain.handle('matchWikiItems', (event, wikiTitles) => {
    if (!Array.isArray(wikiTitles)) return {};
    const titles = wikiTitles.filter((title) => typeof title === 'string').slice(0, 500);
    const state = _loadInventory();
    const charId = state.lastActiveCharId;
    const results = {};
    titles.forEach((title) => {
        results[title] = _matchWikiItemInState(state, title, charId);
    });
    return results;
});

// Strategy's consumables panel needs quantities, not just an owned/not-owned badge. This
// is deliberately exact-name matching: its curated potion list contains in-game names and
// must not merge AC/member/tagged variants into a normal consumable total.
ipcMain.handle('getInventoryItemCounts', (event, itemNames) => {
    if (!Array.isArray(itemNames)) return {};
    const names = itemNames.filter((name) => typeof name === 'string').slice(0, 200);
    const wanted = {};
    names.forEach((name) => { wanted[_normalizeItemName(name)] = name; });
    const counts = {};
    names.forEach((name) => { counts[name] = { characters: [] }; });
    const state = _loadInventory();
    Object.keys(state.characters).forEach((charId) => {
        const character = state.characters[charId];
        const characterCounts = {};
        names.forEach((name) => { characterCounts[name] = { inventory: 0, bank: 0 }; });
        character.inventory.forEach((item) => {
            // Consumables are normal items except Dark Potion, whose only relevant version is AC.
            if (item.member || (item.coins && _normalizeItemName(item.name) !== _normalizeItemName('Dark Potion'))) return;
            const originalName = wanted[_normalizeItemName(item.name)];
            if (!originalName) return;
            if (item.bank) characterCounts[originalName].bank += item.count;
            else characterCounts[originalName].inventory += item.count;
        });
        names.forEach((name) => {
            const quantity = characterCounts[name];
            counts[name].characters.push({ id: charId, name: character.name || ('Character ' + charId), inventory: quantity.inventory, bank: quantity.bank });
        });
    });
    return counts;
});

// Kept in the main process so the Inventory window remains sandboxed.  The destination is
// deliberately built from a plain item name and restricted to AQW Wiki's own domain.
ipcMain.handle('openInventoryItemWiki', (event, itemName) => {
    if (typeof itemName !== 'string' || !itemName.trim()) return { ok: false };
    const slug = wikiNameVariants.toWikiSlug(itemName);
    if (!slug) return { ok: false };
    require('../../instances.js').newBrowserWindow('http://aqwwiki.wikidot.com/' + slug);
    return { ok: true };
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
