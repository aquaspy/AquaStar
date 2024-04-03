// old instances.js
const config    = require('./config.js');
const keybinds  = require('./keybindings.js');
const {BrowserWindow, Menu} = require('electron');

let usedAltPagesNumbers = [];

// SS asks for them.... Also WikiView JUST because i wanted it in a separeted file organized.
const fs       = require('fs');
const path     = require('path');
let   isAltKPageUp = false;

// For notify Window's original names.
let winTimeRef = {};
let winNames   = {}; // Fake dictionary

class windows {
    static newBrowserWindow(new_path, isMainWin=false){
        var conf;
        if (isMainWin) conf = config.winconf.mainConfig;
        else if (this._isGameWindow(new_path)) conf = config.winconf.gameConfig;
        else conf = config.winconf.winConfig;
        
        const newWin = new BrowserWindow(conf);
        newWin.setMenuBarVisibility(false); //Remove default electron menu
        newWin.loadURL(new_path);
        
        if (new_path == config.constant.mainPath || 
            new_path == config.constant.testingAQW) {

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
            if (new_path == config.constant.mainPath){
                winTitle = "AquaStar - " + (config.constant.isOldAqlite ? "Older/Custom AQLite":" Adventure Quest Worlds");
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
            newWin.on("ready-to-show", ()=>{
                newWin.webContents.executeJavaScript(
                    "document.body.style.height = '100vh'"
                )
            })
        }
        // TODO - AQ & MQ?
        else if (new_path == config.constant.df_url) {
            newWin.setTitle("AquaStar - DragonFable");
        }
        else {
            /// Its a usual HTML page window then!
            newWin.setMenuBarVisibility(true);
        }
        
        this._windowAddContext(newWin);
        
        newWin.webContents.openDevTools()
        return newWin;
    }

    // Now, every window created with actions like CTRL + click, can have the right click menu too.
    static _windowAddContext(newWin){
        // First, a security check. No more than 70 windows opened at once...
        if (BrowserWindow.getAllWindows().length > 70){
            Console.log("This is very problematic... If you are seeing this in terminal, do a CTRL + C on it and cancel the program!");
            return;
        }
        
        if (config.isDebugBuild) newWin.setTitle(newWin.getTitle() + " < Debug >");
        
        // Context Menu part
        var contextMenu = Menu.buildFromTemplate( 
            config.winconf.getMenu(keybinds.keybinds,this.takeSS,true));
        newWin.webContents.on("context-menu",(e,param)=>{
            contextMenu.popup({
                window: newWin,
                x: param.x,
                y: param.y
            });
        })
        
        // "Child Windows follow the same rule" part
        newWin.webContents.on('new-window', (event, url) => {
            //event.preventDefault()
            childWin = new BrowserWindow(constant.winConfig);
            childWin.loadURL(url);
            this._windowAddContext(childWin);
            event.newGuest = childWin;
        })

        // Bonus: Fix wiki being anoying and facebook on aq.com. 
        // TODO - is this fix on aq.com the cause of slowness?
        newWin.webContents.on("did-finish-load", () => {
            var url = newWin.getURL();
            function testAndDelete (testURL, objName, varname, isClass = false) {
                // i forgot launcher is game.aq.com. ooops.
                if(url.includes("game.aq.com")) return

                if(url.includes(testURL)){
                    var codeTest;
                    let testdoc = (isClass)? `getElementsByClassName('${objName}')[0]` : `getElementById('${objName}')`
                    codeTest = `let ${varname} = document.${testdoc}; if (${varname} != undefined) ${varname}.innerHTML = ''`
                    newWin.webContents.executeJavaScript(codeTest)
                }
            }
            // double dosage. preload AND this. to make it gone.
            testAndDelete("wikidot","ncmp__tool","ncmpgone",false);
            testAndDelete("aq.com","fb-page","fbgone",true);
            testAndDelete("aq.com","twitter-timeline","twittergone",true); // doest really work but at least doesnt slow down. prob needs url block as well.

            // Ads. Bc wiki is being too trashy to get ad revenue from me.
            testAndDelete("wikidot","wad-aqwwiki-above-content","wikiad1gone",false);
            testAndDelete("wikidot","wad-aqwwiki-below-content","wikiad2gone",false);
            newWin.webContents.executeJavaScript("var rem = document.getElementsByTagName('iframe');" +
            "for (var i=0;i<rem.lenght;i++) rem[i].remove()");
            
            // ----------------------------------------------------------------------------------------------
            // Another bonus: Wiki link preview (WikiView), made by biglavis over at https://github.com/biglavis
            //  Available on the file wikiviewsource.js. same folder as this one.
            
            const checkWiki     = /aqwwiki\.wikidot\.com\/.+/gi
            const checkCharPage = /account\.aq\.com\/CharPage\?id=.+/gi
            const checkAccountAq= /account\.aq\.com\/AQW\/(Inventory|BuyBack|WheelProgress|House)/gi

            const bWiki = checkWiki.test(url)
            const bCp   = checkCharPage.test(url)
            const bAcc  = checkAccountAq.test(url)

            // This code of mine is weird, yes, but the correct way is BLACK MAGIC UNSTABLE. I am going insane.
            var isViewUrl = false
            if (bWiki) isViewUrl = true
            if (bCp)   isViewUrl = true
            if (bAcc)  isViewUrl = true

            if (isViewUrl){
                // Prepare the javascript for it
                //  It uses the already available JQuery.
                var wikiview = fs.readFileSync(path.join(__dirname,'wikiviewsource.js'), 'utf8');
                if (bWiki){
                    // THAT SAID. wiki doesnt have jquery. load it just for it. I hate dependencies but ooooh well
                    //  This file is the exact same as the one the original script asked. same version, everything.
                    const jquery = fs.readFileSync(path.join(__dirname,'jquery.min.js'), 'utf8');
                    wikiview = jquery + wikiview
                    
                }
                newWin.webContents.executeJavaScript(wikiview);
            }
        });
    }

    static _notifyWindow(targetWin, notif, resetAfter = true){
        // Setup for it
        if ([null,undefined].includes(winNames[targetWin.id])){
                // Save if needed
                winNames[targetWin.id] = targetWin.getTitle();
        }
        targetWin.setTitle(notif);
        if (resetAfter) {
            targetWin.on('close',() => {
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

    // Is it a game window?
    // TODO - add support for other 2 games if plan goes.
    static _isGameWindow(url, considerOthers = true){
    
        var aqliteValue = config.constant.mainPath;
        var vanilla     = config.constant.testingAQW;
        if(process.platform == "win32") {
            // I so want to swear RN... just WHY???
            // Now when comparing to the file:///, its the same rules as URL.
            aqliteValue = aqliteValue.replace(/\\/g,"/");
            vanilla     = vanilla.replace(/\\/g,"/");
        }
        
        if ([aqliteValue,vanilla].includes(url)) return true;
        if (considerOthers && [config.constant.df_url].includes(url)) 
            return true;

        return false;
    }

    static executeOnFocused(funcForWindow, onlyHtml = false, considerOthers = false){
        var focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow === null) return; // No AquaStar Windows are focused. Do nothing.

        // Is it a game or is it a HTML..?
        var isGame = this._isGameWindow(focusedWindow.webContents.getURL(), considerOthers);
    
        // Compacting of the XOR gave me this..
        if (onlyHtml == !isGame) funcForWindow(focusedWindow);
    }

    // Weird char page config - For Alt + K
    static async charPagePrint(){
        // Check if its valid keybind.
        var focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow == null) return;
        var url = focusedWindow.webContents.getURL();
        if( !url.includes(config.constant.charLookup + "?id=")) { return };

        let code = `(document.getElementsByTagName("object")[0] == undefined)? false : true;`;
        let flashExists = await focusedWindow.webContents.executeJavaScript(code)
        if(!flashExists){
            windows._notifyWindow(focusedWindow, config.localeStrings.titleMessages.invalidCharpage);
            return;
        }
        
        //VALID! Lets start...
        const newWin = new BrowserWindow(config.winconf.charConfig);
        newWin.setMenuBarVisibility(false);
        windows._notifyWindow(focusedWindow, config.localeStrings.titleMessages.loadingCharpage, false);
        newWin.loadURL(url);
        
        // Fix for closing the window too soon...
        isAltKPageUp = true;
        focusedWindow.on('closed', () => {
            isAltKPageUp = false;
        });
                
        newWin.webContents.on("did-finish-load", () => {
            if(isAltKPageUp) windows._notifyWindow(focusedWindow, config.localeStrings.titleMessages.buildingCharpage, false);

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
                windows.takeSS(newWin, rect, true);
                if(isAltKPageUp) windows._notifyWindow(focusedWindow, config.localeStrings.titleMessages.cpDone);
            },5000);
        });
        //TODO - find a way to detect when flash is done loading!
    }

    // Take a screenshot of the screen. 
    // Customizable options in parameter are there for the charPagePrint function
    static takeSS(focusedWin, ret = null, destroyWindow = false){
        // If ret is passed, we figure how to take the SS.
        // Format is the rectangle one;
        var rect = ret;
        if ([null, undefined].includes(ret)){
            rect = {
                x: 0,
                y: 0,
                width:  focusedWin.getContentSize()[0],
                height: focusedWin.getContentSize()[1]
            }
        }

        focusedWin.webContents.capturePage(rect).then((sshot)=>{
            console.log("Screenshotting it...");
            // Create SS directory if doesnt exist
            var ssfolder = config.constant.sshotPath;
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
            console.log(config.localeStrings.titleMessages.doneSavedAs + savePath);
            
            if (destroyWindow) focusedWin.close();
            else // Usefull for char page builds
                this._notifyWindow(focusedWin, config.localeStrings.titleMessages.doneSavedAs + savePath)
        })
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

exports.windows  = windows;
exports.mkdir    = _mkdir;
