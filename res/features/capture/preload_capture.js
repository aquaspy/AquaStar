const { ipcRenderer } = require('electron');

let mediaRecorder = null;
let captureStream = null;
const recordedChunks = [];
let failedMessage = 'Could not record this window.';
let requestId = 0;

function releaseCaptureStream() {
  if (!captureStream) return;
  captureStream.getTracks().forEach(function (track) { track.stop(); });
  captureStream = null;
}

function fail(message) {
  console.log('[AquaStar] recording failed: ' + (message || failedMessage));
  ipcRenderer.send('recording-failed', message || failedMessage);
}

async function openDisplay(withAudio) {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: !!withAudio
    });
  } catch (err) {
    console.log('[AquaStar] getDisplayMedia failed: ' + (err && err.name ? err.name : '') + ' ' + (err && err.message ? err.message : err));
    return null;
  }
}

async function openStream() {
  const withAudio = await openDisplay(true);
  if (withAudio) return withAudio;
  const silent = await openDisplay(false);
  if (silent) return silent;
  let denied = '';
  try {
    const prepared = await ipcRenderer.invoke('prepareRecordingCapture', 'window');
    if (prepared && prepared.failedMessage) failedMessage = prepared.failedMessage;
    denied = prepared && prepared.screenDenied ? prepared.screenDenied : '';
  } catch (err) {
    console.log('[AquaStar] window capture setup failed: ' + err);
  }
  const fromWindow = await openDisplay(false);
  if (fromWindow) return fromWindow;
  fail(denied || failedMessage);
  return null;
}

async function chooseFormat(hasAudio) {
  const candidates = await ipcRenderer.invoke('recordingMimeCandidates', hasAudio);
  const supported = {};
  (candidates || []).forEach(function (mime) {
    try { supported[mime] = MediaRecorder.isTypeSupported(mime); }
    catch (err) { supported[mime] = false; }
  });
  const chosen = await ipcRenderer.invoke('chooseRecordingFormat', hasAudio, supported);
  ipcRenderer.send('recording-format-notice', chosen);
  return chosen;
}

function saveVideo(mimeType, extension) {
  const blob = new Blob(recordedChunks, { type: mimeType || 'video/mp4' });
  const reader = new FileReader();
  reader.onload = async function () {
    // Sandboxed preloads have no Node Buffer. The bytes go across as a view.
    const bytes = new Uint8Array(this.result);
    let recordName = 'Recording.' + (extension || 'mp4');
    try {
      recordName = await ipcRenderer.invoke('recordingFileName', extension);
    } catch (err) {
      console.log('[AquaStar] recording file name failed: ' + err);
    }
    ipcRenderer.once('saveDialogReply', function (_event, filename) {
      if (filename != null) ipcRenderer.send('saveRecording', filename, bytes);
    });
    ipcRenderer.send('saveDialog', recordName);
  };
  reader.readAsArrayBuffer(blob);
}

async function setupRecorder(stream) {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  const hasAudio = stream.getAudioTracks().length > 0;
  const format = await chooseFormat(hasAudio);
  mediaRecorder = new MediaRecorder(stream, {
    mimeType: format.mimeType,
    videoBitsPerSecond: 6000000
  });
  mediaRecorder.ondataavailable = function (event) {
    if (event.data && event.data.size) recordedChunks.push(event.data);
  };
  mediaRecorder.onerror = function (event) {
    const err = event && event.error;
    fail(err && err.message ? err.message : failedMessage);
  };
  const extension = format.extension;
  const mimeType = format.mimeType;
  mediaRecorder.onstop = function () {
    saveVideo(mimeType, extension);
    releaseCaptureStream();
    mediaRecorder = null;
  };
}

async function triggerRecording(startRecording) {
  if (!startRecording) {
    requestId++;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    return;
  }
  if (mediaRecorder && mediaRecorder.state === 'recording') return;
  const mine = ++requestId;
  try {
    const prepared = await ipcRenderer.invoke('prepareRecordingCapture', 'frame');
    if (prepared && prepared.failedMessage) failedMessage = prepared.failedMessage;
  } catch (err) {
    console.log('[AquaStar] capture setup failed: ' + err);
  }
  if (mine !== requestId) return;
  const stream = await openStream();
  if (mine !== requestId) {
    if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
    return;
  }
  if (!stream) return;
  try {
    captureStream = stream;
    await setupRecorder(stream);
  } catch (err) {
    console.log('[AquaStar] MediaRecorder failed: ' + err);
    releaseCaptureStream();
    if (mine === requestId) fail(failedMessage);
    return;
  }
  if (mine !== requestId || !mediaRecorder) {
    releaseCaptureStream();
    return;
  }
  recordedChunks.splice(0, recordedChunks.length);
  mediaRecorder.start();
}

ipcRenderer.on('record', function (_event, message) {
  const start = message && typeof message === 'object' ? !!message.start : !!message;
  triggerRecording(start);
});
