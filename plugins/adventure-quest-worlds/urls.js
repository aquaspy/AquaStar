// AQW / DragonFable URL catalog owned by the plugin (PR 3).
// const.js still re-exports these for migration callers until PR 8 removes shims.

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
    loader3: 'https://game.aq.com/game/gamefiles/Loader3.swf?ver=a',
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

module.exports = {
    URLS: URLS,
    testingAQW: testingAQW,
    isTestingAqwUrl: isTestingAqwUrl,
    buildCharLookupUrl: buildCharLookupUrl
};
