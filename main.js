const {app, BrowserWindow, session, Menu}  = require('electron')

//const path     = require('path')
const flash    = require('./res/flash.js');
const keyb     = require('./res/keybindings.js');
const inst     = require('./res/instances.js');
// Important Variables - in const.js
const constant = require('./res/const.js');

// Flash stuff is isolated in flash.js
flash.flashManager(app, __dirname, constant.aqlitePath, constant.appName);

function createWindow () {
    // Lang setup. Has to be after Ready event.
    constant.setLocale(app.getLocale(),constant.keyBinds);
    //console.log(app.getLocale());
    // Create the browser window.
    let win = new BrowserWindow(constant.mainConfig);

    win.setTitle("AquaStar - AQLite " + (constant.isOldAqlite ? '(Older/Custom AQLite Version)' : ""));
    win.loadURL(constant.aqlitePath);
    
    // Keybindings now in keybindings.js
    keyb.addKeybinding();
    
    if (process.platform == 'darwin'){
        Menu.setApplicationMenu(null);
    }
    else {
        Menu.setApplicationMenu(
            Menu.buildFromTemplate(constant.getMenu(inst.charPagePrint)));
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
    session.defaultSession.webRequest.onBeforeRequest(['*://*./*'], function(details, callback) {

        var test_url = details.url;
        var check_block_list =/.*adsymptotic\.com\/.*/gi;
        var check_white_list =/(account.)?aq.com\/.*/gi;

        var block_me = check_block_list.test(test_url);
        var release_me = check_white_list.test(test_url);

        if(release_me){
            callback({cancel: false})
        }else if(block_me){
            callback({cancel: true});
        }else{
            callback({cancel: false})
        }

    });

    // Enable Flash swf in official char pages. Thanks for /u/gulag1337 for finding this info and posting in reddit. I almost found it myself by accident... oof.
    const agentTagetFilter = {
        urls: ['*://*.aq.com/*','*://*.aq.com', '*://aq.com(/*)?',]
    }
    session.defaultSession.webRequest.onBeforeSendHeaders(agentTagetFilter, (details, callback) => {
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 6.2; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ArtixGameLauncher/2.0.4 Chrome/73.0.3683.121 Electron/5.0.11 Safari/537.36'
        callback({ requestHeaders: details.requestHeaders })
    })

    //Console
    //win.webContents.openDevTools()
}

app.on('ready', createWindow)
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})
