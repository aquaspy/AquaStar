const { ipcRenderer } = require("electron");

let mediaRecorder;
let captureStream;
let currentExtension = 'webm';
const recordedChunks = [];

function getRecordName () {
  var t = new Date();
  return "Recording-" +
    t.getFullYear() + "-" + (t.getMonth() + 1) + "-" + t.getDate() + "_" +
    t.getHours() + "-" + t.getMinutes() +  "-" +
    t.getSeconds() + "." + currentExtension;
}

async function pickFormat(hasAudio) {
  let desired = null;
  try {
    desired = await ipcRenderer.invoke('getRecordingFormat', hasAudio);
  } catch (e) {
    console.log("[AquaStar] getRecordingFormat error:", e);
  }

  const candidates = [];
  if (desired && desired.mimeType) candidates.push(desired);
  // Fallbacks, in the unlikely case the configured format isn't supported here.
  const opus = hasAudio ? ',opus' : '';
  candidates.push({ mimeType: 'video/webm;codecs=vp8' + opus, extension: 'webm' });
  candidates.push({ mimeType: 'video/webm;codecs=vp9' + opus, extension: 'webm' });
  candidates.push({ mimeType: 'video/webm', extension: 'webm' });

  for (let i = 0; i < candidates.length; i++) {
    if (MediaRecorder.isTypeSupported(candidates[i].mimeType)) return candidates[i];
  }
  return { mimeType: 'video/webm', extension: 'webm' };
}

function releaseCaptureStream() {
  if (!captureStream) return;
  captureStream.getTracks().forEach((track) => track.stop());
  captureStream = null;
}

(() => {
  async function initRecorder() {
    let matchedSource;
    try {
      matchedSource = await ipcRenderer.invoke('getDesktopCapturerSourceForWindow');
    } catch (error) {
      console.log("[AquaStar] desktopCapturer error:", error);
      return false;
    }

    if (!matchedSource) {
      console.log("[AquaStar] Could not find desktopCapturer source for this window.");
      return false;
    }

    const videoConstraint = {
      mandatory: {
        chromeMediaSourceId: matchedSource.id,
        chromeMediaSource: 'desktop'
      }
    };
    // Desktop audio loopback via chromeMediaSource: 'desktop' - Chromium can't isolate
    // audio to a single window, so this picks up the whole system's audio output, not
    // just Flash's. Only reliably supported on Windows; falls back to video-only elsewhere.
    const withAudioConstraints = {
      audio: { mandatory: { chromeMediaSource: 'desktop' } },
      video: videoConstraint
    };

    try {
      releaseCaptureStream();
      try {
        captureStream = await navigator.mediaDevices.getUserMedia(withAudioConstraints);
      } catch (audioErr) {
        console.log("[AquaStar] Desktop audio capture unavailable, recording video only:", audioErr);
        captureStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraint });
      }
      await setupRecorder(captureStream);
      return true;
    } catch (e) {
      console.log("[AquaStar] getUserMedia error:", e);
      return false;
    }
  }

  async function setupRecorder(stream) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    const hasAudio = stream.getAudioTracks().length > 0;
    const format = await pickFormat(hasAudio);
    currentExtension = format.extension;
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: format.mimeType,
      videoBitsPerSecond: 6000000
    });

    mediaRecorder.ondataavailable = (e) => {
      recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      saveVideo();
      releaseCaptureStream();
      mediaRecorder = null;
    };
  }

  async function triggerRecording(startRecording) {
    if (!mediaRecorder) {
      const ready = await initRecorder();
      if (!ready || !mediaRecorder) {
        console.log("[AquaStar] mediaRecorder is not initialized yet — cannot record.");
        return;
      }
    }

    if (!startRecording) mediaRecorder.stop();
    else {
      recordedChunks.splice(0, recordedChunks.length);
      mediaRecorder.start();
    }
  }

  ipcRenderer.on('record', (event, message) => {
    triggerRecording(message);
  });

  function saveVideo () {
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });

    let fileReader = new FileReader();
    fileReader.onload = function() {
      let arrayBuffer = this.result;
      const buffer = Buffer.from(arrayBuffer);
      var recordName = getRecordName();

      ipcRenderer.send('saveDialog', recordName);
      ipcRenderer.once('saveDialogReply', (event, filename) => {
        if (filename != null && filename != undefined) {
          ipcRenderer.send('saveRecording', filename, buffer);
        }
      });
    };
    fileReader.readAsArrayBuffer(blob);
  }
})();