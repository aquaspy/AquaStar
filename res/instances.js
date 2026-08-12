const constant               = require('./const.js');
const windowConfig           = require('./windows/config.js');
const windowsMenu            = require('./windows/menu.js');
const keybinds               = require('./keybindings.js');
const socketProxy            = require('./socketProxy.js');
const {BrowserWindow, Menu}  = require('electron');

let usedAltPagesNumbers = [];

// SS asks for them.... Also WikiView JUST because i wanted it in a separeted file organized.
const fs       = require('fs');
const path     = require('path');
let   isAltKPageUp = false;

// For notify Window's original names.
let winTimeRef = {};
let winNames   = {}; // Fake dictionary
let lastFocusedWindow = null;

// A navigation can replace the renderer between did-finish-load and Electron actually
// evaluating an injected script.  executeJavaScript then rejects; always consume that
// rejection so a transient page race never becomes a Node unhandled-rejection warning.
function _executeJavaScriptSafely(webContents, source, label) {
    try {
        return webContents.executeJavaScript(source).catch((error) => {
            if (!webContents.isDestroyed()) {
                console.log('[AquaStar] ' + label + ' skipped: ' + error.message);
            }
            return null;
        });
    } catch (error) {
        if (!webContents.isDestroyed()) {
            console.log('[AquaStar] ' + label + ' skipped: ' + error.message);
        }
        return Promise.resolve(null);
    }
}


// New page function
function newBrowserWindow(new_path, isMainWin=false){
    var config;
    var originalPath = new_path;
    if (isMainWin) config = windowConfig.mainConfig;
    else if (_isGameWindow(new_path)) config = windowConfig.gameConfig;
    else config = windowConfig.winConfig;
    
    // Ruffle mode (Settings): AQW main/new/Testing + DragonFable. Char Page is
    // unaffected (Artix's own page already ships Ruffle).
    var renderMode = (keybinds.keybinds && keybinds.keybinds.renderMode) || constant.defaultRenderMode;
    if (renderMode === 'ruffle' && constant.isRuffleEligible(new_path)) {
        socketProxy.start();
        new_path = constant.wrapRuffleUrl(new_path);
    }
    // Flash path for DragonFable: always use the HTML embed so the 750x550 stage
    // letterboxes into the window (scale=showall). Bare .swf navigation leaves it
    // at native stage size. wmode=opaque + base= keep relative DFversion.asp /
    // gamefiles/* loads working (wmode=direct from file:// breaks them).
    else if (originalPath === constant.df_url) {
        new_path = constant.wrapSwfUrl(new_path, { wmode: 'opaque', scale: 'showall' });
    }
    // Wrap AQW SWFs in an HTML page with wmode=direct for maximum performance.
    else if (constant.useDirectWmode && _isGameWindow(new_path, false)) {
        new_path = constant.wrapSwfUrl(new_path);
    }
    
    const newWin = new BrowserWindow(config);
    newWin.aquaStarSwfUrl = originalPath;
    newWin.setMenuBarVisibility(false); //Remove default electron menu
    newWin.on('focus', () => { lastFocusedWindow = newWin; });
    newWin.loadURL(new_path);

    // Debug mode opens DevTools on every window created through here (main, wiki,
    // design notes, account, char page lookup, game instances...). The char page
    // PRINT window (charPagePrint(), below) is built directly with `new BrowserWindow`
    // and never goes through this function, so it's never affected.
    if (constant.isDebugBuild || constant.isDevToolsEnabled) {
        newWin.webContents.openDevTools();
    }

    if (originalPath == constant.mainPath || 
        originalPath == constant.testingAQW) {

        // Its alt window, Put the aqlite/Aqw title...
        var windowNumber = 1;
        
        for (;usedAltPagesNumbers.includes(windowNumber);windowNumber++){
             if (windowNumber === 2000) {
                console.log("just how long is this opened!?!?");
                break;
            };
        }
        
        // Deciding the new title name...
        var winTitle = "";
        if (originalPath == constant.mainPath){
            var displayName = constant.resolveAppDisplayName(keybinds.keybinds);
            winTitle = displayName + " - " + (constant.isOldAqlite ? "Older/Custom AQLite":" Adventure Quest Worlds");
        }
        else {
            winTitle = "AquaStar - AQW Testing Version!";
        }
        if (windowNumber > 1) winTitle += " (Window " + windowNumber + ")";
            
        newWin.setTitle(winTitle);

        // Storing and Removing the window number from a list.
        usedAltPagesNumbers.push(windowNumber);
        newWin.on('closed', () => {
            usedAltPagesNumbers.splice(
                usedAltPagesNumbers.indexOf(windowNumber), 1);
        });
    }
    else if (originalPath == constant.df_url) {
        newWin.setTitle("AquaStar - DragonFable");
    }
    else {
        /// Its a usual HTML page window then! features incomming
        /// ... but only if its win or lunix. Mac doesnt have the feature -_-
        /// Mac still get keybinds tho, just not the menu.
        newWin.setMenuBarVisibility(true);
    }
    
    _windowAddContext(newWin);
    
    return newWin;
}

