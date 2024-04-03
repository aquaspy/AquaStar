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
        if(!startRecording) mediaRecorder.stop();
        else {
            recordedChunks.splice(0,recordedChunks.length); // Empty it
            mediaRecorder.start();
        }
    }

    ipcRenderer.on('record', (event, message) => {
        triggerRecording(message);
    })

    async function getGameWindow() {
        const sources = await require('electron').desktopCapturer.getSources({types: ['window']})

        for (let i = 0; i < sources.length; ++i) {
            // The very last character of this shows 0 for non aquastars and a number for aquastar.
            var num = sources[i].id.substring(sources[i].id.lastIndexOf(":")+1);
            console.log(num + " - " + currentWindowTitle)
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
            }).then((stream) => {
                handleStream(stream)
            })
                .catch((e) => console.log(e));
                break;
            }
        }
    }

    function handleStream(stream) {
        console.log("recording....")
        mediaRecorder = new MediaRecorder(stream, 
            { mimeType: 'video/webm; codecs=h264' }
        );
        
        // Register Handlers
        mediaRecorder.ondataavailable = (e) => {
            recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = async (e) => {
            await saveVideo();
        };
    }

    async function saveVideo() {
        // dont ask how it works. it just works.
        const blob = new Blob(recordedChunks, {
            type: 'video/webm; codecs=h264'
        });
        const buffer = Buffer.from(await blob.arrayBuffer())

        let fileReader = new FileReader();
        fileReader.readAsArrayBuffer(blob);
        fileReader.onload = function() {
            if (fileReader.readyState == 2) {
                const buffer = new Buffer(fileReader.result);
                ipcRenderer.send("saveVideo", getRecordName(), buffer)
            }
        };
    }

    window.onload = getGameWindow();
})();
