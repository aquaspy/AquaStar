const { ipcRenderer } = require("electron");

function desktopVideoConstraint(sourceId) {
  return {
    mandatory: {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: sourceId
    }
  };
}

function stopStreamTracks(stream) {
  if (!stream || typeof stream.getTracks !== "function") return;
  stream.getTracks().forEach((track) => track.stop());
}

function grabOnePng(sourceId) {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: desktopVideoConstraint(sourceId)
  }).then((stream) => new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const timer = setTimeout(() => finish(null), 4000);
    function finish(png) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stopStreamTracks(stream);
      resolve(png);
    }
    video.muted = true;
    video.srcObject = stream;
    video.onerror = () => finish(null);
    function drawWhenReady() {
      if (settled) return;
      if (!video.videoWidth || !video.videoHeight) {
        requestAnimationFrame(drawWhenReady);
        return;
      }
      requestAnimationFrame(() => {
        if (settled) return;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext("2d").drawImage(video, 0, 0);
          canvas.toBlob((blob) => {
            if (!blob) { finish(null); return; }
            const reader = new FileReader();
            reader.onload = function () { finish(Buffer.from(this.result)); };
            reader.onerror = () => finish(null);
            reader.readAsArrayBuffer(blob);
          }, "image/png");
        } catch (_e) {
          finish(null);
        }
      });
    }
    video.onloadedmetadata = () => {
      const play = video.play();
      if (play && play.catch) play.catch(() => {});
      drawWhenReady();
    };
  })).catch(() => null);
}

ipcRenderer.on("capture-native-frame", (_event, payload) => {
  const token = payload && payload.token;
  const sourceId = payload && payload.sourceId;
  grabOnePng(sourceId).then((png) => {
    ipcRenderer.send("capture-native-frame-result", { token: token, png: png });
  }, () => {
    ipcRenderer.send("capture-native-frame-result", { token: token, png: null });
  });
});

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
  async function initRecorder(knownSourceId) {
    let matchedSource;
    if (knownSourceId) {
      matchedSource = { id: knownSourceId };
    } else {
      try {
        matchedSource = await ipcRenderer.invoke('getDesktopCapturerSourceForWindow');
      } catch (error) {
        console.log("[AquaStar] desktopCapturer error:", error);
        return false;
      }
    }

    if (matchedSource && matchedSource.aborted) {
      ipcRenderer.send("recording-failed", matchedSource.message || "");
      return false;
    }

    if (!matchedSource) {
      console.log("[AquaStar] Could not find desktopCapturer source for this window.");
      return false;
    }

    const videoConstraint = desktopVideoConstraint(matchedSource.id);
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

  async function triggerRecording(startRecording, knownSourceId) {
    if (!mediaRecorder) {
      const ready = await initRecorder(knownSourceId);
      if (!ready || !mediaRecorder) {
        console.log("[AquaStar] mediaRecorder is not initialized yet — cannot record.");
        ipcRenderer.send("recording-failed", "");
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
    if (message && typeof message === 'object') triggerRecording(!!message.start, message.sourceId || null);
    else triggerRecording(!!message, null);
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