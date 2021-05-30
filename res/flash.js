const path       = require('path')
const flashTrust = require('nw-flash-trust');

function getPluginName() {
    let pluginName
    switch (process.platform) {
    case 'win32':
        if (process.arch == "x86"){
        pluginName = 'pepflashplayer32bits.dll'
        }
        else {
        pluginName = 'pepflashplayer.dll'
        }
        break
    case 'darwin':
        // In testing...
        pluginName = 'PepperFlashPlayer.plugin'
        break
    case 'linux':
        // Can be arm too...
        if (process.arch == "x86"){
        pluginName = 'libpepflashplayer32bits.so'
        }
        else if (process.arch == "arm") {
        pluginName = 'libpepflashplayerARM.so'
        }
        else {
            pluginName = 'libpepflashplayer.so'
        }
        break
    }
    return pluginName;
}

const flashTrustManager = (app, appRootPath, aqlitePath, appName) =>{
    
    app.commandLine.appendSwitch('ppapi-flash-path', path.join(appRootPath,"FlashPlayer", getPluginName()))
    app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.344');

    const flashPath = path.join(app.getPath('userData'), 'Pepper Data', 'Shockwave Flash', 'WritableRoot');
    const trustManager = flashTrust.initSync(appName, flashPath);

    trustManager.empty();
    trustManager.add(aqlitePath);
}

exports.flashManager = flashTrustManager;