// Now, every window created with actions like CTRL + click, can have the right click menu too.
function _windowAddContext(newWin){
    // First, a security check. No more than 70 windows opened at once...
    if (BrowserWindow.getAllWindows().length > 70){
        console.log("This is very problematic... If you are seeing this in terminal, do a CTRL + C on it and cancel the program!");
        return;
    }
    
    if (constant.isDebugBuild) newWin.setTitle(newWin.getTitle() + " < Debug >");
    
    // Context Menu part
    var contextMenu = Menu.buildFromTemplate( 
        windowsMenu.getMenu(keybinds.keybinds,takeSS,true));
    newWin.webContents.on("context-menu",(e,param)=>{
        contextMenu.popup({
            window: newWin,
            x: param.x,
            y: param.y
        });
    })
    
    // "Child Windows follow the same rule" part
    const openChildWindow = (url) => {
        const childWin = new BrowserWindow(windowConfig.winConfig);
        childWin.loadURL(url);
        _windowAddContext(childWin);
        return childWin;
    };
    newWin.webContents.on('new-window', (event, url) => {
        event.preventDefault();
        event.newGuest = openChildWindow(url);
    });
    
    // Bonus: Hug popup (yeah, Hug them hard.)
    newWin.webContents.on("did-finish-load", () => {
        var url = newWin.getURL();
        // Game windows only contain Flash — skip popup/ad injection
        if (_isGameWindow(newWin)) return;
        function testAndDelete (testURL,objName,isClass = false) {
            if(url.includes(testURL)){
                var codeTest;
                codeTest = (isClass)? 
                    "(document.getElementsByClassName('" + objName + "')[0] == undefined)? false : true":
                    "(document.getElementById('" + objName + "') == undefined)? false : true;";

                _executeJavaScriptSafely(newWin.webContents, codeTest, 'Page cleanup check').then((popUpExists) =>{
                    if (popUpExists) {
                        var codeNuke;
                        codeNuke = (isClass)? 
                            "document.getElementsByClassName('" + objName + "')[0].innerHTML = ''":
                            "document.getElementById('" + objName + "').innerHTML = ''";
                        _executeJavaScriptSafely(newWin.webContents, codeNuke, 'Page cleanup');
                    }
                });
            }
        }
        testAndDelete("wikidot","ncmp__tool",false);
        testAndDelete("aq.com","fb-page",true);

        // Ads. Bc wiki is being too trashy to get ad revenue from me.
        testAndDelete("wikidot","wad-aqwwiki-above-content",false);
        testAndDelete("wikidot","wad-aqwwiki-below-content",false);
        _executeJavaScriptSafely(newWin.webContents,
            "var rem = document.getElementsByTagName('iframe');" +
            "for (var i=0;i<rem.lenght;i++) rem[i].remove()", 'Frame cleanup');
        // ----------------------------------------------------------------------------------------------
        // Another bonus: Wiki link preview (WikiView), made by biglavis over at https://github.com/biglavis
        //  Available on the file res/features/wikiview/wikiviewsource.js.

        const checkWiki     = /aqwwiki\.wikidot\.com\/.+/gi
        const checkCharPage = /account\.aq\.com\/CharPage\?id=.+/gi
        const checkAccountAq= /account\.aq\.com\/AQW\/(Inventory|BuyBack|WheelProgress|House)/gi
        const checkAccountSite = /^https?:\/\/account\.aq\.com(?:\/|$)/i
        const checkAccountLogin = /^https?:\/\/account\.aq\.com\/Login(?:\/|$)/i

        const bWiki = checkWiki.test(url)
        const bCp   = checkCharPage.test(url)
        const bAcc  = checkAccountAq.test(url)
        const bAccountSite = checkAccountSite.test(url)
        const bAccountLogin = checkAccountLogin.test(url)
        const isViewUrl = bWiki || bCp || bAcc

        if (isViewUrl){
            const wikiviewDir = path.join(__dirname, 'features', 'wikiview');
            // nameVariants.js provides shared suffix/exception data to both the hover
            // preview and the main-process ownership matcher. It must run before the hover
            // engine, which is also used by the standalone Inventory window.
            const nameVariants = fs.readFileSync(path.join(wikiviewDir, 'nameVariants.js'), 'utf8');
            const hoverPreview = fs.readFileSync(path.join(wikiviewDir, 'hoverPreview.js'), 'utf8');
            var wikiview = nameVariants + hoverPreview + fs.readFileSync(path.join(wikiviewDir, 'wikiviewsource.js'), 'utf8');
            if (bWiki){
                const jquery = fs.readFileSync(path.join(wikiviewDir, 'jquery.min.js'), 'utf8');
                wikiview = jquery + wikiview
            }
            // did-finish-load can fire again for a restored page.  The enhancement source
            // contains top-level declarations, so evaluating it twice in the same renderer
            // would throw a redeclaration error even though the first injection succeeded.
            wikiview = 'if (!window.__aquastarWikiViewInjected) { window.__aquastarWikiViewInjected = true;\n' +
                wikiview + '\n}';
            _executeJavaScriptSafely(newWin.webContents, wikiview, 'Wiki enhancement');
        }

        // Give every account.aq.com page a manual sync entry point.  The injected installer
        // waits for a hydrated DOM and restores itself after client-side page changes; see
        // res/features/inventory/accountSyncButton.js.
        if (bAccountSite && !bAccountLogin){
            const syncBtnSrc = fs.readFileSync(path.join(__dirname, 'features', 'inventory', 'accountSyncButton.js'), 'utf8');
            _executeJavaScriptSafely(newWin.webContents, syncBtnSrc, 'Account sync button');
        }
    });
}

