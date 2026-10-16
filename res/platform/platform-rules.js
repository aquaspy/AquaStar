// Session rules owned by the platform itself (not by any plugin). They go through the
// same applicator as plugin rules so that a plugin rule on the same webRequest event can
// never replace them (Electron keeps one listener per event).

// Ad / tracker hosts blocked in every window. The list is shared with AquaStar Lite
// (`ad-hosts.json`). Game traffic is never filtered here.
const AD_HOSTS = require('./ad-hosts.json');

function blockedHostPatterns(hosts) {
    return hosts.map(function (host) {
        return '*://*.' + host + '/*';
    });
}

const BLOCKED_HOST_PATTERNS = blockedHostPatterns(AD_HOSTS);

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
    AD_HOSTS: AD_HOSTS,
    blockedHostPatterns: blockedHostPatterns,
    BLOCKED_HOST_PATTERNS: BLOCKED_HOST_PATTERNS,
    createPlatformSessionRules: createPlatformSessionRules
};
