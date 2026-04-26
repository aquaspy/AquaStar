const { ipcRenderer} = require("electron");

var currentWindowTitle = "";
var currentWindowID = 0;

let mediaRecorder;
const recordedChunks = [];

ipcRenderer.on('getTitleIDReply', function (event, titleAndID) {
  currentWindowTitle = titleAndID[0];
  currentWindowID = titleAndID[1];
});

ipcRenderer.send('getTitleID', "");

function getRecordName () {
  var t = new Date();
  return "Recording-" +
    t.getFullYear() + "-" + (t.getMonth() + 1) + "-" + t.getDate() + "_" +
    t.getHours() + "-" + t.getMinutes() +  "-" +
    t.getSeconds() + ".webm";
}

(() => {
  function triggerRecording(startRecording){
    if (!mediaRecorder) {
      console.log("[AquaStar] mediaRecorder is not initialized yet — cannot record.");
      return;
    }
    if(!startRecording) mediaRecorder.stop();
    else {
      recordedChunks.splice(0,recordedChunks.length); // Empty it
      mediaRecorder.start();
    }
  }

  ipcRenderer.on('record', (event, message) => {
    triggerRecording(message);
  })

  function getGameWindow() {
    // Fetch the CURRENT title synchronously so we don't race with the page load.
    var titleAndID = ipcRenderer.sendSync('getTitleIDSync', "");
    currentWindowTitle = titleAndID[0];
    currentWindowID = titleAndID[1];

    require('electron').desktopCapturer.getSources({types: ['window']}, (error, sources)=> {
      if (error) {
        console.log("[AquaStar] desktopCapturer error:", error);
        return;
      }

      var matchedSource = null;
      for (let i = 0; i < sources.length; ++i) {
        // The very last character of this shows 0 for non aquastars and a number for aquastar.
        var num = parseInt(sources[i].id.substring(sources[i].id.lastIndexOf(":")));

        // Aquastar test, then if "its the right window" test.
        if ( num != 0 && sources[i].name === currentWindowTitle) {
          matchedSource = sources[i];
          break;
        }
      }

      // Fallback: partial name match (in case the OS truncates or decorates titles)
      if (!matchedSource) {
        for (let i = 0; i < sources.length; ++i) {
          var num = parseInt(sources[i].id.substring(sources[i].id.lastIndexOf(":")));
          if (num != 0 && sources[i].name && currentWindowTitle && sources[i].name.indexOf(currentWindowTitle) !== -1) {
            matchedSource = sources[i];
            break;
          }
        }
      }

      if (!matchedSource) {
        console.log("[AquaStar] Could not find desktopCapturer source for window title:", currentWindowTitle);
        console.log("[AquaStar] Available sources:", sources.map(s => s.name));
        return;
      }

      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSourceId: matchedSource.id,
            chromeMediaSource: 'desktop'
          }
        }
      }).then((stream) => handleStream(stream))
        .catch((e) => console.log("[AquaStar] getUserMedia error:", e));
    })
  }

  function handleStream(stream) {

      mediaRecorder = new MediaRecorder(stream,
        { mimeType: 'video/webm; codecs=h264',
          videoBitsPerSecond: 10000000 }
      );

      // Register Handlers
      mediaRecorder.ondataavailable = (e) => {
        recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = async (e) => {
        saveVideo();
      };
  }

  function saveVideo () {
    const blob = new Blob(recordedChunks, {
      type: 'video/webm; codecs=h264'
    });

    let fileReader = new FileReader();
    fileReader.onload = function() {
      let arrayBuffer = this.result;
      const buffer = Buffer.from(arrayBuffer); // Buffer() is deprecated.
      var recordName = getRecordName();

      ipcRenderer.send('saveDialog', recordName);
      ipcRenderer.once('saveDialogReply', (event, filename) => {
        if(filename != null && filename != undefined){
          // User didnt canceled. Go ahead!
          // Reason why remote is enabled -_- sadly.
          require("fs").writeFileSync(filename, buffer);
        }
      })
    };
    fileReader.readAsArrayBuffer(blob);
  }

  window.onload = getGameWindow;
})();
