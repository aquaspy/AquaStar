const {app, session, Menu, BrowserWindow}  = require('electron')

app.allowRendererProcessReuse = false;

const path     = require('path')
const fs       = require('fs');

const flash    = require('./res/flash.js');
const keyb     = require('./res/keybindings.js');
const inst     = require('./res/instances.js');
// Important Variables - in const.js
const constant = require('./res/const.js');

// Flash stuff is isolated in flash.js
flash.flashManager(app, __dirname, constant.mainPath, constant.appName);

function createWindow () {
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        callback(permission === 'media' || permission === 'display-capture');
    });

    // Keybindings now in keybindings.js
    const finalkeyb = keyb.addKeybinding();

    // Lang setup. Has to be after Ready event.
    constant.setLocale(app.getLocale(),finalkeyb);

    // Create the browser window.
    let win = inst.newBrowserWindow(constant.mainPath,true);

    if (process.platform == 'darwin'){
        Menu.setApplicationMenu(null);
    }
    else {
        Menu.setApplicationMenu(
            Menu.buildFromTemplate(constant.getMenu(finalkeyb, inst.charPagePrint)));
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

    //Console
    if (constant.isDebugBuild){
        win.webContents.openDevTools()
    }

}

// For anyone looking why we arent sandboxed and neither is AE...
// To look in the filesystem for the flash plugin, it needs the "no sandbox" part.
// If anyone out there think we just dont know about it, uncomment here and see for yourself...
// Game/main windows disable per-window sandbox so PPAPI Flash can load.
//app.enableSandbox();

app.on('ready', createWindow)
app.on('will-quit', () => keyb.unregisterGlobalShortcuts())
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