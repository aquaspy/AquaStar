const path       = require('path')
const fs         = require('fs')
const flashTrust = require('nw-flash-trust');

function appendPerformanceSwitches(app) {
    // Prevent Chromium from throttling the renderer when the window loses focus.
    // Critical for games: alt-tabbing or opening another window must not drop FPS.
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
    app.commandLine.appendSwitch('disable-background-timer-throttling');

    // GPU / rendering optimizations
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
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


    // CPU: disable accessibility tree and crash reporter
    app.commandLine.appendSwitch('disable-renderer-accessibility');
    app.commandLine.appendSwitch('disable-breakpad');

    // Linux-specific shared-memory fix
    if (process.platform === 'linux') {
        app.commandLine.appendSwitch('disable-dev-shm-usage');
    }
}

// PepperFlashPlayer.plugin is i386+x86_64. An arm64 Electron cannot dlopen it, and there
// is no Rosetta prompt for a plugin loaded in-process. Play with Ruffle, or start the
// x64 build under `arch -x86_64`.
function ppapiFlashSupported(platform, arch) {
    platform = platform || process.platform;
    arch = arch || process.arch;
    return !(platform === 'darwin' && arch === 'arm64');
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

// Must match the bundled binaries in FlashPlayer/. Windows, macOS and Linux x64 are the
// exact builds shipped by the game publisher's official desktop launcher (32.0.0.344). It ships no
// Linux 32-bit or ARM build, so those keep their previous binaries.
function getPluginVersion() {
    switch (process.platform) {
    case 'win32':  return '32.0.0.344';
    case 'darwin': return '32.0.0.344';
    case 'linux':
        if (process.arch == 'arm') return '32.0.0.445';
        if (process.arch == 'x86' || process.arch == 'ia32') return '34.0.0.137';
        return '32.0.0.344';
    default:       return '32.0.0.344';
    }
}

let activeTrustManager = null;

const flashTrustManager = (app, appRootPath, trustedPath, appName) =>{
    appendPerformanceSwitches(app);

    // Required for PPAPI Flash on Linux (the PPAPI plugin cannot load inside the sandbox)
    app.commandLine.appendSwitch('no-sandbox');

    if (!ppapiFlashSupported()) {
        console.error('[AquaStar] PPAPI Flash is Intel-only. On Apple Silicon use Ruffle, or start the x64 build with: arch -x86_64');
    } else {
        const flashPluginPath = path.resolve(appRootPath, 'FlashPlayer', getPluginName());
        if (!fs.existsSync(flashPluginPath)) {
            console.error('[AquaStar] PPAPI Flash plugin not found:', flashPluginPath);
        }
        app.commandLine.appendSwitch('ppapi-flash-path', flashPluginPath);
        app.commandLine.appendSwitch('ppapi-flash-version', getPluginVersion());
    }

    const flashPath = path.join(app.getPath('userData'), 'Pepper Data', 'Shockwave Flash', 'WritableRoot');
    activeTrustManager = flashTrust.initSync(appName, flashPath);

    activeTrustManager.empty();
    if (trustedPath) activeTrustManager.add(trustedPath);
}

/**
 * Replace the Flash trust list (used after plugin activate with trustFlashUrls).
 * @param {string[]} urls
 */
function refreshTrust(urls) {
    if (!activeTrustManager) {
        console.log('[AquaStar] Flash trust refresh skipped — trust manager not initialized');
        return;
    }
    activeTrustManager.empty();
    const list = Array.isArray(urls) ? urls : [];
    const seen = {};
    list.forEach(function (url) {
        if (!url || seen[url]) return;
        seen[url] = true;
        try {
            activeTrustManager.add(url);
        } catch (e) {
            console.log('[AquaStar] Flash trust add failed for ' + url + ': ' + e.message);
        }
    });
}

/** @internal tests */
function _setTrustManagerForTests(manager) {
    activeTrustManager = manager;
}

exports.ppapiFlashSupported = ppapiFlashSupported;
exports.flashManager = flashTrustManager;
exports.refreshTrust = refreshTrust;
exports._setTrustManagerForTests = _setTrustManagerForTests;
