const { app, BrowserWindow, Menu, globalShortcut} = require('electron')
const path = require('path')
const {session} = require('electron')
const flashTrust = require('nw-flash-trust');
const os = require ('os');
const rimraf = require("rimraf");

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
                //nodeIntegrationInWorker: true // https://www.electronjs.org/docs/all#multithreading (performance talvez?!)
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
        message: "These are the keybindings added to the game.",
        detail: 'Alt + W - AQW Wiki\n' +
            'Alt + D - AQW Design notes\n' +
            'Alt + A - Account page\n' +
            'Alt + C - Character lookup. You can also just use the in-game lookup.\n' +
            'Shift + F5 - Clears all game cache and refresh the window.\n\n' +
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

const flashPath = path.join(app.getPath('userData'), 'Pepper Data', 'Shockwave Flash', 'WritableRoot'); //

const trustManager = flashTrust.initSync(appName, flashPath); //

//const trustManager = flashTrust.initSync(appName); Essa sozinha n funciona no electron.

trustManager.empty();
trustManager.add(path.resolve(__dirname, 'aqlite.swf'));

function createWindow () {
  // Create the browser window.
  let win = new BrowserWindow.webContents.session({
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
  const ses = win.webContents.session //creating session




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

  // Reload page.
  const ret8 = globalShortcut.register('F5',() => {
    if (win.isFocused()){
      win.reload();
    }
  })
  const ret9 = globalShortcut.register('CommandOrControl+R',() => {
    if (win.isFocused()){
      win.reload();
    }
  })

  const ret10 = globalShortcut.register('Shift+F5',() => { //Finally, clear chaching!
    if (win.isFocused()){
      const username = os.userInfo ().username; //getting username...
      switch (process.platform) {
        case 'win32':
        ses.clearCache()
        //rimraf.sync('C:\\Users\\'+username+'\\AppData\\Roaming\\'+appName+'\\Cache');
        //rimraf.sync('C:\\Users\\'+username+'\\AppData\\Roaming\\'+appName+'\\GPUCache');
        win.reload();
          break
        case 'darwin':
          rimraf.sync('/Users/'+username+'/Library/Application Support/'+appName+'/Cache');
          rimraf.sync('/Users/'+username+'/Library/Application Support/'+appName+'/GPUCache');
          win.reload();
          break
        case 'linux':
        rimraf.sync('/home/'+username+'/.config/'+appName+'/Cache');
        rimraf.sync('/home/'+username+'/.config/'+appName+'/GPUCache');
        win.reload();
          break
      }

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
