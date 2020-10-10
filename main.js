const { app, BrowserWindow, Menu, globalShortcut} = require('electron')
const path = require('path')
const {session} = require('electron')
const flashTrust = require('nw-flash-trust');
const fs = require('fs');

// Important Variables
const appName      = 'aqlite2';
const iconPath    = path.join(__dirname, 'Icon', 'Icon.png');

const wikiReleases = 'http://aqwwiki.wikidot.com/new-releases';
const accountAq    = 'https://account.aq.com/'
const designNotes  = 'https://www.aq.com/gamedesignnotes/'
const charLookup   = 'https://www.aq.com/character.asp'; // Maybe ask nickname in dialog box...?





// New page function
function newBrowserWindow(win, new_path){
    if (win.isFocused()){
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
        newWin.loadURL(new_path);
    }
}
// Help Function
function showHelpMessage(){
    const { dialog } = require('electron')
    const dialog_options = {
        buttons: ['Ok'],
        title: 'Help:',
        message: "These are the keybindings added to the game. Note that they use 'Alt' with it",
        detail: 'W - AQW Wiki\n' +
            'D - AQW Design notes\n' +
            'A - Account page\n' +
            'C - Character lookup. You can also just use the in-game lookup.\n\n' +
            'Note: F1, or Cmd/Ctrl + H, or Alt + H Shows this message.',
    };
    const response = dialog.showMessageBox(null,dialog_options);
}

let menuTemplate = [
       {role : "reload"}
      ];

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

//const trustManager = flashTrust.initSync(appName, '/libpepflashplayer.so');

const flashPath = path.join(app.getPath('userData'), 'Pepper Data', 'Shockwave Flash', 'WritableRoot'); //MANO PQ ISSO FUNCIONOU?!

const trustManager = flashTrust.initSync(appName, flashPath); //ESSA FOI A LINHA Q FEZ FUNCIONAR WTHELL 100% confirmado, é ela. Não sei pq.

//const trustManager = flashTrust.initSync(appName); Essa sozinha n funciona no electron.

trustManager.empty();
trustManager.add(path.resolve(__dirname, 'aqlite.swf'));

function createWindow () {
  // Create the browser window.
  let win = new BrowserWindow({
    width: 800,
    height: 600,
    // brackgroundColor: '#312450', cor de fundo do app, mas como uso o iframe nao faz tanta diferença
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      plugins: true,
      javascript: true,
      contextIsolation: true,
      enableRemoteModule: false
      //webviewTag: true desativo pois Iframe tem melhor performance, além do bug do input cursor no webview
    },
    //show: false faz nao aparecer a janela
  })

  let mainSession = win.webContents.session


  //limpeza de cookies
  //mainSession.clearCache()
  //mainSession.clearStorageData()

  //win.loadURL('https://www.aq.com/play-now/'); //Carrega o aqw direto

  win.loadURL(`file://${__dirname}/aqlite.swf`)

  // KeyBindings ---
  const ret1 = globalShortcut.register('Alt+W',() => {
    newBrowserWindow(win,wikiReleases);
  })
  const ret2 = globalShortcut.register('Alt+D',() => {
    newBrowserWindow(win,designNotes);
  })
  const ret3 = globalShortcut.register('Alt+A',() => {
    newBrowserWindow(win,accountAq);
  })
  const ret4 = globalShortcut.register('Alt+C',() => {
    newBrowserWindow(win,charLookup);
  })

  // HELP MEEE
  const ret5 = globalShortcut.register('Alt+H',() => {
    showHelpMessage();
  })
  const ret6 = globalShortcut.register('CommandOrControl+H',() => {
    showHelpMessage();
  })
  const ret7 = globalShortcut.register('F1',() => {
    showHelpMessage();
  })

  // Reload page. Clears cache (...?) of aqlite. At least new releases will show then.
  const ret8 = globalShortcut.register('F5',() => {
    if (win.isFocused()){
      const username = process.env.username || process.env.user; //getting username...
      const dir = '/home/'+username+'.config/aqlite2/.Cache';
      try {
    fs.rmdirSync(dir, { recursive: true });

    console.log(`${dir} is deleted!`);
} catch (err) {
    console.error(`Error while deleting ${dir}.`);
}
      win.reload();
    }
  })
  const ret9 = globalShortcut.register('CommandOrControl+R',() => {
    if (win.isFocused()){
      win.reload();
    }
  })




  /*const ret6 = globalShortcut.register('CommandOrControl+Alt+C',() => {
    showHelpMessage();
  })

  */




  /*mainSession.cookies.get({ url: 'https://laf.world/?game' }) supostamente carrega com cookies
  .then((cookies) => {
    console.log(cookies)
  }).catch((error) => {
    console.log(error)
  })
  */


  /*win.once('ready-to-show', () => { aparecer quando tiver carregado ja
  win.show()
})
*/

  win.setMenuBarVisibility(false) //remove o menu feio :v
   //win.removeMenu(true) remove todos os atalhos de abrir as coisas tipo F11, o console etc


  // and load the index.html of the app.



  //let menu = Menu.buildFromTemplate(menuTemplate);
    //Menu.setApplicationMenu(menu);

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
