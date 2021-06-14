const constant              = require('./const.js');
const {BrowserWindow, Menu} = require('electron');

let usedAltPagesNumbers = [];

// SS asks for them....
const fs       = require('fs');
const path     = require('path');
// For notify Window's original names.
let winTimeRef = null;
let winNames   = {}; // Fake dictionary


// New page function
function newBrowserWindow(new_path){
    const config = (new_path == constant.pagesPath)? constant.tabbedConfig : constant.winConfig;
    const newWin = new BrowserWindow(config);
    newWin.setMenuBarVisibility(false); //Remove default electron menu
    newWin.loadURL(new_path);
    
    if (new_path == constant.aqlitePath || 
        new_path == constant.vanillaAQW) {
        // Its alt window, Put the aqlite/Aqw title...
        
        var windowNumber = 2; // As the Main one is 1.
        
        for (;usedAltPagesNumbers.includes(windowNumber);windowNumber++){
             if (windowNumber === 20000) {
                console.log("just how long is this opened!?!?");
                break;
            };
        }
        
        // Deciding the new title name...
        var winTitle = "";
        (new_path == constant.aqlitePath) ? 
            winTitle = "AquaStar - AQLite " + (constant.isOldAqlite ? '(Older/Custom AQLite Version - ': "(") + "Window " + windowNumber + ")" : 
            winTitle = "AquaStar - Adventure Quest Worlds (Window " + windowNumber + ")";
        
        newWin.setTitle(winTitle);

        // Storing and Removing the window number from a list.
        usedAltPagesNumbers.push(windowNumber);
        newWin.on('closed', () => {
            usedAltPagesNumbers.splice(
                usedAltPagesNumbers.indexOf(windowNumber), 1);
        });
    }
    else if (new_path == constant.df_url) {
        newWin.setTitle("AquaStar - DragonFable");
    }
    else if (new_path != constant.pagesPath) {
        /// Its a usual HTML page window then! features incomming
        /// ... but only if its win or lunix. Mac doesnt have the feature -_-
        /// Mac still get keybinds tho, just not the menu.
        newWin.setMenuBarVisibility(true);
        var contextMenu = Menu.buildFromTemplate(constant.getMenu(takeSS,true));

        newWin.webContents.on("context-menu",(e,param)=>{
            contextMenu.popup({
                window: newWin,
                x: param.x,
                y: param.y
            });
        })
    }
}

// Weird char page config
function charPagePrint(){
    // Check if its valid keybind.
    var focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow == null) return;
    var url = focusedWindow.webContents.getURL();
    if( !url.includes(constant.charLookup + "?id=")) { return };

    let code = `(document.getElementsByTagName("object")[0] == undefined)? false : true;`;
    focusedWindow.webContents.executeJavaScript(code).then((flashExists) =>{
        if(!flashExists){
            _notifyWindow(focusedWindow,"Not valid Char Page window!");
        }
        else {
            //VALID! Lets start...
            const newWin = new BrowserWindow(constant.charConfig);
            newWin.setMenuBarVisibility(false);
            _notifyWindow(focusedWindow,"Loading Char Page...", false);
            newWin.loadURL(url);
            newWin.webContents.on("did-finish-load", () => {
                _notifyWindow(focusedWindow,"Building scenario. Please wait some seconds...", false);
    
                // Lets figure it out how to take the sizes
                const wOri = 715;
                const hOri = 455;
                var rect = null;
                setTimeout(()=>{ 
                    const siz = newWin.getSize();
                    if ( (siz[0]/siz[1]) > (wOri/hOri) ){
                        // Window has bigger Width ratio than the original
                        // Scale using Height! reduction is to account for window bar.
                        var h = siz[1]
                        var nw = wOri*(h/hOri)
                        rect = {
                            x: Math.round((siz[0]-nw)/2),
                            y: 0,
                            width:  Math.round(nw),
                            height: h
                        }
                    }
                    else {
                        var w = siz[0]
                        var nh = hOri*(w/wOri)
                        rect = {
                            x: 0,
                            y: 0,
                            width:  w,
                            height: Math.round(nh)
                        }
                    }
                    takeSS(newWin,rect,true);
                    _notifyWindow(focusedWindow,"DONE! Saved CP in Screenshot folder");
    
                },5000);
            });
        }
    });
