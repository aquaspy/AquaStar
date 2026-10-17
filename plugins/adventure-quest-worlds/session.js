// AQW session webRequest rules. Electron callback shapes match res/platform/session-rules.js.

const urls = require('./urls.js');
const { launcherUserAgent } = require('./user-agent.js');

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
                // The platform only hands over the browser's own UA; what Artix servers
                // should see is this plugin's decision (see user-agent.js).
                if (ctx && ctx.defaultUserAgent) {
                    details.requestHeaders['User-Agent'] = launcherUserAgent(ctx.defaultUserAgent);
                }
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
    list.push(urls.loaderUrl());
    list.push(urls.URLS.dfLoader);
    return list;
}

module.exports = {
    createSessionRules: createSessionRules,
    flashTrustUrlList: flashTrustUrlList
};
