// The Studio and capture helpers own their session, so the main process CORS rule
// never sees their requests. Serve the two local SWFs on the Artix URLs the movie
// asks for, and attach a narrow Artix CORS header so a sandboxed page can read them.

const fs = require('fs');
const { launcherUserAgent } = require('../user-agent.js');

const LOCAL_SWF = /^https:\/\/game\.aq\.com\/game\/gamefiles\/etc\/chardetail\/(characterB-empty-scene|characterB)\.swf(?:\?|$)/i;

function artixHost(url) {
    let host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch (_e) { return false; }
    return host === 'aq.com' || host.endsWith('.aq.com') ||
        host === 'artix.com' || host.endsWith('.artix.com') ||
        host === 'dragonfable.com' || host.endsWith('.dragonfable.com');
}

function withArtixCors(url, headers) {
    const next = new Headers(headers || undefined);
    if (artixHost(url) && !next.has('access-control-allow-origin')) {
        next.set('Access-Control-Allow-Origin', '*');
    }
    return next;
}

function installStudioHttps(electronSession, paths, userAgent) {
    const { net } = require('electron');
    electronSession.protocol.handle('https', function (request) {
        const match = LOCAL_SWF.exec(request.url);
        if (match) {
            const file = match[1].toLowerCase() === 'characterb-empty-scene' ? paths.emptySceneSwf : paths.studioSwf;
            let data;
            try { data = fs.readFileSync(file); } catch (_e) {
                return new Response('missing studio swf', {
                    status: 404,
                    headers: withArtixCors(request.url, { 'Content-Type': 'text/plain; charset=utf-8' })
                });
            }
            return new Response(data, {
                status: 200,
                headers: withArtixCors(request.url, { 'Content-Type': 'application/x-shockwave-flash' })
            });
        }
        if (request.method === 'OPTIONS' && artixHost(request.url)) {
            return new Response(null, {
                status: 204,
                headers: withArtixCors(request.url, {
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                    'Access-Control-Allow-Headers': '*'
                })
            });
        }
        const headers = new Headers(request.headers);
        headers.set('User-Agent', launcherUserAgent(userAgent));
        headers.set('artixmode', 'launcher');
        return net.fetch(request.url, {
            method: request.method,
            headers: headers,
            body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
            bypassCustomProtocolHandlers: true
        }).then(function (response) {
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: withArtixCors(request.url, response.headers)
            });
        });
    });
}

module.exports = {
    LOCAL_SWF: LOCAL_SWF,
    artixHost: artixHost,
    withArtixCors: withArtixCors,
    installStudioHttps: installStudioHttps
};
