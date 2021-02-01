const { app, BrowserWindow} = require('electron')
const path                  = require('path')
const electronLocalshortcut = require('electron-localshortcut');

const flash    = require('./res/flash.js');
//const keyb  = require('./res/keybinding.js');
const inst     = require('./res/instances.js');
// Important Variables - in const.js
const constant = require('./res/const.js');

// function executeOnFocused(mainWin, funcForWindow){
//     if(mainWin.isFocused()) {
//         funcForWindow(mainWin);
//         return;
//     }
//     else {
//         for (var i = 0; i < aqliteWindowArray.length; i++){
//             if (aqliteWindowArray[i].isFocused())
//                 funcForWindow(aqliteWindowArray[i]);
//         }
//     }
// }
// 
// // Test if the window focused is a Aqlite window (more like if
// //  one of the aqlite windows is focused) so it can use keybinds
// function testForFocus(){
//     for (var i = 0; i < aqliteWindowArray.length; i++){
//         if (aqliteWindowArray[i].isFocused()) return true;
//     }
//     return false;
// }

// Show help Function
function showHelpMessage(){
    const { dialog } = require('electron')
    const dialog_options = {
        buttons: ['Ok'],
        title: 'Help:',
        message: "These are the keybindings added to the game.",
        detail: 'Alt + W - AQW Wiki\n' +
            'Alt + D - AQW Design notes\n' +
            'Alt + A - Account page\n' +
            //'Alt + P - Character (Player) lookup. You can also just use the in-game lookup.\n' +
            'Alt + N - Opens a new Aqlite instance.\n' +
            'Alt + Q - Opens a Vanilla AQW instance as in aq.com/game/ (keybind subject to change as its temporary)\n' +
            'Alt + Y - Opens a new Window with the usefull browser pages with tabs, being grouped up so doesnt spam windows. Uses more memory (300mb) tho.\n' +
            'F9 - About ' + constant.appName + '.\n' +
            'F11 - Toggles Fullscreen\n' +
            'Shift + F5 - Clears all game cache, some cookies and refresh the window (can fix some bugs in game).\n\n' +
            'Note: F1, or Cmd/Ctrl + H, or Alt + H Shows this message.',
    };
    const response = dialog.showMessageBox(null,dialog_options);
}

// About function
function showAboutMessage(){
    const { dialog } = require('electron')
    const dialog_options = {
        buttons: ['Ok'],
        title: 'About AquaStar version:' + app.getVersion(),
        message: "Aquastar would not be possible without the help of:",
        detail: '133spider (github) for creating AQLite itself\n' +
         'CaioFViana (github)\n' +
         'aquaspy (github)\n' +
         'Artix Entertainment (artix.com)\n' +
         'ElectronJs (electronjs.org)\n' +
         'Adobe Flash Player (adobe.com)\n' +
         'YOU! (Yes, You! Thanks for supporting us!)\n\n' +
        'Note: This is NOT an official Artix product. Artix Entertainment does not recommends it by any means. You are at your own risk using it.\n\n' +
        'You can give your opinion, contribute and follow the project here: https://github.com/aquaspy/AquaStar',
    };
    const response = dialog.showMessageBox(null,dialog_options);
}

// Flash stuff is isolated in flash.js
flash.flashManager(app,__dirname,constant.appName);

function createWindow () {
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
  win.setTitle("AQLite");

  // KeyBindings ---
  var addKeybind = function(keybind, func){
    electronLocalshortcut.register(keybind,()=>{
      if ( win.isFocused() || inst.testForFocus() ){
        func();
      }
    })
  }
  addKeybind('Alt+W', ()=>{inst.newBrowserWindow(constant.wikiReleases)});
  addKeybind('Alt+D', ()=>{inst.newBrowserWindow(constant.designNotes)});
  addKeybind('Alt+A', ()=>{inst.newBrowserWindow(constant.accountAq)});
  //addKeybind('Alt+P', ()=>{newBrowserWindow(constant.charLookup)});

  addKeybind('Alt+Y',  ()=>{inst.newTabbedWindow()});
  
  // Open new Aqlite window (usefull for alts)
  addKeybind('Alt+N',  ()=>{inst.newBrowserWindow(constant.aqlitePath)});
  addKeybind('Alt+Q',  ()=>{inst.newBrowserWindow(constant.vanillaAQW)});
  
  // Show help message
  addKeybind('Alt+H',              ()=>{showHelpMessage()});
  addKeybind('F1',                 ()=>{showHelpMessage()});
  addKeybind('CommandOrControl+H', ()=>{showHelpMessage()});
  // Show About
  addKeybind('F9',  ()=>{showAboutMessage()});

  // Toggle Fullscreen
  var toggle = function(focusedWin){
    focusedWin.setFullScreen(!focusedWin.isFullScreen());
    focusedWin.setMenuBarVisibility(false)
  };
  addKeybind('F11', ()=>{inst.executeOnFocused(win,toggle)});

  // Reload
  var reloadPage = function(focusedWin){focusedWin.reload()};
  addKeybind('F5',                 ()=>{inst.executeOnFocused(win,reloadPage)});
  addKeybind('CommandOrControl+R', ()=>{inst.executeOnFocused(win,reloadPage)});
  // Reload and Clear cache
  addKeybind('Shift+F5', () => {
    ses.flushStorageData() //writing some data from memory to disk before cleaning
    ses.clearStorageData({storages: ['appcache', 'shadercache', 'cachestorage', 'localstorage', 'cookies', 'filesystem', 'indexdb', 'websql', 'serviceworkers']})
    inst.executeOnFocused(win,reloadPage)
  })

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
