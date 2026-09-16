// Declarative AQW menu contributions (PR 6).
// App-menu Useful Pages stay in-place (loadURL); game-menu page links are new-window.

const urls = require('./urls.js');

function labelOr(labels, key, fallback) {
    if (labels && typeof labels[key] === 'string' && labels[key]) return labels[key];
    return fallback;
}

/**
 * App / context menu Useful Pages. Every link uses openMode 'in-place' so the
 * focused window navigates via loadURL (matches generateLink in menu.js).
 */
function describeAppUsefulPages(ctx) {
    ctx = ctx || {};
    const U = (ctx.urls && ctx.urls.URLS) ? ctx.urls.URLS : urls.URLS;
    const labels = ctx.labels || {};
    const keybinds = ctx.keybinds || {};

    return [
        {
            id: 'wiki',
            label: labelOr(labels, 'menuWiki', 'AQW Wiki'),
            url: U.wikiReleases,
            keybindId: 'wiki',
            accelerator: keybinds.wiki,
            openMode: 'in-place',
            surface: 'app-menu'
        },
        {
            id: 'design',
            label: labelOr(labels, 'menuDesign', 'Design Notes'),
            url: U.designNotes,
            keybindId: 'design',
            accelerator: keybinds.design,
            openMode: 'in-place',
            surface: 'app-menu'
        },
        {
            id: 'balancePatchNotes',
            label: labelOr(labels, 'menuBalancePatchNotes', 'Balance Patch Notes'),
            url: U.balancePatchNotes,
            openMode: 'in-place',
            surface: 'app-menu'
        },
        {
            id: 'account',
            label: labelOr(labels, 'menuAccount', 'Account'),
            url: U.accountAq,
            keybindId: 'account',
            accelerator: keybinds.account,
            openMode: 'in-place',
            surface: 'app-menu'
        },
        {
            id: 'charpage',
            label: labelOr(labels, 'menuCharpage', 'Char Page'),
            url: U.charLookup,
            keybindId: 'charpage',
            accelerator: keybinds.charpage,
            openMode: 'in-place',
            surface: 'app-menu'
        },
        { type: 'separator' },
        {
            id: 'otherPages',
            label: labelOr(labels, 'menuOtherPages2', 'Other usefull Pages'),
            openMode: 'in-place',
            surface: 'app-menu',
            submenu: [
                {
                    id: 'dailyGifts',
                    label: labelOr(labels, 'menuDailyGifts', 'Daily Gifts'),
                    url: U.dailyGifts,
                    openMode: 'in-place',
                    surface: 'app-menu'
                },
                {
                    id: 'calendar',
                    label: labelOr(labels, 'menuCalendar', 'Calendar'),
                    url: U.calendar,
                    openMode: 'in-place',
                    surface: 'app-menu'
                },
                {
                    id: 'forge',
                    label: labelOr(labels, 'menuForge', 'Forge / Enchants'),
                    url: U.forgeEnchants,
                    openMode: 'in-place',
                    surface: 'app-menu'
                },
                {
                    id: 'heromart',
                    label: labelOr(labels, 'menuHeromart', 'Heromart'),
                    url: U.heromart,
                    openMode: 'in-place',
                    surface: 'app-menu'
                },
                {
                    id: 'portal',
                    label: labelOr(labels, 'menuPortal', 'Battleon Portal'),
                    url: U.battleon,
                    openMode: 'in-place',
                    surface: 'app-menu'
                }
            ]
        },
        {
            id: 'socialMedia',
            label: labelOr(labels, 'menuSocialMedia', 'Social Media'),
            openMode: 'in-place',
            surface: 'app-menu',
            submenu: [
                {
                    id: 'twitter',
                    label: labelOr(labels, 'menuTwitter', 'Twitter'),
                    url: U.twtAlina,
                    openMode: 'in-place',
                    surface: 'app-menu'
                },
                {
                    id: 'reddit',
                    label: labelOr(labels, 'menuReddit', 'Reddit'),
                    url: U.redditAqw,
                    openMode: 'in-place',
                    surface: 'app-menu'
                }
            ]
        }
    ];
}

