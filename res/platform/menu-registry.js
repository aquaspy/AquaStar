// Platform menu contributor registry (PR 6).
// Populated from the active PluginHost after activate(); empty when pluginSystem is off.

let contributors = [];
let appUsefulPagesBuilder = null;
let gameMenuPagesBuilder = null;

function clear() {
    contributors = [];
    appUsefulPagesBuilder = null;
    gameMenuPagesBuilder = null;
}

function setContributors(list) {
    contributors = Array.isArray(list) ? list.slice() : [];
}

function getContributors() {
    return contributors.slice();
}

function setPageProviders(providers) {
    providers = providers || {};
    appUsefulPagesBuilder = typeof providers.appUsefulPages === 'function'
        ? providers.appUsefulPages
        : null;
    gameMenuPagesBuilder = typeof providers.gameMenuPages === 'function'
        ? providers.gameMenuPages
        : null;
}

function getAppUsefulPages(ctx) {
    if (typeof appUsefulPagesBuilder !== 'function') return null;
    return appUsefulPagesBuilder(ctx || {});
}

function getGameMenuPages(ctx) {
    if (typeof gameMenuPagesBuilder !== 'function') return null;
    return gameMenuPagesBuilder(ctx || {});
}

function hasAppUsefulPages() {
    return typeof appUsefulPagesBuilder === 'function';
}

/**
 * Evaluate registered MenuContributor functions into a flat Electron menu template.
 */
function buildMenuItems(ctx) {
    const items = [];
    contributors.forEach(function (contributor) {
        if (typeof contributor !== 'function') return;
        const part = contributor(ctx || {});
        if (Array.isArray(part)) {
            for (let i = 0; i < part.length; i++) items.push(part[i]);
        }
    });
    return items;
}

/**
 * Wire host menu contributors + optional page providers after activate.
 * providers typically comes from host state.menuProviders (registerMenuPages).
 */
function adoptHostState(hostState, providers) {
    hostState = hostState || {};
    setContributors(hostState.menus || []);
    // Always replace providers so a previous plugin cannot leak pages.
    setPageProviders(providers || hostState.menuProviders || null);
}

function hasGameMenuPages() {
    return typeof gameMenuPagesBuilder === 'function';
}

module.exports = {
    clear: clear,
    setContributors: setContributors,
    getContributors: getContributors,
    setPageProviders: setPageProviders,
    getAppUsefulPages: getAppUsefulPages,
    getGameMenuPages: getGameMenuPages,
    hasAppUsefulPages: hasAppUsefulPages,
    hasGameMenuPages: hasGameMenuPages,
    buildMenuItems: buildMenuItems,
    adoptHostState: adoptHostState
};
