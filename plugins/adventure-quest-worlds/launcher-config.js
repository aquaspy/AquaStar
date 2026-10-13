// Follow the loader URL Artix publishes for its own launcher.
//
// Artix Game Launcher does not hard-code the AQW loader: its web page
// (https://www.artix.com/gamelauncher) loads /scripts/AppLaunch.js and calls
// interop.setGameWindows(gameWindows). When Artix moved Loader3 -> Loader4 the launcher
// followed on the same day, while a hard-coded URL silently broke. This module reads that
// page, extracts the `aqw` entry, validates it and caches it. Anything that fails
// validation or fetching falls back to the built-in default in urls.js.

const PAGE_URL = 'https://www.artix.com/gamelauncher';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Find the AppLaunch.js script URL referenced by the launcher page. */
function extractScriptUrl(html) {
    if (typeof html !== 'string') return null;
    const match = /<script[^>]+src=["']([^"']*AppLaunch\.js[^"']*)["']/i.exec(html);
    if (!match) return null;
    let resolved;
    try { resolved = new URL(match[1], PAGE_URL); } catch (e) { return null; }
    if (resolved.protocol !== 'https:' || resolved.hostname !== 'www.artix.com') return null;
    return resolved.toString();
}

/**
 * Parse the `var gameWindows = { ... }` literal into { key: url }. Pure text parsing:
 * the remote script is never evaluated. Commented-out lines are ignored and, like the
 * JS object literal, a later duplicate key wins.
 */
function parseGameWindows(js) {
    if (typeof js !== 'string') return {};
    const start = js.search(/var\s+gameWindows\s*=\s*\{/);
    if (start === -1) return {};
    const lines = js.slice(start).split(/\r?\n/).slice(1);
    const out = {};
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*\};?\s*$/.test(line)) break;
        if (/^\s*\/\//.test(line)) continue;
        const m = /^\s*([A-Za-z0-9_]+)\s*:\s*\{\s*url\s*:\s*"([^"]+)"/.exec(line);
        if (m) out[m[1]] = m[2];
    }
    return out;
}

/**
 * @param {object} deps
 * @param {(url: string, opts?: object) => Promise<{ok: boolean, html?: string, error?: string}>} deps.fetchText
 * @param {{read: Function, write: Function}} deps.store
 * @param {{ loaderUrl: Function, setLoaderUrl: Function, isValidLoaderUrl: Function }} deps.urls
 * @param {(msg: string) => void} [deps.log]
 * @param {() => number} [deps.now]
 */
function createLauncherConfig(deps) {
    const log = deps.log || function () {};
    const now = deps.now || Date.now;

    function readCache() {
        try {
            const cached = deps.store.read();
            if (cached && typeof cached === 'object' && deps.urls.isValidLoaderUrl(cached.loaderUrl)) {
                return cached;
            }
        } catch (e) { /* an unreadable cache is just a cache miss */ }
        return null;
    }

    /** Synchronous: apply the cached loader (if any). Returns the cache entry used. */
    function applyCached() {
        const cached = readCache();
        if (cached && deps.urls.setLoaderUrl(cached.loaderUrl)) {
            log('loader from cache: ' + cached.loaderUrl);
            return cached;
        }
        return null;
    }

    /** A stale or missing cache is worth waiting a moment for at startup. */
    function isCacheFresh() {
        const cached = readCache();
        return !!(cached && typeof cached.checkedAt === 'number' &&
            (now() - cached.checkedAt) < CACHE_TTL_MS);
    }

    /** Fetch the launcher page, read its aqw entry, validate, apply and cache it. */
    async function refresh(opts) {
        const fetchOpts = { timeoutMs: (opts && opts.timeoutMs) || 8000, maxBytes: 512 * 1024 };
        const page = await deps.fetchText(PAGE_URL, fetchOpts);
        if (!page || !page.ok) return { ok: false, error: 'page: ' + (page && page.error) };

        const scriptUrl = extractScriptUrl(page.html);
        if (!scriptUrl) return { ok: false, error: 'AppLaunch.js not referenced by launcher page' };

        const script = await deps.fetchText(scriptUrl, fetchOpts);
        if (!script || !script.ok) return { ok: false, error: 'script: ' + (script && script.error) };

        const candidate = parseGameWindows(script.html).aqw;
        if (!deps.urls.isValidLoaderUrl(candidate)) {
            return { ok: false, error: 'rejected aqw url: ' + String(candidate).slice(0, 120) };
        }

        const before = deps.urls.loaderUrl();
        deps.urls.setLoaderUrl(candidate);
        try {
            deps.store.write({ loaderUrl: candidate, checkedAt: now(), source: scriptUrl });
        } catch (e) { log('could not cache loader url: ' + e.message); }

        const changed = candidate !== before;
        if (changed) log('loader url changed: ' + before + ' -> ' + candidate);
        return { ok: true, url: candidate, changed: changed };
    }

    return {
        applyCached: applyCached,
        isCacheFresh: isCacheFresh,
        refresh: refresh
    };
}

module.exports = {
    PAGE_URL: PAGE_URL,
    CACHE_TTL_MS: CACHE_TTL_MS,
    extractScriptUrl: extractScriptUrl,
    parseGameWindows: parseGameWindows,
    createLauncherConfig: createLauncherConfig
};
