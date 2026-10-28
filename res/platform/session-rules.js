// Apply platform + plugin SessionRule objects to Electron's defaultSession.
// Register-once-per-process (v1 plugin switch = restart).
//
// Electron keeps ONE listener per webRequest event per session: a second call to
// session.webRequest.onBeforeRequest() silently replaces the first. Rules therefore
// never register their own listeners. This module registers a single listener per
// event (filtered by the union of all rule URL patterns) and fans each request out to
// every rule whose patterns match, in registration order.

/**
 * Match an Electron/Chrome match pattern ("*://*.example.com/*", "<all_urls>") against a URL.
 * Supports the subset AquaStar rules use: scheme, host (exact / "*" / "*.suffix"), path glob.
 */
function matchesPattern(pattern, url) {
    if (pattern === '<all_urls>') return /^(https?|wss?|ftp|file):/i.test(url);
    const m = /^(\*|[a-z][a-z0-9+.-]*):\/\/([^/]*)(\/.*)$/i.exec(pattern);
    if (!m) return false;
    const u = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^#]*)/i.exec(url);
    if (!u) return false;

    const scheme = u[1].toLowerCase();
    if (m[1] !== '*' && m[1].toLowerCase() !== scheme) return false;
    if (m[1] === '*' && scheme !== 'http' && scheme !== 'https') return false;

    // Strip userinfo and port before comparing hosts.
    const host = u[2].replace(/^.*@/, '').replace(/:\d+$/, '').toLowerCase();
    const patHost = m[2].toLowerCase();
    if (patHost !== '*') {
        if (patHost.indexOf('*.') === 0) {
            const suffix = patHost.slice(2);
            if (host !== suffix && !host.endsWith('.' + suffix)) return false;
        } else if (host !== patHost.replace(/:\d+$/, '')) {
            return false;
        }
    }

    const pathRe = new RegExp('^' + m[3].split('*').map(function (part) {
        return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }).join('.*') + '$');
    return pathRe.test(u[3]);
}

function ruleMatches(rule, url) {
    for (let i = 0; i < rule.urls.length; i++) {
        if (matchesPattern(rule.urls[i], url)) return true;
    }
    return false;
}

function unionUrls(rules) {
    const seen = {};
    const list = [];
    rules.forEach(function (rule) {
        rule.urls.forEach(function (pattern) {
            if (!seen[pattern]) { seen[pattern] = true; list.push(pattern); }
        });
    });
    return list;
}

function applySessionRules(session, rules, ctx) {
    if (!session || !session.webRequest || !Array.isArray(rules)) return;
    ctx = ctx || {};
    const settings = ctx.settings || {};

    const active = rules.filter(function (rule) {
        if (!rule || !Array.isArray(rule.urls) || rule.urls.length === 0) return false;
        if (typeof rule.enabledWhen === 'function' && !rule.enabledWhen(settings)) return false;
        return true;
    });

    const headerRules = active.filter(function (r) { return typeof r.onBeforeSendHeaders === 'function'; });
    const requestRules = active.filter(function (r) { return typeof r.onBeforeRequest === 'function'; });
    const responseRules = active.filter(function (r) { return typeof r.onHeadersReceived === 'function'; });

    if (headerRules.length) {
        session.webRequest.onBeforeSendHeaders({ urls: unionUrls(headerRules) }, function (details, callback) {
            const matching = headerRules.filter(function (rule) { return ruleMatches(rule, details.url); });
            let index = 0;
            (function next() {
                if (index >= matching.length) {
                    callback({ requestHeaders: details.requestHeaders });
                    return;
                }
                const rule = matching[index++];
                rule.onBeforeSendHeaders(details, ctx, function (result) {
                    result = result || {};
                    if (result.cancel) { callback({ cancel: true }); return; }
                    if (result.requestHeaders) details.requestHeaders = result.requestHeaders;
                    next();
                });
            })();
        });
    }

    if (responseRules.length && typeof session.webRequest.onHeadersReceived === 'function') {
        session.webRequest.onHeadersReceived({ urls: unionUrls(responseRules) }, function (details, callback) {
            const matching = responseRules.filter(function (rule) { return ruleMatches(rule, details.url); });
            let index = 0;
            (function next() {
                if (index >= matching.length) {
                    callback({ responseHeaders: details.responseHeaders });
                    return;
                }
                const rule = matching[index++];
                rule.onHeadersReceived(details, ctx, function (result) {
                    result = result || {};
                    if (result.responseHeaders) details.responseHeaders = result.responseHeaders;
                    next();
                });
            })();
        });
    }

    if (requestRules.length) {
        session.webRequest.onBeforeRequest({ urls: unionUrls(requestRules) }, function (details, callback) {
            const matching = requestRules.filter(function (rule) { return ruleMatches(rule, details.url); });
            let index = 0;
            (function next() {
                if (index >= matching.length) {
                    callback({ cancel: false });
                    return;
                }
                const rule = matching[index++];
                rule.onBeforeRequest(details, ctx, function (result) {
                    result = result || {};
                    // A cancel or redirect from any rule is final.
                    if (result.cancel || result.redirectURL) { callback(result); return; }
                    next();
                });
            })();
        });
    }
}

module.exports = {
    applySessionRules: applySessionRules,
    matchesPattern: matchesPattern
};
