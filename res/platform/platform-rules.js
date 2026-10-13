// Session rules owned by the platform itself (not by any plugin). They go through the
// same applicator as plugin rules so that a plugin rule on the same webRequest event can
// never replace them (Electron keeps one listener per event).

// Ad / tracker hosts blocked in every window. Game traffic is never filtered here.
const BLOCKED_HOST_PATTERNS = [
    '*://*.adsymptotic.com/*',
    '*://*.doubleclick.net/*',
    '*://*.onesignal.com/*',
    '*://*.nitropay.com/*',
    '*://translate.googleapis.com/*'
];

function createPlatformSessionRules() {
    return [
        {
            id: 'platform-adblock',
            urls: BLOCKED_HOST_PATTERNS.slice(),
            onBeforeRequest: function (_details, _ctx, callback) {
                callback({ cancel: true });
            }
        }
    ];
}

module.exports = {
    BLOCKED_HOST_PATTERNS: BLOCKED_HOST_PATTERNS,
    createPlatformSessionRules: createPlatformSessionRules
};
