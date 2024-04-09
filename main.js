const { app, BrowserWindow, Menu, shell, session } = require('electron');

const path     = require('path')
const fs       = require('fs');

const keyb     = require('./res/keybindings.js');
const wind     = require('./res/window.js');
const config   = require('./res/config.js');

function createWindow () {
    // Keybindings now in keybindings.js
    const finalkeyb = keyb.addKeybinding();

    // Lang setup. Has to be after Ready event.
    config.localeStrings.setLocale(app.getLocale(),finalkeyb);
 
    const mainWindow = wind.windows.newBrowserWindow(config.constant.mainPath,true);
    if (process.platform == 'darwin'){
        Menu.setApplicationMenu(null);
    }
    else {
        Menu.setApplicationMenu(
            Menu.buildFromTemplate(config.winconf.getMenu(finalkeyb, wind.windows.charPagePrint)));
        mainWindow.setMenuBarVisibility(false); //Remove menu so only wiki shows it
    }

    // FIX for the "Save PX" Dialog!! Wiki is annoying to use w/o this!
    const websiteAdFilter = {urls: ['*://*.com/*']}
    session.defaultSession.webRequest.onBeforeRequest(websiteAdFilter, function(details, callback) {

        var test_url = details.url
        var blockListTest = [/cdn-onesignal\.com\/.*/gi, /.*\.cloudfront\.net\/.*/gi, /nitropay\.com\/.*/gi,
            /statcounter\.com\/.*/gi, /.*google\.com\/.*/gi, /.*doubleclick\.net\/.*/gi, /.*ad-delivery\.com\/.*/gi]
        
        var block_me = false
        for(var i=0; i<blockListTest.length; i++) {
            if (blockListTest[i].test(test_url)) {block_me = true; break;}
        }
        callback({ cancel: block_me })
    });

    // Enable Flash swf in official char pages. Thanks for /u/gulag1337 for finding this info and posting in reddit. I almost found it myself by accident... oof.
    const agentTagetFilter = {
        urls: ['*://account.aq.com/*','*://game.aq.com/*','*://aq.com/*' ,'*://play.dragonfable.com/*']
    }
    session.defaultSession.webRequest.onBeforeSendHeaders(agentTagetFilter, (details, callback) => {
        details.requestHeaders['User-Agent'] = 
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ArtixGameLauncher/2.0.9 Chrome/80.0.3987.163 Electron/8.5.5 Safari/537.36'
        //details.requestHeaders['Referer'] = 'https://game.aq.com/game/gamefiles/Loader_Spider.swf?ver=1'
        callback({ requestHeaders: details.requestHeaders })
    })

    if (config.constant.isSwfLogEnabled){
        var t = new Date();
        var logName = "SWF log " +
            t.getFullYear() + "-" + (t.getMonth() + 1) + "-" + t.getDate() + "_" + 
            t.getHours() + "-" + t.getMinutes() + ".txt";
            
        wind.mkdir(config.constant.swflogPath);
        var stream = fs.createWriteStream(
            path.join(config.constant.swflogPath,logName), {autoClose:true}
            );
        
        const aqwgamefilters = {urls: ['*://game.aq.com/game/*']};
        session.defaultSession.webRequest.onBeforeRequest( aqwgamefilters, (details,callback) => {
            //console.log(details.url);
            stream.write(details.url + "\n");
            callback({requestHeaders: details.requestHeaders})
        })
    }

    //Console
    if (config.isDebugBuild){
        mainWindow.webContents.openDevTools()
    }
    // Show the main window when it's ready
    mainWindow.once('ready-to-show', () => mainWindow.show());
};

const initializeFlashPlugin = () => {
let pluginName;
switch (process.platform) {


    case 'win32':
    if (process.arch == "x86" || process.arch == "ia32"){
    pluginName = 'pepflashplayer32bits.dll'
    }
    else{
           pluginName = app.isPackaged ? 'pepflashplayer.dll' : 'win/x64/pepflashplayer.dll';
           }
    break;
    case 'darwin':
    pluginName = app.isPackaged ? 'PepperFlashPlayer.plugin' : 'mac/x64/PepperFlashPlayer.plugin';
    break;
    case 'linux':
    if (process.arch == "x86"|| process.arch == "ia32"){
    pluginName = app.isPackaged ? 'libpepflashplayer.so' : 'linux/ia32/libpepflashplayer.so';
    }
    else if (process.arch == "arm") {
    pluginName = app.isPackaged ? 'libpepflashplayerARM.so' : 'linux/arm/libpepflashplayerARM.so';
    }
    else {
    pluginName = app.isPackaged ? 'libpepflashplayer.so' : 'linux/x64/libpepflashplayer.so';
    }
    break;
    
    default:
    pluginName = 'libpepflashplayer.so';
   
}

const resourcesPath = app.isPackaged ? process.resourcesPath : __dirname;

if (['freebsd', 'linux', 'netbsd', 'openbsd'].includes(process.platform)) {
    app.commandLine.appendSwitch('no-sandbox');
}

app.commandLine.appendSwitch('ppapi-flash-path', path.join(resourcesPath, 'plugins', pluginName));
app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.465');
};

app.on('window-all-closed', () => {
if (process.platform !== 'darwin') {
    app.quit();
}
});

initializeFlashPlugin();

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