function _resolveTargetWindow(onlyHtml = false, considerDF = false) {
    // PPAPI Flash steals renderer keyboard focus; fall back to last focused window.
    var target = BrowserWindow.getFocusedWindow() || lastFocusedWindow;
    if (target === null) return null;

    var isGame = _isGameWindow(target, considerDF);
    if (onlyHtml == !isGame) return target;
    return null;
}

/// GAME WINDOW ONLY
function executeOnFocused(funcForWindow, onlyHtml = false, considerDF = false){
    var target = _resolveTargetWindow(onlyHtml, considerDF);
    if (target !== null) funcForWindow(target);
}

function _isGameWindow(target, considerDF = true){
    var url;
    // If passed a BrowserWindow, use the stored original SWF URL
    if (target && typeof target === 'object' && target.webContents) {
        url = target.aquaStarSwfUrl || target.webContents.getURL();
    } else {
        url = target;
    }
    
    var aqliteValue = constant.mainPath;
    var vanilla     = constant.testingAQW;
    if(process.platform == "win32") {
        // I so want to swear RN... just WHY???
        // Now when comparing to the file:///, its the same rules as URL.
        aqliteValue = constant.mainPath.replace(/\\/g,"/");
        vanilla     = constant.testingAQW.replace(/\\/g,"/");
    }
    
    if (url == aqliteValue || url == vanilla) return true;
    if (considerDF && url === constant.df_url) {
        return true;
    }
    return false;
}

