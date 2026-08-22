const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const flash = require('../res/flash.js');

const root = path.join(__dirname, '..');
const studioSwf = path.join(root, 'res', 'features', 'charpage', 'characterB-studio.swf');
const emptySceneSwf = path.join(root, 'res', 'features', 'charpage', 'characterB-empty-scene.swf');
let studioWindow = null;
let sourceRequestCount = 0;

function fetchUrl(url) {
    return new Promise((resolve, reject) => https.get(url, { headers: { 'User-Agent': 'AquaStar Char Page Studio' } }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            response.resume(); resolve(fetchUrl(new URL(response.headers.location, url).href)); return;
        }
        const chunks = []; response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, data: Buffer.concat(chunks), mimeType: String(response.headers['content-type'] || '').split(';')[0] }));
    }).on('error', reject));
}
function charData(html) {
    const parameters = {};
    html.replace(/<param\b[^>]*>/gi, tag => {
        const name = tag.match(/\bname\s*=\s*["']?([^\s"'>]+)/i);
        const value = tag.match(/\bvalue\s*=\s*["']([^"']*)["']/i);
        if (name && value) parameters[name[1].toLowerCase()] = value[1];
        return tag;
    });
    const movie = parameters.movie;
    const vars = parameters.flashvars;
    if (!movie || !vars) throw new Error('A Char Page não forneceu seus FlashVars.');
    const params = new URLSearchParams(vars.replace(/&amp;/g, '&'));
    params.set('studioAssetBaseUrl', 'https://game.aq.com/game/gamefiles/etc/chardetail/');
    return { swfUrl: movie.replace(/&amp;/g, '&'), flashVars: params.toString() };
}
function installProtocol() {
    session.defaultSession.protocol.interceptBufferProtocol('https', (request, callback) => {
        if (/^https:\/\/game\.aq\.com\/game\/gamefiles\/etc\/chardetail\/characterB-empty-scene\.swf(?:\?|$)/i.test(request.url)) {
            callback({ mimeType: 'application/x-shockwave-flash', data: fs.readFileSync(emptySceneSwf) }); return;
        }
        if (/^https:\/\/game\.aq\.com\/game\/gamefiles\/etc\/chardetail\/characterB\.swf(?:\?|$)/i.test(request.url)) {
            callback({ mimeType: 'application/x-shockwave-flash', data: fs.readFileSync(studioSwf) }); return;
        }
        if (/^https:\/\/game\.aq\.com\/game\/gamefiles\//i.test(request.url)) {
            sourceRequestCount++;
            if (sourceRequestCount <= 20 && studioWindow && !studioWindow.isDestroyed()) {
                studioWindow.webContents.send('charpage-studio-diagnostic', '[asset] ' + request.url);
            }
        }
        fetchUrl(request.url).then(callback).catch(error => callback({ mimeType: 'text/plain', data: Buffer.from(error.message) }));
    });
}
function rendererConfig(renderer, rawFlashVars) {
    const emptyScene = renderer === 'empty-scene';
    const swf = emptyScene ? emptySceneSwf : studioSwf;
    if (!fs.existsSync(swf)) throw new Error('O SWF selecionado do Char Page Studio não foi encontrado. Reinstale o AquaStar.');
    const params = new URLSearchParams(String(rawFlashVars || ''));
    // The original derived Char Page resolves paths relative to chardetail;
    // the standalone compositor resolves directly from gamefiles instead.
    params.set('studioAssetBaseUrl', emptyScene
        ? 'https://game.aq.com/game/gamefiles'
        : 'https://game.aq.com/game/gamefiles/etc/chardetail/');
    return {
        renderer: emptyScene ? 'empty-scene' : 'charpage',
        swfUrl: 'https://game.aq.com/game/gamefiles/etc/chardetail/' + (emptyScene ? 'characterB-empty-scene.swf' : 'characterB.swf'),
        flashVars: params.toString(),
        width: 715,
        height: 455
    };
}
ipcMain.handle('charpage-studio-defaults', () => ({ playerCharacter: '' }));
ipcMain.handle('charpage-studio-load-character', async (event, name) => {
    const playerName = String(name || '').replace(/[^a-zA-Z0-9]/g, '');
    if (!playerName) throw new Error('Informe um personagem válido.');
    const page = await fetchUrl('https://account.aq.com/CharPage?id=' + encodeURIComponent(playerName));
    const data = charData(page.data.toString('utf8'));
    return { playerName, flashVars: data.flashVars, swfUrl: data.swfUrl };
});
ipcMain.handle('charpage-studio-runtime-status', () => ({ protocolActive: true, stagedBytes: fs.statSync(studioSwf).size, emptySceneBytes: fs.existsSync(emptySceneSwf) ? fs.statSync(emptySceneSwf).size : 0, sourceRequestCount: sourceRequestCount }));
ipcMain.handle('charpage-studio-renderer-config', (event, renderer, flashVars) => rendererConfig(renderer, flashVars));
ipcMain.handle('charpage-studio-open-devtools', event => BrowserWindow.fromWebContents(event.sender).webContents.openDevTools({ mode: 'right' }));
ipcMain.handle('charpage-studio-capture', async (event, bounds) => {
    const win = BrowserWindow.fromWebContents(event.sender); const image = await win.webContents.capturePage(bounds);
    const result = await dialog.showSaveDialog(win, { defaultPath: 'CharPage.png', filters: [{ name: 'PNG', extensions: ['png'] }] });
    if (result.canceled || !result.filePath) throw new Error('Print cancelado.'); fs.writeFileSync(result.filePath, image.toPNG()); return { savedPath: result.filePath };
});
app.allowRendererProcessReuse = false;
flash.flashManager(app, root, root, 'AquaStar');
app.whenReady().then(() => { installProtocol(); studioWindow = new BrowserWindow({ width: 1280, height: 800, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: false, plugins: true, webSecurity: false, preload: path.join(root, 'res', 'features', 'charpage', 'lab', 'preload_lab.js') } }); studioWindow.webContents.on('console-message', (event, level, message, line, source) => studioWindow.webContents.send('charpage-studio-diagnostic', '[renderer ' + level + '] ' + message + ' (' + source + ':' + line + ')')); studioWindow.loadFile(path.join(root, 'res', 'features', 'charpage', 'lab', 'characterB-lab.html')); studioWindow.on('closed', () => app.quit()); });
