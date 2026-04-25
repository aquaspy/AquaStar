const path       = require('path')
const flashTrust = require('nw-flash-trust');

function appendPerformanceSwitches(app) {
    // Prevent Chromium from throttling the renderer when the window loses focus.
    // Critical for AQW: alt-tabbing or opening a wiki window must not drop FPS.
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
    app.commandLine.appendSwitch('disable-background-timer-throttling');

    // GPU / rendering optimizations
    app.commandLine.appendSwitch('ignore-gpu-blacklist');
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-zero-copy');
    app.commandLine.appendSwitch('disable-software-rasterizer');

    // Reduce background Chromium overhead
    app.commandLine.appendSwitch('disable-component-update');
    app.commandLine.appendSwitch('disable-default-apps');
    app.commandLine.appendSwitch('disable-hang-monitor');
    app.commandLine.appendSwitch('disable-prompt-on-repost');
    app.commandLine.appendSwitch('disable-sync');
    app.commandLine.appendSwitch('no-first-run');
    app.commandLine.appendSwitch('safebrowsing-disable-auto-update');

    // RAM: disable Chrome extensions, print preview, back-forward cache, prerender
    app.commandLine.appendSwitch('disable-extensions');
    app.commandLine.appendSwitch('disable-component-extensions-with-background-pages');
    app.commandLine.appendSwitch('disable-print-preview');
    app.commandLine.appendSwitch('disable-features', 'BackForwardCache,Prerender2');

    // CPU: disable accessibility tree and crash reporter
    app.commandLine.appendSwitch('disable-renderer-accessibility');
    app.commandLine.appendSwitch('disable-breakpad');

    // Linux-specific shared-memory fix
    if (process.platform === 'linux') {
        app.commandLine.appendSwitch('disable-dev-shm-usage');
    }
}

function getPluginName() {
    let pluginName
    switch (process.platform) {
    case 'win32':
        if (process.arch == "x86" || process.arch == "ia32"){
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
        if (process.arch == "x86"|| process.arch == "ia32"){
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
    appendPerformanceSwitches(app);

    app.commandLine.appendSwitch('ppapi-flash-path', path.join(appRootPath,"FlashPlayer", getPluginName()))
    app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.465');

    const flashPath = path.join(app.getPath('userData'), 'Pepper Data', 'Shockwave Flash', 'WritableRoot');
    const trustManager = flashTrust.initSync(appName, flashPath);

    trustManager.empty();
    trustManager.add(aqlitePath);
}

exports.flashManager = flashTrustManager;
