// AQW / DragonFable URL catalog. The plugin is the only owner of these URLs: the platform
// asks the active plugin (primary game / launches) and never imports this file.

const URLS = {
    charLookup: 'https://account.aq.com/CharPage',
    designNotes: 'https://www.aq.com/gamedesignnotes/',
    balancePatchNotes: 'https://www.aq.com/gamedesignnotes/AQW-Balance-PatchNotes-9515',
    accountAq: 'https://account.aq.com/',
    wikiReleases: 'http://aqwwiki.wikidot.com/new-releases',
    heromart: 'https://www.heromart.com/',
    battleon: 'https://portal.battleon.com/',
    calendar: 'https://www.aq.com/lore/calendar',
    dailyGifts: 'https://www.aq.com/lore/dailygifts',
    forgeEnchants: 'https://www.aq.com/lore/guides/enhancementtraits',
    twtAlina: 'https://twitter.com/Alina_AE',
    redditAqw: 'https://www.reddit.com/r/AQW/',
    // Same loader Artix Game Launcher uses (its web page calls interop.setGameWindows with it).
    // Loader3.swf?ver=a is the retired loader and misbehaves against the current Game.swf.
    loader4: 'https://game.aq.com/game/gamefiles/Loader4.swf?ver=b',
    testingPrefix: 'https://game.aq.com/game/gamefiles/Loader_Spider.swf',
    dfLoader: 'https://play.dragonfable.com/game/DFLoader.swf?ver=668201'
};

function testingAQW() {
    return URLS.testingPrefix + '?ver=' + (Math.floor(Math.random() * 900) + 100);
}

function isTestingAqwUrl(target) {
    return typeof target === 'string' && target.indexOf(URLS.testingPrefix) === 0;
}

function buildCharLookupUrl(playerCharacter) {
    var id = playerCharacter == null ? '' :
        String(playerCharacter).trim().replace(/[^a-zA-Z0-9]/g, '');
    return id === '' ? URLS.charLookup : URLS.charLookup + '?id=' + encodeURIComponent(id);
}

// The AQW loader is not fixed: Artix moves it (Loader3 -> Loader4) and publishes the
// current one on the Artix Game Launcher page (see launcher-config.js). URLS.loader4 is
// the built-in default; liveLoader holds a validated value learned from that page.
const LOADER_URL_RE = /^https:\/\/game\.aq\.com\/game\/gamefiles\/Loader[A-Za-z0-9_]*\.swf(\?[A-Za-z0-9_=&.-]*)?$/;
const LOADER_PATH_RE = /^https:\/\/game\.aq\.com\/game\/gamefiles\/Loader\d*\.swf(\?|$)/;
let liveLoader = null;

function isValidLoaderUrl(candidate) {
    return typeof candidate === 'string' && candidate.length < 200 && LOADER_URL_RE.test(candidate);
}

function loaderUrl() {
    return liveLoader || URLS.loader4;
}

/** Accept a loader URL only if it is a game.aq.com gamefiles Loader*.swf. */
function setLoaderUrl(candidate) {
    if (!isValidLoaderUrl(candidate)) return false;
    liveLoader = candidate;
    return true;
}

function resetLoaderUrl() {
    liveLoader = null;
}

/**
 * True for the main AQW loader. Any numbered Loader<N>.swf counts, so a window opened
 * before the loader moved, or a customUrl pointing at an older one, is still the game.
 */
function isLoaderUrl(target) {
    return typeof target === 'string' && (target === loaderUrl() || LOADER_PATH_RE.test(target));
}

module.exports = {
    URLS: URLS,
    testingAQW: testingAQW,
    isTestingAqwUrl: isTestingAqwUrl,
    buildCharLookupUrl: buildCharLookupUrl,
    loaderUrl: loaderUrl,
    setLoaderUrl: setLoaderUrl,
    resetLoaderUrl: resetLoaderUrl,
    isLoaderUrl: isLoaderUrl,
    isValidLoaderUrl: isValidLoaderUrl
};
