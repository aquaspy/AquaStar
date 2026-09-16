// Apply plugin-registered SessionRule objects to Electron's defaultSession.
// Register-once-per-process (v1 plugin switch = restart).

function applySessionRules(session, rules, ctx) {
    if (!session || !session.webRequest || !Array.isArray(rules)) return;
    ctx = ctx || {};
    const settings = ctx.settings || {};

    rules.forEach(function (rule) {
        if (!rule || !Array.isArray(rule.urls) || rule.urls.length === 0) return;
        if (typeof rule.enabledWhen === 'function' && !rule.enabledWhen(settings)) return;

        const filter = { urls: rule.urls };
        if (typeof rule.onBeforeSendHeaders === 'function') {
            session.webRequest.onBeforeSendHeaders(filter, function (details, callback) {
                rule.onBeforeSendHeaders(details, ctx, callback);
            });
        }
        if (typeof rule.onBeforeRequest === 'function') {
            session.webRequest.onBeforeRequest(filter, function (details, callback) {
                rule.onBeforeRequest(details, ctx, callback);
            });
        }
    });
}

module.exports = {
    applySessionRules: applySessionRules
};
