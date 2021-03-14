const {app, BrowserWindow} = require('electron')
const path                  = require('path')
//const electronLocalshortcut = require('electron-localshortcut');

const flash    = require('./res/flash.js');
const keyb  = require('./res/keybindings.js');
const inst     = require('./res/instances.js');
// Important Variables - in const.js
const constant = require('./res/const.js');

// Flash stuff is isolated in flash.js
flash.flashManager(app,__dirname,constant.appName);

function createWindow () {
    // Lang setup. Has to be after Ready event.
    constant.setLocale(app.getLocale());
    //console.log(app.getLocale());
    // Create the browser window.
    let win = new BrowserWindow({
        width: 960,
        height: 550,
        icon: constant.iconPath,
        title: constant.appName,
        webPreferences: {
        nodeIntegration: false,
        webviewTag: false,
        plugins: true,
        javascript: true,
        contextIsolation: true,
        enableRemoteModule: false,
        nodeIntegrationInWorker: true //maybe better performance for more instances in future... Neends testing.
        }
    })
    const ses = win.webContents.session //creating session for cache cleaning later.

    win.loadURL(constant.aqlitePath);
    win.setTitle("AquaStar - AQLite");

    // Keybindings now in keybindings.js
    keyb.addKeybinding(win, ses);

    win.once('ready-to-show', () => {win.show()});  //show launcher only when ready
    win.setMenuBarVisibility(false);                //Remove default electron menu

    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null
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
