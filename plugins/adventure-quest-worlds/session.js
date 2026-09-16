// AQW session webRequest rules (PR 3). Electron callback shapes match main.js today.

const urls = require('./urls.js');

function createSessionRules() {
    return [
        {
            id: 'artix-ua',
            urls: [
                '*://*.aq.com/*',
                '*://aq.com/*',
                '*://game.aq.com/*',
                '*://play.dragonfable.com/*'
            ],
            onBeforeSendHeaders: function (details, ctx, callback) {
                details.requestHeaders['User-Agent'] = ctx.spoofedUA;
                details.requestHeaders['artixmode'] = 'launcher';
                callback({ requestHeaders: details.requestHeaders });
            }
        },
        {
            id: 'swf-log',
            urls: ['*://game.aq.com/game/*'],
            enabledWhen: function (settings) {
                return !!(settings && settings.swfLog);
            },
            onBeforeRequest: function (details, ctx, callback) {
                if (ctx && typeof ctx.logLine === 'function') ctx.logLine(details.url);
                callback({ cancel: false });
            }
        }
    ];
}

function flashTrustUrlList(primaryUrl) {
    const list = [];
    if (primaryUrl) list.push(primaryUrl);
    list.push(urls.URLS.loader3);
    list.push(urls.URLS.dfLoader);
    list.push(urls.URLS.testingPrefix);
    return list;
}

module.exports = {
    createSessionRules: createSessionRules,
    flashTrustUrlList: flashTrustUrlList
};
