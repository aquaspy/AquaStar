const WebSocket = require('ws');
const net = require('net');

// Ruffle (running in a sandboxed renderer) can't open raw TCP sockets the way Flash's
// Socket class does, so AQW's netcode needs a local relay. Ruffle's own socketProxy
// config (built client-side in ruffle_wrapper.html) is the actual allowlist of which
// (host, port) pairs get redirected here - this relay just blindly forwards whatever
// it's asked to, same approach as the aquastar-ruffle proof of concept.
const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 8191;

let wss = null;

function start() {
    if (wss) return;
    wss = new WebSocket.Server({ port: PROXY_PORT, host: PROXY_HOST, perMessageDeflate: false });

    wss.on('connection', (ws, req) => {
        const u = new URL(req.url, 'http://localhost');
        const host = u.searchParams.get('host');
        const port = Number(u.searchParams.get('port'));

        if (!host || !port) {
            ws.close(1008, 'missing host or port');
            return;
        }

        const tgt = net.createConnection({ port, host, noDelay: true });

        tgt.on('data', (d) => { if (ws.readyState === WebSocket.OPEN) ws.send(d); });
        tgt.on('close', () => ws.close());
        tgt.on('error', (e) => ws.close(1011, e.message));

        ws.on('message', (m) => tgt.write(m));
        ws.on('close', () => tgt.destroy());
        ws.on('error', () => tgt.destroy());
    });

    wss.on('error', (err) => {
        console.error('[AquaStar] Ruffle socket proxy error:', err);
    });
}

function stop() {
    if (!wss) return;
    wss.close();
    wss = null;
}

exports.start = start;
exports.stop = stop;
exports.proxyUrl = 'ws://' + PROXY_HOST + ':' + PROXY_PORT;
