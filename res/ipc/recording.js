// Screen recording IPC - save-dialog/save-file plumbing for preload_capture.js's
// MediaRecorder flow, plus the "is a window currently recording" toggle used by the
// Ctrl+J keybind in keybindings.js. Split out of const.js since it's IPC wiring, not
// an app-wide constant.
const fs = require('fs');
const path = require('path');
const { ipcMain, desktopCapturer, dialog, BrowserWindow } = require('electron');
const nativeWindowCapture = require('../nativeWindowCapture.js');

ipcMain.on('saveDialog', async function (event, arg) {
    const extension = path.extname(typeof arg === 'string' ? arg : '').slice(1).toLowerCase();
    const isMkv = extension === 'mkv';
    const { canceled, filePath } = await dialog.showSaveDialog({
        buttonLabel: 'Save video',
        defaultPath: arg,
        // The renderer has already selected a supported MediaRecorder format and
        // supplied its matching extension in `arg`; keep the native dialog aligned.
        filters: [{ name: isMkv ? 'MKV Video' : 'WebM Video', extensions: [isMkv ? 'mkv' : 'webm'] }]
    });
    event.sender.send('saveDialogReply', canceled ? undefined : filePath);
});

ipcMain.on('saveRecording', function (event, filename, buffer) {
    fs.writeFileSync(filename, Buffer.from(buffer));
});

ipcMain.handle('getDesktopCapturerSourceForWindow', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    const verdict = await nativeWindowCapture.recordingSource(win);
    if (verdict.route === 'blocked') return { aborted: true, message: verdict.message };
    if (verdict.route === 'source') return { id: verdict.sourceId, name: verdict.title };

    const sources = await desktopCapturer.getSources({ types: ['window'] });
    const title = win.getTitle();

    for (let i = 0; i < sources.length; i++) {
        if (sources[i].name === title) return { id: sources[i].id, name: sources[i].name };
    }
    for (let i = 0; i < sources.length; i++) {
        if (title && sources[i].name && sources[i].name.indexOf(title) !== -1) {
            return { id: sources[i].id, name: sources[i].name };
        }
    }
    for (let i = 0; i < sources.length; i++) {
        if (sources[i].name && sources[i].name.indexOf('AquaStar') !== -1) {
            return { id: sources[i].id, name: sources[i].name };
        }
    }
    return null;
});

var _wasRecording = false;
exports.wasRecording = () => {return _wasRecording};
exports.forceIdle = function () {
    _wasRecording = false;
};
exports.triggerRecording = (win) => {
    _wasRecording = !_wasRecording;
    const target = win || BrowserWindow.getFocusedWindow();
    if (target) target.webContents.send('record', _wasRecording);
}

ipcMain.on('recording-failed', function (event, message) {
    if (!_wasRecording) return;
    exports.forceIdle();
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    const inst = require('../instances.js');
    const constant = require('../const.js');
    const saved = inst.getSavedTitle(win);
    win.setTitle(saved);
    win.setIcon(constant.nativeImageIcon);
    if (message) inst.notifyWin(win, message);
});