// Weird char page config - For Alt + K
function charPagePrint(){
    // Check if its valid keybind.
    var focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow == null) return;
    var url = focusedWindow.webContents.getURL();
    if( !url.includes(constant.charLookup + "?id=")) { return };

    let code = `(document.getElementsByTagName("object")[0] == undefined)? false : true;`;
    _executeJavaScriptSafely(focusedWindow.webContents, code, 'Char page check').then((flashExists) =>{
        if(!flashExists){
            _notifyWindow(focusedWindow,constant.titleMessages.invalidCharpage);
        }
        else {
            //VALID! Lets start...
            const newWin = new BrowserWindow(windowConfig.charConfig);
            newWin.setMenuBarVisibility(false);
            _notifyWindow(focusedWindow,constant.titleMessages.loadingCharpage, false);
            newWin.loadURL(url);
            
            // Fix for closing the window too soon...
            isAltKPageUp = true;
            focusedWindow.on('closed', () => {
                isAltKPageUp = false;
            });
            
            newWin.webContents.on("did-finish-load", () => {

                if(isAltKPageUp) _notifyWindow(focusedWindow,constant.titleMessages.buildingCharpage, false);

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
                    if(isAltKPageUp) _notifyWindow(focusedWindow,constant.titleMessages.cpDone);
                },5000);
            });
        }
    });
//TODO - find a way to detect when flash is done loading!
}

// Take a screenshot of the screen. 
// Customizable options in parameter are there for the charPagePrint function
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
    focusedWin.webContents.capturePage(rect)
        .then((sshot) => {
            console.log("Screenshotting it...");
            var ssfolder = constant.sshotPath;
            _mkdir(ssfolder);

            var today = new Date();
            var pre_name = "Screenshot-" +
                today.getFullYear() + "-" +
                (today.getMonth() + 1) + "-" +
                today.getDate() + "_";

            var extraNumberName = 1;
            for (;;extraNumberName++){
                if (fs.existsSync(path.join(ssfolder, pre_name + extraNumberName + ".png"))){
                    if (extraNumberName === 10000) {
                        console.log("10000 prints per day...? wow! Thats a lot!");
                    }
                    continue;
                }
                else break;
            }
            var sshotFileName = pre_name + extraNumberName + ".png";
            var savePath = path.join(ssfolder, sshotFileName);
            fs.writeFileSync(savePath, sshot.toPNG());
            console.log(constant.titleMessages.doneSavedAs + savePath);
            if (!destroyWindow){
                _notifyWindow(focusedWin, constant.titleMessages.doneSavedAs + savePath);
            }
            else {
                focusedWin.close();
            }
        })
        .catch((err) => {
            console.log("[AquaStar] Screenshot error:", err);
        });
}

function getSavedTitle(targetWin) {
    if (!targetWin) return '';
    if (winNames[targetWin.id]) return winNames[targetWin.id];
    const title = targetWin.getTitle();
    const bang = title.indexOf('!');
    if (bang !== -1) return title.slice(bang + 1).trim();
    return title;
}

