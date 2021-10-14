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
    t.getSeconds();
}

(() => {
  function triggerRecording(startRecording){
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
    require('electron').desktopCapturer.getSources({types: ['window']}, (error, sources)=> {
      if (error) throw console.log(error);

      for (let i = 0; i < sources.length; ++i) {
        // The very last character of this shows 0 for non aquastars and a number for aquastar.
        var num = parseInt(sources[i].id.substring(sources[i].id.lastIndexOf(":")));

        // Aquastar test, then if "its the right window" test.
        if ( num != 0 && sources[i].name === currentWindowTitle) {
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSourceId: sources[i].id,
                chromeMediaSource: 'desktop'
              }
            }
          }).then((stream) => handleStream(stream))
            .catch((e) => console.log(e));
            break;
        }
      }
    })
  }

  function handleStream(stream) {

      mediaRecorder = new MediaRecorder(stream, 
        { mimeType: 'video/webm; codecs=vp9' }
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
      type: 'video/webm; codecs=vp9'
    });

    let fileReader = new FileReader();
    fileReader.onload = function() {
      let arrayBuffer = this.result;
      const buff = Buffer.from(arrayBuffer);
      var recordName = getRecordName();

      ipcRenderer.send('saveDialog', recordName);
      ipcRenderer.on('saveDialogReply', (event, filename) => {
        if(filename != null && filename != undefined){
          // User didnt canceled. Go ahead!
          // Reason why remote is enabled -_- sadly.
          require("fs").writeFileSync(filename, buff);
        }
      })
    };
    fileReader.readAsArrayBuffer(blob);
  }

  window.onload = getGameWindow();
})();
