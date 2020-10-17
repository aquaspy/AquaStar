const { app, BrowserWindow} = require('electron')
const path = require('path')
const flashTrust = require('nw-flash-trust');
const os = require ('os');
const electronLocalshortcut = require('electron-localshortcut');

// Important Variables
const appName      = 'aqlite2';
const iconPath     = path.join(__dirname, 'Icon', 'Icon.png');
const aqlitePath   = 'file://'+ path.join(__dirname, 'aqlite.swf');

const wikiReleases = 'http://aqwwiki.wikidot.com/new-releases';
const accountAq    = 'https://account.aq.com/'
const designNotes  = 'https://www.aq.com/gamedesignnotes/'
const charLookup   = 'https://www.aq.com/character.asp'; // Maybe ask nickname in dialog box...?


// New page function
function newBrowserWindow(new_path){
    const newWin = new BrowserWindow({
        'width': 800,
        'height': 600,
        'webPreferences': {
            'plugins': true,
            'nodeIntegration': false,
            'javascript': true,
            'contextIsolation': true,
            'enableRemoteModule': false
        },
        'icon': iconPath
    });
    newWin.setMenuBarVisibility(false) //Remove default electron menu
    newWin.loadURL(new_path);
}


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
            'Alt + C - Character lookup. You can also just use the in-game lookup.\n' +
            'Alt + L - Opens a new Aqlite instance.\n' +
            'F9 - About ' + appName + '.\n' +
            'F11 - Toggles Fullscreen\n' +
            'Shift + F5 - Clears all game cache, some cookies and refresh the window(can fix some bugs in game).\n\n' +
            'Note: F1, or Cmd/Ctrl + H, or Alt + H Shows this message.',
    };
    const response = dialog.showMessageBox(null,dialog_options);
}

//About function
function showAboutMessage(){
    const { dialog } = require('electron')
    const dialog_options = {
        buttons: ['Ok'],
        title: 'About AqLite2 version:',
        message: "AqLite2 v"+app.getVersion()+" would not be possible without the help of:",
        detail: '133spider (github)\n' +
         'CaioFViana (github)\n' +
         'aquaspy (github)\n' +
         'Artix Entertainment (artix.com)\n' +
         'ElectronJs (electronjs.org)\n' +
         'Adobe Flash Player (adobe.com)\n' +
         'YOU! (Yes, You! Thanks for supporting us!)\n\n' +
        'Note: This is NOT an official Artix product. Artix Entertainment does not recommends it by any means. You are at your own risk using it.\n\n' +
        'You can give your opinion, contribute and follow the project here: https://github.com/aquaspy/AqLite2',
    };
    const response = dialog.showMessageBox(null,dialog_options);
}


let pluginName
switch (process.platform) {
  case 'win32':
    pluginName = 'pepflashplayer.dll'
    break
  case 'darwin':
    pluginName = 'PepperFlashPlayer.plugin'
    break
  case 'linux':
    pluginName = 'libpepflashplayer.so'
    break
}

app.commandLine.appendSwitch('ppapi-flash-path', path.join(__dirname,"FlashPlayer", pluginName))
app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.433');


const flashPath = path.join(app.getPath('userData'), 'Pepper Data', 'Shockwave Flash', 'WritableRoot');
const trustManager = flashTrust.initSync(appName, flashPath);

trustManager.empty();
trustManager.add(path.resolve(__dirname, 'aqlite.swf'));

function createWindow () {
  // Create the browser window.
  let win = new BrowserWindow({
    width: 800,
    height: 600,
    icon: iconPath,
    title: appName, // Maybe change to something else...?
    webPreferences: {
      nodeIntegration: false,
      plugins: true,
      javascript: true,
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegrationInWorker: true //maybe better performance for more instances in future... Neends testing.
    }
  })

  win.loadURL(aqlitePath);

  // KeyBindings ---
  
  var addKeybing = function(keybind, func){
    electronLocalshortcut.register(keybind,()=>{
      if (win.isFocused()){
        func();
      }
    })
  }
  addKeybing('Alt+W', ()=>{newBrowserWindow(wikiReleases)});
  addKeybing('Alt+D', ()=>{newBrowserWindow(designNotes)});
  addKeybing('Alt+A', ()=>{newBrowserWindow(accountAq)});
  addKeybing('Alt+C', ()=>{newBrowserWindow(charLookup)});

  // Open new Aqlite window (usefull for alts)
  addKeybing('Alt+L',  ()=>{newBrowserWindow(aqlitePath)});
  
  // Show help message
  addKeybing('Alt+H',              ()=>{showHelpMessage()});
  addKeybing('F1',                 ()=>{showHelpMessage()});
  addKeybing('CommandOrControl+H', ()=>{showHelpMessage()});
  // Show About 
  addKeybing('F9',  ()=>{showAboutMessage()});
  // Toggle Fullscreen
  addKeybing('F11', ()=>{win.setFullScreen(!win.isFullScreen()); win.setMenuBarVisibility(false);});
  
  // Reload page.
  addKeybing('F5',                 ()=>{win.reload()});
  addKeybing('CommandOrControl+R', ()=>{win.reload()});  
  // Reload and Clear cache
  addKeybing('Shift+F5', () => { 
    const username = os.userInfo ().username; //getting username...
    const ses = win.webContents.session //creating session
    ses.flushStorageData()
    ses.clearStorageData({storages: ['appcache', 'shadercache', 'cachestorage', 'localstorage', 'cookies', 'filesystem', 'indexdb', 'websql', 'serviceworkers']})
    win.reload();
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
