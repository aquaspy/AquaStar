// Demo session rule: tag GitHub navigations with a custom header (observe/modify HTTP).

function createSessionRules() {
    return [
        {
            id: 'example-github-header',
            urls: ['*://github.com/*', '*://*.github.com/*'],
            onBeforeSendHeaders: function (details, ctx, callback) {
                details.requestHeaders = details.requestHeaders || {};
                details.requestHeaders['X-AquaStar-Example'] = 'example-companion';
                if (ctx && ctx.spoofedUA) {
                    details.requestHeaders['User-Agent'] = ctx.spoofedUA;
                }
                callback({ requestHeaders: details.requestHeaders });
            }
        }
    ];
}

module.exports = {
    createSessionRules: createSessionRules
};
