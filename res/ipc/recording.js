// Screen recording for the game window.
// The preload calls getDisplayMedia. This file grants the requesting web contents
// (video and the page's own audio) and writes the file the save dialog picked.
const fs = require('fs');
const path = require('path');
const format = require('../features/capture/recording-format.js');
const {
    ipcMain,
    desktopCapturer,
    dialog,
    BrowserWindow,
    app,
    systemPreferences,
    webContents
} = require('electron');

const installedSessions = new WeakSet();
let captureTargetId = 0;
let captureSource = 'frame';
let readPreferredFormatId = function () { return format.defaultRecordingFormat; };

function failureStrings() {
    const fallback = {
        failed: 'Could not record this window.',
        denied: 'Screen Recording is off for AquaStar. Turn it on in System Settings, Privacy & Security, Screen Recording, then try again.',
        webm: 'WebM, MP4 unavailable'
    };
    try {
        const messages = require('../locale.js').strings.titleMessages || {};
        return {
            failed: messages.recordingFailed || fallback.failed,
            denied: messages.screenRecordingDenied || fallback.denied,
            webm: messages.recordingWebmFallback || fallback.webm
        };
    } catch (_err) {
        return fallback;
    }
}

function screenDeniedMessage() {
    if (process.platform !== 'darwin') return '';
    try {
        const status = systemPreferences.getMediaAccessStatus('screen');
        if (status === 'denied' || status === 'restricted') return failureStrings().denied;
    } catch (err) {
        console.log('[AquaStar] Screen Recording status unavailable: ' + (err && err.message ? err.message : err));
    }
    return '';
}

function toNodeBuffer(bytes) {
    if (Buffer.isBuffer(bytes)) return bytes;
    if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
    if (ArrayBuffer.isView(bytes)) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes && bytes.type === 'Buffer' && Array.isArray(bytes.data)) return Buffer.from(bytes.data);
    return Buffer.from(bytes || []);
}

function windowFromFrame(frame) {
    if (!frame || frame.isDestroyed()) return null;
    const contents = webContents.fromFrame(frame);
    if (!contents) return null;
    return BrowserWindow.fromWebContents(contents);
}

function grantWindowSource(win, request, callback) {
    const denied = screenDeniedMessage();
    if (denied) {
        callback(null);
        return;
    }
    const mediaId = typeof win.getMediaSourceId === 'function' ? win.getMediaSourceId() : '';
    desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } }).then(function (sources) {
        let video = null;
        for (let i = 0; i < sources.length; i++) {
            if (mediaId && sources[i].id === mediaId) {
                video = { id: sources[i].id, name: sources[i].name };
                break;
            }
        }
        if (!video && mediaId) video = { id: mediaId, name: win.getTitle() || 'AquaStar' };
        if (!video) {
            callback(null);
            return;
        }
        if (request.audioRequested && process.platform === 'win32') {
            callback({ video: video, audio: 'loopback' });
            return;
        }
        callback({ video: video });
    }).catch(function (err) {
        console.log('[AquaStar] desktopCapturer.getSources failed: ' + (err && err.message ? err.message : err));
        if (mediaId) {
            callback({ video: { id: mediaId, name: win.getTitle() || 'AquaStar' } });
            return;
        }
        callback(null);
    });
}

function onDisplayMediaRequest(request, callback) {
    try {
        const win = windowFromFrame(request.frame);
        if (!win || win.id !== captureTargetId) {
            callback(null);
            return;
        }
        if (captureSource === 'window') {
            grantWindowSource(win, request, callback);
            return;
        }
        const streams = { video: request.frame };
        if (request.audioRequested) {
            streams.audio = request.frame;
            // The default mutes the page for as long as its audio is captured.
            streams.enableLocalEcho = true;
        }
        callback(streams);
    } catch (err) {
        console.log('[AquaStar] display capture grant failed: ' + (err && err.message ? err.message : err));
        callback(null);
    }
}

