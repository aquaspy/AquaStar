const { ipcRenderer } = require("electron");

let mediaRecorder;
let captureStream;
const recordedChunks = [];

function getRecordName () {
  var t = new Date();
  return "Recording-" +
    t.getFullYear() + "-" + (t.getMonth() + 1) + "-" + t.getDate() + "_" +
    t.getHours() + "-" + t.getMinutes() +  "-" +
    t.getSeconds() + ".webm";
}

function pickMimeType() {
  const candidates = [
    'video/webm; codecs=vp8',
    'video/webm; codecs=vp9',
    'video/webm'
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
  }
  return 'video/webm';
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

    const constraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSourceId: matchedSource.id,
          chromeMediaSource: 'desktop'
        }
      }
    };

    try {
      releaseCaptureStream();
      captureStream = await navigator.mediaDevices.getUserMedia(constraints);
      setupRecorder(captureStream);
      return true;
    } catch (e) {
      console.log("[AquaStar] getUserMedia error:", e);
      return false;
    }
  }

  function setupRecorder(stream) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    const mimeType = pickMimeType();
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: mimeType,
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