/**
 * Game-menu Useful Pages entries. These dispatch through runGameMenuAction /
 * newBrowserWindow today, so openMode is 'new-window'.
 */
function describeGameMenuPages(ctx) {
    ctx = ctx || {};
    const U = (ctx.urls && ctx.urls.URLS) ? ctx.urls.URLS : urls.URLS;
    const labels = ctx.labels || {};
    const keybinds = ctx.keybinds || {};

    return [
        {
            id: 'wiki',
            action: 'wiki',
            label: labelOr(labels, 'menuWiki', 'AQW Wiki'),
            url: U.wikiReleases,
            keybindId: 'wiki',
            accelerator: keybinds.wiki,
            openMode: 'new-window',
            surface: 'game-menu'
        },
        {
            id: 'design',
            action: 'design',
            label: labelOr(labels, 'menuDesign', 'Design Notes'),
            url: U.designNotes,
            keybindId: 'design',
            accelerator: keybinds.design,
            openMode: 'new-window',
            surface: 'game-menu'
        },
        {
            id: 'account',
            action: 'account',
            label: labelOr(labels, 'menuAccount', 'Account'),
            url: U.accountAq,
            keybindId: 'account',
            accelerator: keybinds.account,
            openMode: 'new-window',
            surface: 'game-menu'
        },
        {
            id: 'charpage',
            action: 'charpage',
            label: labelOr(labels, 'menuCharpage', 'Char Page'),
            url: U.charLookup,
            keybindId: 'charpage',
            accelerator: keybinds.charpage,
            openMode: 'new-window',
            surface: 'game-menu'
        }
    ];
}

function flattenLinkItems(items, out) {
    out = out || [];
    (items || []).forEach(function (item) {
        if (!item || item.type === 'separator') return;
        if (item.submenu) {
            flattenLinkItems(item.submenu, out);
            return;
        }
        if (item.url && item.openMode) out.push(item);
    });
    return out;
}

function linkToMenuItem(link, ctx) {
    const openMode = link.openMode || 'in-place';
    return {
        label: link.label,
        accelerator: link.accelerator,
        registerAccelerator: false,
        openMode: openMode,
        click: function (menuItem, focusedWin) {
            if (typeof ctx.openLink === 'function') {
                ctx.openLink(link.url, openMode, focusedWin);
                return;
            }
            if (openMode === 'in-place' && focusedWin && focusedWin.webContents) {
                focusedWin.webContents.loadURL(link.url);
            }
        }
    };
}

function itemsToMenuTemplate(items, ctx) {
    return (items || []).map(function (item) {
        if (item.type === 'separator') return { type: 'separator' };
        if (item.submenu) {
            return {
                label: item.label,
                openMode: item.openMode,
                submenu: itemsToMenuTemplate(item.submenu, ctx)
            };
        }
        return linkToMenuItem(item, ctx);
    });
}

/**
 * MenuContributor for PluginHost.registerMenus.
 * Contributes the Useful Pages submenu using in-place openMode.
 */
function createMenuContributor(options) {
    options = options || {};
    const urlMod = options.urls || urls;

    return function menuContributor(ctx) {
        ctx = ctx || {};
        const labels = (ctx.labels) ||
            (ctx.locale && ctx.locale.menuMessages) ||
            {};
        const described = describeAppUsefulPages({
            urls: urlMod,
            labels: labels,
            keybinds: ctx.keybinds || {}
        });
        const sectionLabel = labelOr(labels, 'menuOtherPages', 'Usefull Pages');
        return [{
            id: 'aqw-useful-pages',
            label: sectionLabel,
            openMode: 'in-place',
            submenu: itemsToMenuTemplate(described, ctx)
        }];
    };
}

function register(host, options) {
    host.registerMenus(createMenuContributor(options));
}

module.exports = {
    describeAppUsefulPages: describeAppUsefulPages,
    describeGameMenuPages: describeGameMenuPages,
    flattenLinkItems: flattenLinkItems,
    createMenuContributor: createMenuContributor,
    register: register
};