function install(ses) {
    if (!ses || installedSessions.has(ses)) return;
    installedSessions.add(ses);
    ses.setDisplayMediaRequestHandler(onDisplayMediaRequest);
}

function setRecordingBadge(text) {
    if (process.platform !== 'darwin' || !app.dock || typeof app.dock.setBadge !== 'function') return;
    try { app.dock.setBadge(text); }
    catch (_err) { /* dock badge is a hint; the title still changes */ }
}

var _wasRecording = false;

exports.wasRecording = function () { return _wasRecording; };
exports.setPreferredFormatId = function (fn) {
    if (typeof fn === 'function') readPreferredFormatId = fn;
};
exports.install = install;
exports.forceIdle = function () {
    _wasRecording = false;
    captureTargetId = 0;
    captureSource = 'frame';
    setRecordingBadge('');
};
exports.triggerRecording = function (win) {
    _wasRecording = !_wasRecording;
    setRecordingBadge(_wasRecording ? 'REC' : '');
    const target = win || BrowserWindow.getFocusedWindow();
    if (_wasRecording) {
        captureSource = 'frame';
        if (target && !target.isDestroyed()) {
            captureTargetId = target.id;
            install(target.webContents.session);
        }
    } else if (target && captureTargetId === target.id) {
        captureTargetId = 0;
    }
    if (target && !target.isDestroyed()) target.webContents.send('record', { start: _wasRecording });
};

ipcMain.on('saveDialog', async function (event, arg) {
    // scripts/smoke-recording.js sets this so a headless run can skip the save dialog.
    const forced = process.env.AQUASTAR_RECORDING_PATH;
    if (forced) {
        event.sender.send('saveDialogReply', forced);
        return;
    }
    const extension = path.extname(typeof arg === 'string' ? arg : '').slice(1);
    const { canceled, filePath } = await dialog.showSaveDialog({
        buttonLabel: 'Save video',
        defaultPath: arg,
        filters: format.saveDialogFilters(extension)
    });
    event.sender.send('saveDialogReply', canceled ? undefined : filePath);
});

ipcMain.on('saveRecording', function (_event, filename, bytes) {
    if (!filename) return;
    try {
        fs.writeFileSync(filename, toNodeBuffer(bytes));
        console.log('[AquaStar] Saved recording ' + filename);
    } catch (err) {
        console.log('[AquaStar] Could not save recording: ' + (err && err.message ? err.message : err));
    }
});

ipcMain.handle('prepareRecordingCapture', function (event, source) {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
        install(win.webContents.session);
        captureTargetId = win.id;
    }
    captureSource = source === 'window' ? 'window' : 'frame';
    return {
        screenDenied: screenDeniedMessage(),
        failedMessage: failureStrings().failed
    };
});

ipcMain.handle('recordingMimeCandidates', function (_event, hasAudio) {
    return format.recordingMimeCandidates(readPreferredFormatId(), !!hasAudio);
});

ipcMain.handle('chooseRecordingFormat', function (_event, hasAudio, supported) {
    return format.chooseRecordingFormat(readPreferredFormatId(), !!hasAudio, supported || {});
});

ipcMain.handle('recordingFileName', function (_event, extension) {
    return format.recordingFileName(new Date(), extension);
});

ipcMain.on('recording-format-notice', function (event, chosen) {
    if (!chosen || !chosen.mimeType) return;
    if (chosen.fellBackToWebm) {
        console.log('[AquaStar] MediaRecorder cannot write MP4 here. Using ' + chosen.mimeType);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed()) return;
        const label = failureStrings().webm;
        const title = win.getTitle();
        if (title.indexOf(label) === -1) win.setTitle(title + ' (' + label + ')');
        return;
    }
    if (chosen.aacUnavailable) {
        console.log('[AquaStar] MediaRecorder has no AAC on this system. Recording ' + chosen.mimeType);
        return;
    }
    console.log('[AquaStar] Recording ' + chosen.mimeType);
});

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
    inst.notifyWin(win, message || failureStrings().failed);
});
