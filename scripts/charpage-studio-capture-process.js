const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const flash = require('../res/flash.js');

const root = path.join(__dirname, '..');
const studioSwf = path.join(root, 'res', 'features', 'charpage', 'characterB-studio.swf');
const emptySceneSwf = path.join(root, 'res', 'features', 'charpage', 'characterB-empty-scene.swf');
const requestArgument = process.argv.find(argument => argument.indexOf('--capture-request=') === 0);
const requestPath = requestArgument && requestArgument.slice('--capture-request='.length);
let request = null;

function fetchUrl(url) {
    return new Promise((resolve, reject) => https.get(url, { headers: { 'User-Agent': 'AquaStar Char Page Studio' } }, response => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            response.resume(); resolve(fetchUrl(new URL(response.headers.location, url).href)); return;
        }
        const chunks = []; response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, data: Buffer.concat(chunks), mimeType: String(response.headers['content-type'] || '').split(';')[0] }));
    }).on('error', reject));
}
function installProtocol() {
    session.defaultSession.protocol.interceptBufferProtocol('https', (networkRequest, callback) => {
        if (/^https:\/\/game\.aq\.com\/game\/gamefiles\/etc\/chardetail\/characterB-empty-scene\.swf(?:\?|$)/i.test(networkRequest.url)) {
            callback({ mimeType: 'application/x-shockwave-flash', data: fs.readFileSync(emptySceneSwf) }); return;
        }
        if (/^https:\/\/game\.aq\.com\/game\/gamefiles\/etc\/chardetail\/characterB\.swf(?:\?|$)/i.test(networkRequest.url)) {
            callback({ mimeType: 'application/x-shockwave-flash', data: fs.readFileSync(studioSwf) }); return;
        }
        fetchUrl(networkRequest.url).then(callback).catch(error => callback({ mimeType: 'text/plain', data: Buffer.from(error.message) }));
    });
}
function delay(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
function fail(error) {
    if (request && request.statusPath) fs.writeFileSync(request.statusPath, JSON.stringify({ error: error.message }));
    console.error('[Char Page capture] ' + (error.stack || error.message));
    app.exit(1);
}

if (!requestPath) {
    console.error('Missing --capture-request.');
    app.exit(1);
} else {
    try { request = JSON.parse(fs.readFileSync(requestPath, 'utf8')); } catch (error) { fail(error); }
}

app.allowRendererProcessReuse = false;
flash.flashManager(app, root, root, 'AquaStar');
app.whenReady().then(async () => {
    try {
        installProtocol();
        // This intentionally follows the original Char Page print approach:
        // use the biggest hidden window possible, then fit a 715:455 stage
        // inside the actual framebuffer that Chromium returns.
        const logicalWidth = 3840;
        const logicalHeight = 2160;
        const captureWindow = new BrowserWindow({
            width: logicalWidth,
            height: logicalHeight,
            useContentSize: true,
            show: false,
            frame: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false,
                plugins: true,
                webSecurity: false,
                backgroundThrottling: false
            }
        });
        await captureWindow.loadFile(path.join(root, 'res', 'features', 'charpage', 'lab', 'capture.html'), {
            query: { swfUrl: request.swfUrl, flashVars: request.flashVars, width: '715', height: '455' }
        });
        const probe = await captureWindow.webContents.capturePage();
        const probeSize = probe.getSize();
        const contentSize = captureWindow.getContentSize();
        const deviceScaleX = probeSize.width / contentSize[0];
        const deviceScaleY = probeSize.height / contentSize[1];
        const movieRatio = 715 / 455;
        let pixelRect;
        if ((probeSize.width / probeSize.height) > movieRatio) {
            pixelRect = { width: Math.round(probeSize.height * movieRatio), height: probeSize.height, x: Math.round((probeSize.width - probeSize.height * movieRatio) / 2), y: 0 };
        } else {
            pixelRect = { width: probeSize.width, height: Math.round(probeSize.width / movieRatio), x: 0, y: Math.round((probeSize.height - probeSize.width / movieRatio) / 2) };
        }
        const logicalRect = { x: pixelRect.x / deviceScaleX, y: pixelRect.y / deviceScaleY, width: pixelRect.width / deviceScaleX, height: pixelRect.height / deviceScaleY };
        await captureWindow.webContents.executeJavaScript('window.setFlashSize(' + JSON.stringify(logicalRect) + ')');
        await delay(5000);
        const image = await captureWindow.webContents.capturePage();
        const finalImage = image.crop(pixelRect);
        const imageSize = finalImage.getSize();
        fs.writeFileSync(request.outputPath, finalImage.toPNG());
        fs.writeFileSync(request.statusPath, JSON.stringify(imageSize));
        captureWindow.destroy();
        app.quit();
    } catch (error) { fail(error); }
});
