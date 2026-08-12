// Shared Wiki item-name variants. This file runs both as a browser script (for the injected
// WikiView/Inventory renderers) and as a CommonJS module (for the main-process inventory
// ownership matcher), so future suffixes and exceptions have one source of truth.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquaStarWikiNameVariants = api;
})(typeof window !== 'undefined' ? window : null, function () {
    const disambiguationSuffixes = ['', ' (AC)', ' (0 AC)', ' (Rare)', ' (Merge)', ' (Class)', ' (Quest)', ' (Sword)', ' (Pet)'];

    // Exceptions whose Wiki page requires multiple stacked tags. Keys are plain in-game
    // names; values are the exact Wiki page suffix that belongs to that name.
    const nameOverrides = {
        'Legion DoomKnight': ' (Class) (Merge) (1)'
    };

    function normalizeName(name) {
        return typeof name === 'string' ? name.trim().toLowerCase() : '';
    }

    function findNameOverride(name) {
        const normalized = normalizeName(name);
        const key = Object.keys(nameOverrides).find(function (candidate) {
            return normalizeName(candidate) === normalized;
        });
        return key ? nameOverrides[key] : null;
    }

    // Includes the exception suffixes for stripping a page title such as
    // "Legion DoomKnight (Class) (AC)" back to its plain in-game name.
    const allKnownSuffixes = disambiguationSuffixes.concat(Object.keys(nameOverrides).map(function (key) {
        return nameOverrides[key];
    })).filter(function (suffix, index, suffixes) {
        return suffixes.indexOf(suffix) === index;
    }).sort(function (a, b) { return b.length - a.length; });

    function getSuffixesForName(name) {
        const override = findNameOverride(name);
        return override ? disambiguationSuffixes.concat([override]) : disambiguationSuffixes.slice();
    }

    return {
        disambiguationSuffixes: disambiguationSuffixes,
        allKnownSuffixes: allKnownSuffixes,
        findNameOverride: findNameOverride,
        getSuffixesForName: getSuffixesForName
    };
});
