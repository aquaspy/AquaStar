

// Ok. testing big boi stuff

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

  function onLoading (){
    const {desktopCapturer}  = require('electron');

    var handleStream = (stream) => {

      mediaRecorder = new MediaRecorder(stream, 
        { mimeType: 'video/webm; codecs=vp9' }
      );
      
      // Register Handlers
      mediaRecorder.ondataavailable = (e) => {
        recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = async (e) => {
        const blobb = new Blob(recordedChunks, {
          type: 'video/webm; codecs=vp9'
        });

        const toArrayBuffer = (blob, cb) => {
          let fileReader = new FileReader();
          fileReader.onload = function() {
              let arrayBuffer = this.result;
              cb(arrayBuffer);
          };
          fileReader.readAsArrayBuffer(blob);
          }
        
        toArrayBuffer(blobb, (arrayBuffer) => {
          const buf = Buffer.from(arrayBuffer);

          var today = new Date();
          var recordName = "Recording-" +
            today.getFullYear() + "-" +
            (today.getMonth() + 1) + "-" +
            today.getDate() + "_" + 
            today.getHours() + ":" + today.getMinutes() +  ":"
            today.getSeconds();

          ipcRenderer.send('saveDialog', recordName);
          
          ipcRenderer.on('saveDialogReply', (event, filename) => {
            if(filename != null && filename != undefined){
              // User didnt canceled. Go ahead!
              require("fs").writeFileSync(filename, buf);
            }
          })
        })
      };
      
    }

    desktopCapturer.getSources({types: ['window']}, (error, sources)=> {
      if (error) throw console.log(error);

      // Filter only aquastar strings now.
      var aquastarWindows = [];
      for (let i = 0; i < sources.length; ++i) {
        var numStr = sources[i].id.substring(sources[i].id.lastIndexOf(":"));
        if (parseInt(numStr) != 0){
          aquastarWindows.push(sources[i]);
        }
      }

      for (let i = 0; i < aquastarWindows.length; ++i) {
        //console.log("Window list: + " + aquastarWindows[i].id + " = " + aquastarWindows[i].name)// + " - " + (nativeImage == sources[i].nativeImageIcon)? "true":"false");
        if (aquastarWindows[i].name === currentWindowTitle) {
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSourceId: aquastarWindows[i].id,
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
  window.onload= onLoading;
})();
