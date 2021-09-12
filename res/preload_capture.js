

// Ok. testing big boi stuff

const { ipcRenderer} = require("electron");

var currentWindowTitle = "";
var currentWindowID = 0;

let mediaRecorder;
const recordedChunks = [];

ipcRenderer.on('variable-reply', function (event, args) {
  console.log(args[0]); // "name"
  currentWindowTitle = args[0];
  console.log(args[1]); // 33
  currentWindowID = args[1];
});

ipcRenderer.send('variable-request', ['winTitle', 'winId']);

(() => {
  function onLoading (){
    const {desktopCapturer}  = require('electron');

    var handleStream = (stream) => {
      console.log("CP4");
      
      var winTimeRef = setTimeout(() => {
        mediaRecorder.stop();
      },5800);

      mediaRecorder = new MediaRecorder(stream, 
        { mimeType: 'video/webm; codecs=vp9' }
      );

      mediaRecorder.start();

      // Register Event Handlers
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
          
          // ONLY use of remote. not enabled on HTML windows, only game ones!
          require("electron").remote.dialog.showSaveDialog(null,{
            buttonLabel: 'Save video',
            defaultPath: `vid-${Date.now()}.webm`
          }, (filename) => {
            console.log(filename);
            require("fs").writeFileSync(filename, buf);
          })
        })
      };
      
    }
    
    //const iconPath  = require("path").join(__dirname.substring(0,__dirname.lastIndexOf(path.sep)), 'Icon', 'Icon_1024.png');
    
    //console.log(__dirname);
    //const nativeImage = require('electron').nativeImage.createFromPath(iconPath)

    desktopCapturer.getSources({types: ['window']}, (error, sources)=> {
      if (error) throw console.log(error);
      console.log("CP2");

      //var currentWindowTitle = require('electron').remote.getCurrentWindow().getTitle();
      //var currentWindowID = require('electron').remote.getCurrentWindow().id;

      // Filter only aquastar strings now.
      var aquastarWindows = [];
      for (let i = 0; i < sources.length; ++i) {
        var numStr = sources[i].id.substring(sources[i].id.lastIndexOf(":"));
        if (parseInt(numStr) != 0){
          aquastarWindows.push(sources[i]);
        }
      }

      for (let i = 0; i < aquastarWindows.length; ++i) {
        console.log("CP2.5 + " + aquastarWindows[i].id + " = " + aquastarWindows[i].name)// + " - " + (nativeImage == sources[i].nativeImageIcon)? "true":"false");
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
          console.log("Recording...");
            break;
        }
      }
    })

  }
  window.onload= onLoading;
})();