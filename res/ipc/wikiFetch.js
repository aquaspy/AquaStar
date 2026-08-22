// WikiView (see res/features/wikiview/wikiviewsource.js) needs to fetch AQW Wiki pages
// from windows whose origin is account.aq.com, where a page-side fetch() would be blocked
// by CORS. Doing the request here in the main process sidesteps that entirely - it's a
// plain HTTP request, not a browser fetch, so there's no origin to police.
// Locked to the wiki domain since this handler is reachable from any window that has the
// wikiview preload (see res/windows/config.js) - it shouldn't become a general-purpose
// fetch proxy for whatever a loaded page asks for.
const { ipcMain, net } = require('electron');
const MAX_WIKI_RESPONSE_BYTES = 5 * 1024 * 1024;
const WIKI_REQUEST_TIMEOUT_MS = 15000;

ipcMain.handle('fetchWikiPage', async (event, targetUrl) => {
    if (typeof targetUrl !== 'string' || !/^https?:\/\/aqwwiki\.wikidot\.com\//i.test(targetUrl)) {
        return { ok: false, error: 'blocked' };
    }

    return new Promise((resolve) => {
        const request = net.request(targetUrl);
        let body = '';
        let bodyBytes = 0;
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            resolve(result);
        };
        request.setTimeout(WIKI_REQUEST_TIMEOUT_MS, () => {
            request.abort();
            finish({ ok: false, error: 'timeout' });
        });
        request.on('response', (response) => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
                request.abort();
                finish({ ok: false, error: 'http-' + response.statusCode });
                return;
            }
            response.on('data', (chunk) => {
                bodyBytes += chunk.length;
                if (bodyBytes > MAX_WIKI_RESPONSE_BYTES) {
                    request.abort();
                    finish({ ok: false, error: 'response-too-large' });
                    return;
                }
                body += chunk.toString();
            });
            response.on('end', () => finish({ ok: true, html: body }));
            response.on('error', (err) => finish({ ok: false, error: err.message }));
        });
        request.on('error', (err) => finish({ ok: false, error: err.message }));
        request.end();
    });
});
