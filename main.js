const {app, session, Menu, BrowserWindow}  = require('electron')

// PPAPI Flash only preserves LoaderInfo.parameters when the Studio owns the
// default session. Keep that session in a dedicated AquaStar process.
if (process.argv.indexOf('--charpage-studio') !== -1) {
    require('./scripts/charpage-studio-process.js');
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
const reminders     = require('./res/features/reminders/reminders.js');
const todo          = require('./res/features/todo/todo.js');
const inventory     = require('./res/features/inventory/inventory.js');
const strategy      = require('./res/features/strategy/strategy.js');
const charPageStudio = require('./res/features/charpage/studio.js');
// IPC-only modules (register their ipcMain handlers as a side effect of being required -
// nothing else calls into them directly, so main.js must require them explicitly).
const ipcRecording  = require('./res/ipc/recording.js');
const ipcWikiFetch  = require('./res/ipc/wikiFetch.js');
const inst          = require('./res/instances.js');
const windowsMenu   = require('./res/windows/menu.js');
const socketProxy   = require('./res/socketProxy.js');
const ruffleUpdate  = require('./res/ruffleUpdate.js');
// Important Variables - in const.js
const constant = require('./res/const.js');

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
        win.setMenuBarVisibility(false); //Remove menu so only wiki shows it
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

    // Enable Flash swf in official char pages. Thanks for /u/gulag1337 for finding this info and posting in reddit. I almost found it myself by accident... oof.
    // Match patterns must include a path (e.g. /*)
    const agentTagetFilter = {
        urls: [
            '*://*.aq.com/*',
            '*://aq.com/*',
            '*://game.aq.com/*',
            '*://play.dragonfable.com/*'
        ]
    }
    // Match Artix Game Launcher: strip Artix branding from native UA, identify via header
    const spoofedUA = win.webContents.getUserAgent().replace(/Artix.*\s/, '');
    session.defaultSession.webRequest.onBeforeSendHeaders(agentTagetFilter, (details, callback) => {
        details.requestHeaders['User-Agent'] = spoofedUA;
        details.requestHeaders['artixmode'] = 'launcher';
        callback({ requestHeaders: details.requestHeaders })
    })
    
    
    
    if (constant.isSwfLogEnabled){
        var t = new Date();
        var logName = "SWF log " +
            t.getFullYear() + "-" + (t.getMonth() + 1) + "-" + t.getDate() + "_" + 
            t.getHours() + "-" + t.getMinutes() + ".txt";
            
        inst.mkdir(constant.swflogPath);
        var stream = fs.createWriteStream(
            path.join(constant.swflogPath,logName), 
            {autoClose:true});
        
        const aqwgamefilters = {urls: ['*://game.aq.com/game/*']};
        session.defaultSession.webRequest.onBeforeRequest( aqwgamefilters, (details,callback) => {
            //console.log(details.url);
            stream.write(details.url + "\n");
            callback({ cancel: false })
        })
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
app.on('ready', createWindow)
app.on('will-quit', () => {
  keyb.unregisterGlobalShortcuts();
  // No-op if a Ruffle-mode window never started it.
  socketProxy.stop();
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
