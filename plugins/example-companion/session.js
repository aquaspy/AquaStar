// Demo session rule — DO NOT rewrite User-Agent on github.com document loads.
// GitHub is sensitive to UA/header mutation and will serve broken CSS/JS.
// Demonstrate web-request only on api.github.com (dashboard net-fetch path).

function createSessionRules() {
    return [
        {
            id: 'example-api-header',
            urls: ['*://api.github.com/*'],
            onBeforeSendHeaders: function (details, ctx, callback) {
                details.requestHeaders = details.requestHeaders || {};
                details.requestHeaders['X-AquaStar-Example'] = 'example-companion';
                // Never replace User-Agent here.
                callback({ requestHeaders: details.requestHeaders });
            }
        }
    ];
}

module.exports = {
    createSessionRules: createSessionRules
};
