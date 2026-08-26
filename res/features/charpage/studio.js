// Main-process bridge for the native-Flash Char Page Studio. The renderer never
// receives filesystem or network access; it asks here for the public Char Page
// data and uses the bundled Studio SWF so Electron's default HTTPS session stays
// completely untouched.
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { ipcMain, BrowserWindow } = require('electron');
const constant = require('../../const.js');

const ALLOWED_HOSTS = new Set(['account.aq.com', 'game.aq.com', 'www.aq.com']);
const bundledStudioSwfPath = path.join(constant.appRootPath, 'res', 'features', 'charpage', 'characterB-studio.swf');
const studioAssetBaseUrl = 'https://game.aq.com/game/gamefiles/etc/chardetail/';
let studioWebContents = null;
let localSwfServer = null;
let localSwfUrl = null;

function diagnose(message) {
    if (studioWebContents && !studioWebContents.isDestroyed()) {
        studioWebContents.send('charpage-studio-diagnostic', message);
    }
}

function fetchOfficialAsset(url, redirectsLeft, allowAnyHost) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        if (!allowAnyHost && !ALLOWED_HOSTS.has(parsed.hostname)) return reject(new Error('Unexpected AQW asset host.'));
        https.get(parsed, { headers: { 'User-Agent': 'AquaStar Char Page Studio' } }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirectsLeft > 0) {
                response.resume();
                resolve(fetchOfficialAsset(new URL(response.headers.location, parsed).href, redirectsLeft - 1, allowAnyHost));
                return;
            }
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error('AQW returned HTTP ' + response.statusCode + '.'));
                return;
            }
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve({
                data: Buffer.concat(chunks),
                mimeType: String(response.headers['content-type'] || 'application/octet-stream').split(';')[0]
            }));
        }).on('error', reject);
    });
}

// The Studio SWF is packaged as a real file. In particular, do not use an
// intercept*Protocol handler here: Electron 11 applies it to every window in
// the default session, which made the whole app unstable.
function activateProtocol() {
    if (!fs.existsSync(bundledStudioSwfPath)) throw new Error('The bundled Char Page Studio SWF is missing. Reinstall AquaStar.');
    return true;
}

function getLocalSwfUrl() {
    if (localSwfUrl) return Promise.resolve(localSwfUrl);
    activateProtocol();
    return new Promise((resolve, reject) => {
        const server = http.createServer((request, response) => {
            const requestPath = new URL(request.url, 'http://127.0.0.1').pathname;
            if (request.method !== 'GET' || requestPath !== '/characterB-studio.swf') {
                response.writeHead(404);
                response.end();
                return;
            }
            response.writeHead(200, {
                'Content-Type': 'application/x-shockwave-flash',
                'Content-Length': fs.statSync(bundledStudioSwfPath).size,
                'Cache-Control': 'no-store'
            });
            fs.createReadStream(bundledStudioSwfPath).pipe(response);
        });
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            localSwfServer = server;
            localSwfUrl = 'http://127.0.0.1:' + server.address().port + '/characterB-studio.swf';
            diagnose('[server] SWF local disponível em ' + localSwfUrl);
            resolve(localSwfUrl);
        });
    });
}

function deactivateProtocol() {
    if (localSwfServer) localSwfServer.close();
    localSwfServer = null;
    localSwfUrl = null;
}

function readConfiguredPlayerName() {
    const candidates = [
        constant.appdataJsonPath,
        path.join(path.dirname(constant.appDataDirectory), 'aquastar.json')
    ];
    for (const file of candidates) {
        try {
            const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (typeof settings.playerCharacter === 'string') return settings.playerCharacter.replace(/[^a-zA-Z0-9]/g, '');
        } catch (error) { /* Missing or malformed settings fall back to blank. */ }
    }
    return '';
}

function extractCharPageData(html) {
    const movie = html.match(/<param\s+name=["']movie["']\s+value=["']([^"']+)["']/i);
    const flashVars = html.match(/<param\s+name=["']flashvars["']\s+value=["']([^"']*)["']/i);
    if (!movie || !flashVars) throw new Error('The Char Page did not contain its SWF and FlashVars.');
    const swfUrl = new URL(movie[1].replace(/&amp;/g, '&'), 'https://account.aq.com/');
    if (swfUrl.hostname !== 'game.aq.com') throw new Error('The Char Page returned an unexpected SWF host.');
    return { swfUrl: swfUrl.href, flashVars: flashVars[1].replace(/&amp;/g, '&') };
}

function captureBounds(rawBounds, win) {
    const size = win.getContentSize();
    const bounds = rawBounds || {};
    const x = Math.max(0, Math.floor(Number(bounds.x) || 0));
    const y = Math.max(0, Math.floor(Number(bounds.y) || 0));
    const width = Math.min(size[0] - x, Math.floor(Number(bounds.width) || 0));
    const height = Math.min(size[1] - y, Math.floor(Number(bounds.height) || 0));
    if (width < 1 || height < 1) throw new Error('The Char Page preview is not ready to capture.');
    return { x: x, y: y, width: width, height: height };
}

ipcMain.handle('charpage-studio-defaults', () => ({ playerCharacter: readConfiguredPlayerName() }));

ipcMain.handle('charpage-studio-load-character', async (event, requestedName) => {
    const playerName = String(requestedName || '').replace(/[^a-zA-Z0-9]/g, '');
    if (!playerName) throw new Error('Enter a valid AQW character name.');
    activateProtocol();
    studioWebContents = event.sender;
    const page = await fetchOfficialAsset('https://account.aq.com/CharPage?id=' + encodeURIComponent(playerName), 5);
    const data = extractCharPageData(page.data.toString('utf8'));
    const swfUrl = await getLocalSwfUrl();
    const flashVars = new URLSearchParams(data.flashVars);
    // The derived SWF needs an explicit remote root for item assets because the
    // movie itself is intentionally loaded from the local installation folder.
    flashVars.set('studioAssetBaseUrl', studioAssetBaseUrl);
    return { playerName: playerName, flashVars: flashVars.toString(), swfUrl: swfUrl };
});

ipcMain.handle('charpage-studio-capture', async (event, bounds) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) throw new Error('The Char Page Studio window is unavailable.');
    // Required lazily to avoid the instances ↔ feature initialization cycle.
    const savedPath = await require('../../instances.js').takeSS(win, captureBounds(bounds, win));
    if (!savedPath) throw new Error('Could not save the Char Page print.');
    return { savedPath: savedPath };
});

ipcMain.handle('charpage-studio-runtime-status', () => ({
    protocolActive: false,
    stagedBytes: fs.existsSync(bundledStudioSwfPath) ? fs.statSync(bundledStudioSwfPath).size : 0,
    sourceRequestCount: 0
}));

ipcMain.handle('charpage-studio-open-devtools', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    // Keeping DevTools attached avoids creating a second top-level window that
    // can be mistaken for the Studio disappearing when Windows changes focus.
    if (win && !win.isDestroyed()) win.webContents.openDevTools({ mode: 'right' });
});

exports.extractCharPageData = extractCharPageData;

exports.activateProtocol = activateProtocol;
exports.deactivateProtocol = deactivateProtocol;
