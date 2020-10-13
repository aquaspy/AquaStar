const { app, BrowserWindow} = require('electron')
const path = require('path')
const flashTrust = require('nw-flash-trust');
const os = require ('os');
const electronLocalshortcut = require('electron-localshortcut');

// Important Variables
const appName      = 'aqlite2';
const iconPath    = path.join(__dirname, 'Icon', 'Icon.png');

//const newaqlite = 'file://${__dirname}/aqlite.swf' to be used in future...

const wikiReleases = 'http://aqwwiki.wikidot.com/new-releases';
const accountAq    = 'https://account.aq.com/'
const designNotes  = 'https://www.aq.com/gamedesignnotes/'
const charLookup   = 'https://www.aq.com/character.asp'; // Maybe ask nickname in dialog box...?





// New page function


function newBrowserWindow(win, new_path){
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



// Help Function
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
            //'Alt + L - Opens a new Aqlite instance.\n' +
            'Shift + F5 - Clears all game cache, some cookies and refresh the window(can fix some bugs in game).\n\n' +
            'Note: F1, or Cmd/Ctrl + H, or Alt + H Shows this message.',
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


const flashPath = path.join(app.getPath('userData'), 'Pepper Data', 'Shockwave Flash', 'WritableRoot'); //

const trustManager = flashTrust.initSync(appName, flashPath); //


trustManager.empty();
trustManager.add(path.resolve(__dirname, 'aqlite.swf'));

function createWindow () {
  // Create the browser window.
  let win = new BrowserWindow({
    width: 800,
    height: 600,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      plugins: true,
      javascript: true,
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegrationInWorker: true //maybe better performance for more instances in future... Neends testing.
    }
  })

  win.loadURL(`file://${__dirname}/aqlite.swf`)

  // KeyBindings ---
  const ret1 = electronLocalshortcut.register('Alt+W',() => {
    if (win.isFocused()){
      newBrowserWindow(win,wikiReleases);
    }
    //window.open('http://aqwwiki.wikidot.com/new-releases', '_blank') window.open isn't working...

  })
  const ret2 = electronLocalshortcut.register('Alt+D',() => {
    if (win.isFocused()){
      newBrowserWindow(win,designNotes);
    }
    //window.open('https://www.aq.com/gamedesignnotes/', '_blank')

  })
  const ret3 = electronLocalshortcut.register('Alt+A',() => {
    if (win.isFocused()){
      newBrowserWindow(win,accountAq);
    }
    //window.open('https://account.aq.com/', '_blank',)
  })
  const ret4 = electronLocalshortcut.register('Alt+C',() => {
    //window.open('https://www.aq.com/character.asp', '_blank')
    if (win.isFocused()){
      newBrowserWindow(win,charLookup);
    }

  })

  // Help keybinding
  const ret5 = electronLocalshortcut.register('Alt+H',() => {
    if (win.isFocused()){
      showHelpMessage();
    }
  })
  const ret6 = electronLocalshortcut.register('CommandOrControl+H',() => {
    if (win.isFocused()){
      showHelpMessage();
    }
  })
  const ret7 = electronLocalshortcut.register('F1',() => {
    if (win.isFocused()){
      showHelpMessage();
    }

  })

  // Reload page.
  const ret8 = electronLocalshortcut.register('F5',() => {
    if (win.isFocused()){
      win.reload();
    }

  })
  const ret9 = electronLocalshortcut.register('CommandOrControl+R',() => {
    if (win.isFocused()){
      win.reload();
    }
  })

  const ret10 = electronLocalshortcut.register('Shift+F5',() => { //Finally, clear chaching!
    if (win.isFocused()){
      const username = os.userInfo ().username; //getting username...
      const ses = win.webContents.session //creating session
      switch (process.platform) {
        case 'win32':
        ses.flushStorageData()
        ses.clearStorageData({storages: ['appcache', 'shadercache', 'cachestorage', 'localstorage', 'cookies', 'filesystem', 'indexdb', 'websql', 'serviceworkers']})
        //Documentation for clearStorage: https://github.com/electron/electron/blob/v4.2.12/docs/api/session.md
        win.reload();
          break
        case 'darwin':
        ses.flushStorageData()
        ses.clearStorageData({storages: ['appcache', 'shadercache', 'cachestorage', 'localstorage', 'cookies', 'filesystem', 'indexdb', 'websql', 'serviceworkers']})
          win.reload();
          break
        case 'linux':
        ses.flushStorageData()
        ses.clearStorageData({storages: ['appcache', 'shadercache', 'cachestorage', 'localstorage', 'cookies', 'filesystem', 'indexdb', 'websql', 'serviceworkers']})
        win.reload();
          break
      }

    }

  })
  /* Does not works for now...
  const ret11 = electronLocalshortcut.register('Alt+L',() => {
    if (win.isFocused()){
      newBrowserWindow(win,newaqlite);
    }
      //window.open('file://${__dirname}/aqlite.swf', '_blank',)

  })
  */




  win.once('ready-to-show', () => {  //show launcher only when ready
  win.show()
})


  win.setMenuBarVisibility(false) //Remove default electron menu


  //Console
  //win.webContents.openDevTools()

  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })

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
