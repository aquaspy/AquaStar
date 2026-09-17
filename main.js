const {app, session, Menu, BrowserWindow}  = require('electron')

// PPAPI Flash only preserves LoaderInfo.parameters when the Studio owns the
// default session. Keep that session in a dedicated AquaStar process.
if (process.argv.indexOf('--charpage-studio-capture') !== -1) {
    require('./plugins/adventure-quest-worlds/processes/charpage-studio-capture-process.js');
    return;
}
if (process.argv.indexOf('--charpage-studio') !== -1) {
    require('./plugins/adventure-quest-worlds/processes/charpage-studio-process.js');
    return;
}

// I am honestly surprised we forgot this line.
if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
}

app.allowRendererProcessReuse = false;

const path     = require('path')
const fs       = require('fs');

const flash         = require('./res/flash.js');
const keyb          = require('./res/keybindings.js');
// Platform IPC (always registered from main — never by plugins).
const ipcRecording  = require('./res/ipc/recording.js');
const inst          = require('./res/instances.js');
const windowsMenu   = require('./res/windows/menu.js');
const socketProxy   = require('./res/socketProxy.js');
const ruffleUpdate  = require('./res/ruffleUpdate.js');
const constant = require('./res/const.js');
const platform = require('./res/platform');

const bootFlags = platform.readPluginFlagsFromDisk(
    constant.appDataDirectory,
    process.env
).flags;

let activePluginRuntime = null;

function loadLegacyFeatureModules() {
    require('./plugins/adventure-quest-worlds/features/reminders/reminders.js');
    require('./plugins/adventure-quest-worlds/features/todo/todo.js');
    require('./plugins/adventure-quest-worlds/features/inventory/inventory.js');
    require('./plugins/adventure-quest-worlds/features/strategy/strategy.js');
    require('./plugins/adventure-quest-worlds/features/charpage/studio.js');
    require('./res/ipc/wikiFetch.js');
}

function activateBundledPluginsOrLegacy() {
    if (!bootFlags.pluginSystem) {
        loadLegacyFeatureModules();
        console.log('[AquaStar:plugins] pluginSystem disabled — using legacy main.js requires');
        return Promise.resolve(null);
    }

    return platform.activateSelected({
        bundledDir: path.join(__dirname, 'plugins'),
        localDir: path.join(constant.appDataDirectory, 'plugins'),
        enableLocalPlugins: bootFlags.enableLocalPlugins,
        allowLocalPluginOverride: bootFlags.allowLocalPluginOverride,
        appVersion: constant.appVersion || app.getVersion(),
        appRootPath: constant.appRootPath,
        appDataDirectory: constant.appDataDirectory,
        platformSettings: Object.assign({}, bootFlags, {
            activePluginId: bootFlags.activePluginId
        }),
        defaultPluginId: 'adventure-quest-worlds',
        legacyIpc: true
    }).then(function (runtime) {
        activePluginRuntime = runtime;
        if (runtime && runtime.host) {
            const state = runtime.host._getState();
            const hooks = state.navigationHooks;
            if (hooks) inst.setNavigationHooks(hooks);

            const menuProviders = {};
            if (runtime.plugin && runtime.plugin.manifest &&
                runtime.plugin.manifest.id === 'adventure-quest-worlds') {
                const aqwMenus = require('./plugins/adventure-quest-worlds/menus.js');
                menuProviders.appUsefulPages = aqwMenus.describeAppUsefulPages;
                menuProviders.gameMenuPages = aqwMenus.describeGameMenuPages;
            }
            platform.menuRegistry.adoptHostState(state, menuProviders);
        }
        return runtime;
    }).catch(function (err) {
        console.log('[AquaStar:plugins] Activation failed, falling back to legacy requires: ' +
            (err && err.message ? err.message : err));
        platform.menuRegistry.clear();
        loadLegacyFeatureModules();
        return null;
    });
}

// Flash stuff is isolated in flash.js
flash.flashManager(app, __dirname, constant.mainPath, constant.appName);