//TODO - find a way to detect when flash is done loading!
}

/// GAME WINDOW ONLY
function executeOnFocused(funcForWindow, onlyHtml = false, considerDF = false){
    // Friendly reminder for BrowserWindow.getAllWindows() existing

    var focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow === null) {
        // No AquaStar Windows are focused. Do nothing.
        return;
    }
    // Is it a game or is it a HTML..?
    var isGame = _isGameWindow(focusedWindow.webContents.getURL(), considerDF);

    // Compacting of the XOR gave me this... LOOL
    if (onlyHtml == !isGame) funcForWindow(focusedWindow);
}

/// ANY APP WINDOW WILL DO
function executeOnAnyFocused(funcForWindow){
    // NO FUNCTION USES IT, HERE FOR THE FUTURE!
    var focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow === null) {
        // No AquaStar Windows are focused. Do nothing.
        return;
    }
    funcForWindow(focusedWindow);
}

function _isGameWindow(url, considerDF = true){
    
    var aqliteValue = constant.aqlitePath;
    if(process.platform == "win32") {
        // I so want to swear RN... just WHY???
        // Now when comparing to the file:///, its the same rules as URL.
        aqliteValue = constant.aqlitePath.replace(/\\/g,"/");
    }
    
    if (url == aqliteValue || url == constant.vanillaAQW) return true;
    if (considerDF && url === constant.df_url) {
        return true;
    }
    return false;
}

/// Return null or the filename
function takeSS(focusedWin, ret = null, destroyWindow = false){
    // If ret is passed, we figure how to take the SS.
    // Format is the rectangle one;
    var rect = null;
    if (ret == null || ret == undefined){
        rect = {
            x: 0,
            y: 0,
            width:  focusedWin.getContentSize()[0],
            height: focusedWin.getContentSize()[1]
        }
    }
    else { rect = ret;}
    focusedWin.webContents.capturePage(
        rect,
        (sshot) => {
            console.log("Screenshotting it...");
            // Create SS directory if doesnt exist
            var ssfolder = constant.sshotPath;
            _mkdir(ssfolder);

            // Figure out the filename ----------
            var today = new Date();
            var pre_name = "Screenshot-" +
                today.getFullYear() + "-" +
                (today.getMonth() + 1) + "-" +
                today.getDate() + "_";
    
            // Find the number for it
            var extraNumberName = 1;
            for (;;extraNumberName++){
                if (fs.existsSync( path.join( ssfolder, pre_name + extraNumberName + ".png"))){
                    if (extraNumberName === 10000) {
                        console.log("10000 prints per day...? wow! Thats a lot!");
                    }
                    continue;
                }
                else break;
            }
            var sshotFileName = pre_name + extraNumberName + ".png";
            var savePath = path.join(ssfolder, sshotFileName);
            // Save it. ----------------
            fs.writeFileSync(path.join(ssfolder, sshotFileName), sshot.toPNG());
            console.log("Done! Saved as " + savePath);
            if (!destroyWindow){
                // Usefull for char page builds
                _notifyWindow(focusedWin,"Done! Saved as " + savePath);
            }
            else {
                focusedWin.close();
            }
        }
    );
}

function _notifyWindow(targetWin, notif, resetAfter = true){
    // Setup for it
    if (winNames[targetWin.id] == null || 
        winNames[targetWin.id] == undefined ){
            // Save if needed
            winNames[targetWin.id] = targetWin.getTitle();
    }

    targetWin.setTitle(notif);

    if (resetAfter) {
        clearTimeout(winTimeRef); // Reset timer, as each SS needs to have a time to show
        winTimeRef = setTimeout(() => {
            targetWin.setTitle(winNames[targetWin.id]);
        },3200);
    }
}

function _mkdir (filepath){ 
    try { fs.lstatSync(filepath).isDirectory() }
    catch (ex) {
        if (ex.code == 'ENOENT') {
            fs.mkdir(filepath, (err) =>{
                console.log(err);
            })
        }
        else console.log(ex);
    }
}

exports.newBrowserWindow    = newBrowserWindow;
exports.charPagePrint       = charPagePrint;

exports.executeOnFocused    = executeOnFocused;
exports.takeSS              = takeSS;
exports.notifyWin           = _notifyWindow;
