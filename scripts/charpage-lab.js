const path = require('path');
const https = require('https');
const { app, BrowserWindow, ipcMain, session } = require('electron');
const flash = require('../res/flash.js');

const SOURCE_URL = 'https://game.aq.com/game/gamefiles/etc/chardetail/characterB.swf?v=2';
const ALLOWED_HOSTS = new Set(['game.aq.com', 'www.aq.com', 'account.aq.com']);
let stagedSwf = null;
let stagedSourceUrl = null;

// This standalone Studio process must register PPAPI itself; main.js normally
// does this for AquaStar's regular windows before Electron becomes ready.
const appRoot = path.join(__dirname, '..');
app.allowRendererProcessReuse = false;
flash.flashManager(app, appRoot, appRoot, 'AquaStar');

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

function isStagedSwf(url) {
    try {
        const parsed = new URL(url);
        const staged = new URL(stagedSourceUrl || SOURCE_URL);
        return parsed.hostname === staged.hostname && parsed.pathname === staged.pathname;
    } catch (error) { return false; }
}

function setupLabProtocol() {
    // PPAPI Flash in Electron 11 is initialized through the default browser
    // session. This process is dedicated to the Studio, so using it does not
    // broaden the scope of the URL interception to AquaStar's main process.
    const labSession = session.defaultSession;
    labSession.protocol.interceptBufferProtocol('https', (request, callback) => {
        if (isStagedSwf(request.url) && stagedSwf) {
            callback({ mimeType: 'application/x-shockwave-flash', data: stagedSwf });
            return;
        }
        fetchOfficialAsset(request.url, 5)
            .then(callback)
            .catch((error) => callback({ mimeType: 'text/plain', data: Buffer.from(error.message) }));
    });
}

function readConfiguredPlayerName() {
    const candidates = [
        path.join(app.getPath('appData'), 'AquaStar', 'aquastar.json'),
        path.join(app.getPath('appData'), 'aquastar.json')
    ];
    for (const file of candidates) {
        try {
            const settings = JSON.parse(require('fs').readFileSync(file, 'utf8'));
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

ipcMain.handle('charpage-studio-defaults', () => ({ playerCharacter: readConfiguredPlayerName() }));

ipcMain.handle('charpage-studio-load-character', async (event, requestedName) => {
    const playerName = String(requestedName || '').replace(/[^a-zA-Z0-9]/g, '');
    if (!playerName) throw new Error('Enter a valid AQW character name.');
    const page = await fetchOfficialAsset('https://account.aq.com/CharPage?id=' + encodeURIComponent(playerName), 5);
    const data = extractCharPageData(page.data.toString('utf8'));
    const swf = await fetchOfficialAsset(data.swfUrl, 5);
    if (swf.data.slice(0, 3).toString('ascii') !== 'CWS' && swf.data.slice(0, 3).toString('ascii') !== 'FWS') {
        throw new Error('The Char Page SWF download was invalid.');
    }
    stagedSwf = swf.data;
    stagedSourceUrl = data.swfUrl;
    return { playerName: playerName, flashVars: data.flashVars, swfUrl: stagedSourceUrl, bytes: stagedSwf.length };
});

function createLabWindow() {
    const window = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'AquaStar — Char Page Studio',
        backgroundColor: '#10141b',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            plugins: true,
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
    window.loadFile(path.join(__dirname, '..', 'res', 'features', 'charpage', 'lab', 'characterB-lab.html'));
}

app.whenReady().then(() => {
    setupLabProtocol();
    createLabWindow();
}).catch((error) => {
    console.error('[AquaStar] Could not start Char Page Studio:', error);
    app.quit();
});
app.on('window-all-closed', () => app.quit());