function _notifyWindow(targetWin, notif, resetAfter = true){
    if (!targetWin || notif == null || notif === undefined) return;

    if (winNames[targetWin.id] == null ||
        winNames[targetWin.id] == undefined) {
            winNames[targetWin.id] = targetWin.getTitle();
    }

    targetWin.setTitle(String(notif));

    if (resetAfter) {
        targetWin.once('close',() => {
            // Cancel the reset. avoid the error when there is no window anymore (closed)!
            clearTimeout(winTimeRef[targetWin.id]);
            targetWin = null; // default kinda deal
        });
        // Reset timer, as each SS needs to have a time to show
        clearTimeout(winTimeRef[targetWin.id]);
        winTimeRef[targetWin.id] = setTimeout(() => {
            targetWin.setTitle(winNames[targetWin.id]);
        },3200);
    }
}

// Settings screen - singleton window, just refocus if already open.
let settingsWin = null;
function openSettingsWindow(){
    if (settingsWin && !settingsWin.isDestroyed()) {
        settingsWin.focus();
        return settingsWin;
    }
    settingsWin = new BrowserWindow(windowConfig.settingsConfig);
    settingsWin.setMenuBarVisibility(false);
    settingsWin.setTitle("AquaStar - Settings");
    settingsWin.loadURL(windowConfig.settingsUrl);
    settingsWin.on('closed', () => { settingsWin = null; });
    return settingsWin;
}

// Reminders screen - singleton window, just refocus if already open.
let remindersWin = null;
function openRemindersWindow(){
    if (remindersWin && !remindersWin.isDestroyed()) {
        remindersWin.focus();
        return remindersWin;
    }
    remindersWin = new BrowserWindow(windowConfig.remindersConfig);
    remindersWin.setMenuBarVisibility(false);
    remindersWin.setTitle("AquaStar - Reminders");
    remindersWin.loadURL(windowConfig.remindersUrl);
    remindersWin.on('closed', () => { remindersWin = null; });
    return remindersWin;
}

// To-Do screen - singleton window, just refocus if already open.
let todoWin = null;
function openTodoWindow(){
    if (todoWin && !todoWin.isDestroyed()) {
        todoWin.focus();
        return todoWin;
    }
    todoWin = new BrowserWindow(windowConfig.todoConfig);
    todoWin.setMenuBarVisibility(false);
    todoWin.setTitle("AquaStar - To-Do List");
    todoWin.loadURL(windowConfig.todoUrl);
    todoWin.on('closed', () => { todoWin = null; });
    return todoWin;
}

// Inventory screen - singleton window, just refocus if already open.
let inventoryWin = null;
function openInventoryWindow(){
    if (inventoryWin && !inventoryWin.isDestroyed()) {
        inventoryWin.focus();
        return inventoryWin;
    }
    inventoryWin = new BrowserWindow(windowConfig.inventoryConfig);
    inventoryWin.setMenuBarVisibility(false);
    inventoryWin.setTitle("AquaStar - Inventory");
    inventoryWin.loadURL(windowConfig.inventoryUrl);
    inventoryWin.on('closed', () => { inventoryWin = null; });
    return inventoryWin;
}

let strategyWin = null;
function openStrategyWindow(){
    if (strategyWin && !strategyWin.isDestroyed()) { strategyWin.focus(); return strategyWin; }
    strategyWin = new BrowserWindow(windowConfig.strategyConfig);
    strategyWin.setMenuBarVisibility(false);
    strategyWin.setTitle("AquaStar - Strategy");
    strategyWin.loadURL(windowConfig.strategyUrl);
    strategyWin.on('closed', () => { strategyWin = null; });
    return strategyWin;
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
exports.openSettingsWindow  = openSettingsWindow;
exports.openRemindersWindow = openRemindersWindow;
exports.openTodoWindow      = openTodoWindow;
exports.openInventoryWindow = openInventoryWindow;
exports.openStrategyWindow  = openStrategyWindow;

exports.executeOnFocused    = executeOnFocused;
exports.takeSS              = takeSS;
exports.notifyWin           = _notifyWindow;
exports.getSavedTitle       = getSavedTitle;
exports.mkdir               = _mkdir;
