// Serves the bundled Ruffle player on aquastar://ruffle/ so an https page can load it
// with webSecurity left on. The files are this app's own player. Callers pass the
// origins that may read them. Nothing else is served.

const fs = require('fs');
const path = require('path');

const SCHEME = 'aquastar';
const HOST = 'ruffle';
const allowedOrigins = new Set();
let installed = false;
let schemeRegistered = false;

function scriptUrl() {
    return SCHEME + '://' + HOST + '/ruffle.js';
}

function allowOrigins(list) {
    (Array.isArray(list) ? list : []).forEach(function (origin) {
        if (typeof origin === 'string' && origin) allowedOrigins.add(origin);
    });
}

function isAllowedOrigin(origin) {
    return typeof origin === 'string' && allowedOrigins.has(origin);
}

function contentType(file) {
    if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (file.endsWith('.wasm')) return 'application/wasm';
    if (file.endsWith('.map')) return 'application/json';
    if (file.endsWith('.html')) return 'text/html; charset=utf-8';
    return 'application/octet-stream';
}

// Absolute file inside root, or null. Rejects paths that climb out of root.
function resolveInside(root, pathname) {
    const base = path.resolve(root);
    let rel = String(pathname || '');
    try { rel = decodeURIComponent(rel); } catch (_e) { return null; }
    if (rel.indexOf('\0') !== -1) return null;
    if (rel.charAt(0) === '/') rel = rel.slice(1);
    const file = path.resolve(base, rel);
    if (file !== base && file.indexOf(base + path.sep) !== 0) return null;
    return file;
}

function registerScheme() {
    if (schemeRegistered) return;
    const { protocol } = require('electron');
    protocol.registerSchemesAsPrivileged([{
        scheme: SCHEME,
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            bypassCSP: true,
            stream: true
        }
    }]);
    schemeRegistered = true;
}

function install(ruffleDir) {
    if (installed) return;
    const { protocol } = require('electron');
    const root = path.resolve(ruffleDir);
    protocol.handle(SCHEME, function (request) {
        let url;
        try { url = new URL(request.url); } catch (_e) {
            return new Response('bad url', { status: 400 });
        }
        if (url.hostname !== HOST) return new Response('not found', { status: 404 });
        const file = resolveInside(root, url.pathname);
        if (!file) return new Response('forbidden', { status: 403 });
        let data;
        try {
            if (!fs.statSync(file).isFile()) return new Response('not found', { status: 404 });
            data = fs.readFileSync(file);
        } catch (_e) {
            return new Response('not found', { status: 404 });
        }
        const headers = { 'Content-Type': contentType(file) };
        const origin = request.headers.get('origin');
        if (isAllowedOrigin(origin)) {
            headers['Access-Control-Allow-Origin'] = origin;
            headers.Vary = 'Origin';
        }
        if (request.method === 'OPTIONS') {
            headers['Access-Control-Allow-Methods'] = 'GET, HEAD';
            return new Response(null, { status: 204, headers: headers });
        }
        return new Response(data, { status: 200, headers: headers });
    });
    installed = true;
}

module.exports = {
    scriptUrl: scriptUrl,
    allowOrigins: allowOrigins,
    isAllowedOrigin: isAllowedOrigin,
    resolveInside: resolveInside,
    registerScheme: registerScheme,
    install: install
};
