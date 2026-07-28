// WikiView (see res/features/wikiview/wikiviewsource.js) needs to fetch AQW Wiki pages
// from windows whose origin is account.aq.com, where a page-side fetch() would be blocked
// by CORS. Doing the request here in the main process sidesteps that entirely - it's a
// plain HTTP request, not a browser fetch, so there's no origin to police.
// Locked to the wiki domain since this handler is reachable from any window that has the
// wikiview preload (see res/windows/config.js) - it shouldn't become a general-purpose
// fetch proxy for whatever a loaded page asks for.
const { ipcMain, net } = require('electron');

ipcMain.handle('fetchWikiPage', async (event, targetUrl) => {
    if (typeof targetUrl !== 'string' || !/^https?:\/\/aqwwiki\.wikidot\.com\//i.test(targetUrl)) {
        return { ok: false, error: 'blocked' };
    }

    return new Promise((resolve) => {
        const request = net.request(targetUrl);
        let body = '';
        request.on('response', (response) => {
            response.on('data', (chunk) => { body += chunk.toString(); });
            response.on('end', () => resolve({ ok: true, html: body }));
            response.on('error', (err) => resolve({ ok: false, error: err.message }));
        });
        request.on('error', (err) => resolve({ ok: false, error: err.message }));
        request.end();
    });
});
