const path = require('path');
const https = require('https');
const { app, BrowserWindow, ipcMain, session } = require('electron');

const LAB_PARTITION = 'persist:charpage-lab';
const SOURCE_URL = 'https://game.aq.com/game/gamefiles/etc/chardetail/characterB.swf?v=2';
const SOURCE_PATH = '/game/gamefiles/etc/chardetail/characterB.swf';
const ALLOWED_HOSTS = new Set(['game.aq.com', 'www.aq.com', 'account.aq.com']);
let stagedSwf = null;

function fetchOfficialAsset(url, redirectsLeft) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        if (!ALLOWED_HOSTS.has(parsed.hostname)) return reject(new Error('Blocked non-AQW asset host: ' + parsed.hostname));
        https.get(parsed, { headers: { 'User-Agent': 'AquaStar CharacterB Lab' } }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirectsLeft > 0) {
                response.resume();
                return resolve(fetchOfficialAsset(new URL(response.headers.location, parsed).href, redirectsLeft - 1));
            }
            if (response.statusCode !== 200) {
                response.resume();
                return reject(new Error('AQW returned HTTP ' + response.statusCode + ' for ' + parsed.href));
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

function isCharacterBSwf(url) {
    try {
        const parsed = new URL(url);
        return parsed.hostname === 'game.aq.com' && parsed.pathname === SOURCE_PATH;
    } catch (error) { return false; }
}

function setupLabProtocol() {
    const labSession = session.fromPartition(LAB_PARTITION);
    labSession.protocol.interceptBufferProtocol('https', (request, callback) => {
        if (isCharacterBSwf(request.url) && stagedSwf) {
            callback({ mimeType: 'application/x-shockwave-flash', data: stagedSwf });
            return;
        }
        fetchOfficialAsset(request.url, 5)
            .then(callback)
            .catch((error) => callback({ mimeType: 'text/plain', data: Buffer.from(error.message) }));
    });
}

ipcMain.handle('charpage-lab-stage-swf', (event, bytes) => {
    stagedSwf = Buffer.from(bytes);
    if (stagedSwf.slice(0, 3).toString('ascii') !== 'CWS' && stagedSwf.slice(0, 3).toString('ascii') !== 'FWS') {
        throw new Error('The selected file is not a supported SWF.');
    }
    return { bytes: stagedSwf.length, sourceUrl: SOURCE_URL };
});

function createLabWindow() {
    const window = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'AquaStar — CharacterB Lab',
        backgroundColor: '#10141b',
        webPreferences: {
            partition: LAB_PARTITION,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            // The SWF is local but it loads public AQW assets. This laboratory
            // window alone needs to allow those cross-origin fetches.
            webSecurity: false,
            preload: path.join(__dirname, '..', 'res', 'features', 'charpage', 'lab', 'preload_lab.js')
        }
    });
    window.removeMenu();
    // Electron 11 predates webContents.setWindowOpenHandler. Keep navigation
    // inside this isolated lab with the API available in Chromium 87.
    window.webContents.on('new-window', (event) => event.preventDefault());
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('console-message', (event, level, message, line, sourceId) => {
        window.webContents.send('charpage-lab-diagnostic', '[renderer ' + level + '] ' + message + ' (' + sourceId + ':' + line + ')');
    });
    window.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        window.webContents.send('charpage-lab-diagnostic', '[navigation] ' + errorDescription + ' (' + errorCode + '): ' + validatedURL);
    });
    window.loadFile(path.join(__dirname, '..', 'res', 'features', 'charpage', 'lab', 'characterB-lab.html'));
}

app.whenReady().then(() => {
    setupLabProtocol();
    createLabWindow();
}).catch((error) => {
    console.error('[AquaStar] Could not start CharacterB Lab:', error);
    app.quit();
});
app.on('window-all-closed', () => app.quit());