function createWindow () {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        // Screen capture is needed only by AquaStar's own game windows.  Normal
        // browser windows load remote account/wiki pages and must not inherit it.
        const win = BrowserWindow.fromWebContents(webContents);
        const swfUrl = win && win.aquaStarSwfUrl;
        const isGameWindow = typeof swfUrl === 'string' && constant.isRuffleEligible(swfUrl);
        callback(isGameWindow && (permission === 'media' || permission === 'display-capture'));
    });

    // Keybindings now in keybindings.js
    const finalkeyb = keyb.addKeybinding();

    // Best-effort background check: it deliberately never delays startup.
    if (finalkeyb.ruffleAutoUpdate === true) {
        ruffleUpdate.downloadLatest(
            constant.appDataDirectory,
            finalkeyb.ruffleUpdateChannel,
            path.join(constant.appRootPath, 'res', 'ruffle', 'ruffle.js')
        ).then((result) => {
            if (result && result.restartRequired) {
                const { Notification } = require('electron');
                new Notification({ title: 'AquaStar', body: 'A new Ruffle version was downloaded. Restart AquaStar to apply it.' }).show();
            }
        }).catch((e) => console.log('[AquaStar] Ruffle auto-update failed: ' + e.message));
    }

    // Lang setup. Has to be after Ready event.
    constant.setLocale(app.getLocale(),finalkeyb);

    // Create the browser window.
    let win = inst.newBrowserWindow(constant.mainPath,true);

    if (process.platform == 'darwin'){
        Menu.setApplicationMenu(null);
    }
    else {
        Menu.setApplicationMenu(
            Menu.buildFromTemplate(windowsMenu.getMenu(finalkeyb, inst.charPagePrint)));
        if (finalkeyb.showGameMenu !== false) {
            win.setMenu(Menu.buildFromTemplate(windowsMenu.getGameMenu(finalkeyb)));
            win.setMenuBarVisibility(true);
        }
    }
    
    win.once('ready-to-show', () => {win.show()});  //show launcher only when ready
    
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null
    })

    // FIX for the "Save PX" Dialog!! Wiki is annoying to use w/o this!
    session.defaultSession.webRequest.onBeforeRequest(
        { urls: ['*://*.adsymptotic.com/*', '*://*.doubleclick.net/*', '*://*.onesignal.com/*',
                 '*://*.nitropay.com/*', '*://translate.googleapis.com/*'] },
        function(_details, callback) {
            callback({ cancel: true });
        });

    // Match Artix Game Launcher UA / SWF logging — plugin session rules when active.
    const spoofedUA = win.webContents.getUserAgent().replace(/Artix.*\s/, '');
    let swfLogStream = null;
    if (constant.isSwfLogEnabled) {
        var t = new Date();
        var logName = "SWF log " +
            t.getFullYear() + "-" + (t.getMonth() + 1) + "-" + t.getDate() + "_" +
            t.getHours() + "-" + t.getMinutes() + ".txt";
        inst.mkdir(constant.swflogPath);
        swfLogStream = fs.createWriteStream(
            path.join(constant.swflogPath, logName),
            { autoClose: true });
    }

    const sessionRuleState = activePluginRuntime && activePluginRuntime.host
        ? activePluginRuntime.host._getState().sessionRules
        : null;

    if (sessionRuleState && sessionRuleState.length) {
        platform.applySessionRules(session.defaultSession, sessionRuleState, {
            spoofedUA: spoofedUA,
            settings: { swfLog: constant.isSwfLogEnabled },
            logLine: function (line) {
                if (swfLogStream) swfLogStream.write(line + '\n');
            }
        });
    } else {
        // Legacy fallback when pluginSystem is off.
        const agentTagetFilter = {
            urls: [
                '*://*.aq.com/*',
                '*://aq.com/*',
                '*://game.aq.com/*',
                '*://play.dragonfable.com/*'
            ]
        };
        session.defaultSession.webRequest.onBeforeSendHeaders(agentTagetFilter, (details, callback) => {
            details.requestHeaders['User-Agent'] = spoofedUA;
            details.requestHeaders['artixmode'] = 'launcher';
            callback({ requestHeaders: details.requestHeaders });
        });
        if (constant.isSwfLogEnabled && swfLogStream) {
            session.defaultSession.webRequest.onBeforeRequest(
                { urls: ['*://game.aq.com/game/*'] },
                (details, callback) => {
                    swfLogStream.write(details.url + '\n');
                    callback({ cancel: false });
                });
        }
    }

}

// For anyone looking why we arent sandboxed and neither is AE...
// To look in the filesystem for the flash plugin, it needs the "no sandbox" part.
// If anyone out there think we just dont know about it, uncomment here and see for yourself...
// Game/main windows disable per-window sandbox so PPAPI Flash can load.
//app.enableSandbox();

app.on('second-instance', () => {
  // Someone tried to run a second AquaStar - focus the existing one instead.
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
})
app.on('ready', () => {
  activateBundledPluginsOrLegacy().then(() => {
    createWindow();
  });
})
app.on('will-quit', () => {
  keyb.unregisterGlobalShortcuts();
  // No-op if a Ruffle-mode window never started it.
  socketProxy.stop();
  if (activePluginRuntime && activePluginRuntime.module &&
      typeof activePluginRuntime.module.deactivate === 'function') {
    try { activePluginRuntime.module.deactivate(activePluginRuntime.host); }
    catch (e) { console.log('[AquaStar:plugins] deactivate error: ' + e.message); }
  }
})
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
