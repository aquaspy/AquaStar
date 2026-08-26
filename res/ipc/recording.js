// Screen recording IPC - save-dialog/save-file plumbing for preload_capture.js's
// MediaRecorder flow, plus the "is a window currently recording" toggle used by the
// Ctrl+J keybind in keybindings.js. Split out of const.js since it's IPC wiring, not
// an app-wide constant.
const fs = require('fs');
const path = require('path');
const { ipcMain, desktopCapturer, dialog, BrowserWindow } = require('electron');

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
exports.triggerRecording = (win) => {
    _wasRecording = !_wasRecording;
    const target = win || BrowserWindow.getFocusedWindow();
    if (target) target.webContents.send('record', _wasRecording);
}
