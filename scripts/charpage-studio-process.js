const { app, BrowserWindow, ipcMain, session, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');
const flash = require('../res/flash.js');
const constant = require('../res/const.js');
const locale = require('../res/locale.js');

const root = path.join(__dirname, '..');
const studioSwf = path.join(root, 'res', 'features', 'charpage', 'characterB-studio.swf');
const emptySceneSwf = path.join(root, 'res', 'features', 'charpage', 'characterB-empty-scene.swf');
let studioWindow = null;

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
function waitForCaptureProcess(child) {
    return new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error('O processo de captura terminou com código ' + code + '.')));
    });
}
ipcMain.handle('charpage-studio-defaults', () => ({ playerCharacter: '' }));
ipcMain.handle('charpage-studio-messages', () => locale.strings.charPageStudioMessages);
ipcMain.handle('charpage-studio-load-character', async (event, name) => {
    const playerName = String(name || '').replace(/[^a-zA-Z0-9]/g, '');
    if (!playerName) throw new Error('Informe um personagem válido.');
    const page = await fetchUrl('https://account.aq.com/CharPage?id=' + encodeURIComponent(playerName));
    const data = charData(page.data.toString('utf8'));
    return { playerName, flashVars: data.flashVars, swfUrl: data.swfUrl };
});
ipcMain.handle('charpage-studio-renderer-config', (event, renderer, flashVars) => rendererConfig(renderer, flashVars));
ipcMain.handle('charpage-studio-capture-preview', async (event, renderer, flashVars) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const config = rendererConfig(renderer, flashVars);
    const result = await dialog.showSaveDialog(owner, { defaultPath: 'CharPage.png', filters: [{ name: 'PNG', extensions: ['png'] }] });
    if (result.canceled || !result.filePath) throw new Error('Print cancelado.');
    const temporaryDirectory = fs.mkdtempSync(path.join(app.getPath('temp'), 'aquastar-charpage-'));
    const requestPath = path.join(temporaryDirectory, 'request.json');
    const statusPath = path.join(temporaryDirectory, 'status.json');
    fs.writeFileSync(requestPath, JSON.stringify({
        swfUrl: config.swfUrl,
        flashVars: config.flashVars,
        outputPath: result.filePath,
        statusPath: statusPath
    }));
    const childArgs = process.defaultApp
        ? [app.getAppPath(), '--charpage-studio-capture', '--capture-request=' + requestPath]
        : ['--charpage-studio-capture', '--capture-request=' + requestPath];
    try {
        await waitForCaptureProcess(spawn(process.execPath, childArgs, { stdio: 'ignore', windowsHide: true }));
        const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        return { savedPath: result.filePath, width: status.width, height: status.height };
    } catch (error) {
        // The helper records the browser-side error before it exits. Surface it
        // in the Studio instead of only exposing its generic exit code.
        let helperStatus = null;
        try {
            helperStatus = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        } catch (statusError) { /* no helper diagnostic was written */ }
        if (helperStatus && helperStatus.error) throw new Error(helperStatus.error);
        throw error;
    } finally {
        try { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); } catch (error) { /* temporary files are harmless */ }
    }
});
app.allowRendererProcessReuse = false;
flash.flashManager(app, root, root, 'AquaStar');
app.whenReady().then(() => { locale.detectLang(app.getLocale(), {}); installProtocol(); Menu.setApplicationMenu(null); studioWindow = new BrowserWindow({ width: 1280, height: 800, icon: constant.iconPath, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: false, plugins: true, webSecurity: false, preload: path.join(root, 'res', 'features', 'charpage', 'lab', 'preload_lab.js') } }); studioWindow.setMenu(null); studioWindow.setMenuBarVisibility(false); studioWindow.loadFile(path.join(root, 'res', 'features', 'charpage', 'lab', 'characterB-lab.html')); studioWindow.on('closed', () => app.quit()); });
