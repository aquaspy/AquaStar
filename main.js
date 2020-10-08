const { app, BrowserWindow, Menu} = require('electron')
const path = require('path')
const {session} = require('electron')
const flashTrust = require('nw-flash-trust');

const appName = 'aqlite2';






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



app.commandLine.appendSwitch('ppapi-flash-path', path.join(__dirname, pluginName))
app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.255');

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
    icon: __dirname + "/Icon/Icon.png",
    webPreferences: {
      nodeIntegration: false,
      plugins: true,
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

  //win.setMenuBarVisibility(false)
  // win.removeMenu(true) remove todos os atalhos de abrir as coisas tipo F11, o console etc


  // and load the index.html of the app.



  let menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

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
