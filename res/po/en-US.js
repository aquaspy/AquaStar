function expand (keyb) {if(Array.isArray(keyb)) return keyb.join(', '); else return keyb;};

exports.titleMessages = {
    invalidCharpage  : "Not valid Char Page window!",
    loadingCharpage  : "Loading Char Page...",
    buildingCharpage : "Building scenario. Please wait some seconds...",
    cpDone           : "DONE! Saved CP in Screenshot folder",
    doneSavedAs      : "Done! Saved as "
}

exports.dialogMessages = {
    helpTitle   :'Help:',
    helpMessage :"These are the keybindings added to the game.",
    helpDetail(k) {return expand(k.wiki) + ' - AQW Wiki\n' +
        expand(k.design)    + ' - AQW Design notes\n' +
        expand(k.account)   + ' - Account page\n' +
        expand(k.charpage)  + ' - Character (Player) lookup. You can also just use the in-game lookup.\n' +
        expand(k.cpSshot)   + ' - (Char pages only!) Take a screenshot of the current char page.\n' +
        expand(k.newAqlite) + ' - Opens a new Aqlite instance.\n' +
        expand(k.newAqw)    + ' - Opens a Vanilla AQW instance as in aq.com/game/ (keybind subject to change as its temporary)\n' +
        expand(k.newTabbed) + ' - Opens a new Window with the usefull browser pages with tabs, being grouped up so doesnt spam windows. Uses more memory (300mb) tho.\n' +
        expand(k.about)     + ' - About AquaStar.\n' +
        expand(k.fullscreen)+ ' - Toggles Fullscreen\n' +
        expand(k.sshot)     + ' - Screenshot the game window (AQW and AQLITE only). They are saved in another folder as detailed below.\n' +
        expand(k.reload) + " - Reload the pages, like in a browser\n" +
        expand(k.reloadCache)+' - Clears all game cache, some cookies and refresh the window (can fix some bugs in game).\n\n' +
        'For an older/custom aqlite file, please name it "aqlite_old.swf" and put it in the same folder as the executable, as said below!\n\n' +
        'Note:' + expand(k.help) + ' Shows this message.';
    },
    helpScreenshot     : "Screenshot folder: ",
    helpAqliteOld      : "App folder for aqlite_old and aquastar.json (can change if user move the application): ",
    helpCustomKeyPath  : "Another Location for aquastar.json with custom keybindings. Check Readme.md for help: ",
    
    aboutTitle     : "About AquaStar Version: ",
    aboutMessage   : "Aquastar would not be possible without the help of:",
    aboutDetail    : 
        '133spider (github) for creating AQLite itself\n' +
        'CaioFViana (github)\n' +
        'aquaspy (github)\n' +
        'Artix Entertainment (artix.com)\n' +
        'ElectronJs (electronjs.org)\n' +
        'Adobe Flash Player (adobe.com)\n' +
        'YOU! (Yes, You! Thanks for supporting us!)\n\n' +
        'Note: This is NOT an official Artix product. Artix Entertainment does not recommends it by any means. You are at your own risk using it.\n\n' +
        'You can give your opinion, contribute and follow the project here: ',
    aboutDebug     : "Debug Info",
    
    aboutGithubPrompt : "AquaStar Releases page",
    aboutClosePrompt  : "Close this Popup"
}

exports.menuMessages = {
    menuBackward     : "Backward",
    menuFoward       : "Foward",
    menuOtherPages   : "Usefull Pages",
    menuOtherPages2  : "Other usefull Pages",
    menuSocialMedia  : "Social Media",
    menuWiki         : "AQW Wiki",
    menuDesign       : "Design Notes",
    menuAccount      : "AQW Account",
    menuPortal       : "Portal Battleon",
    menuHeromart     : "Heromart",
    menuDailyGifts   : "Daily Drops",
    menuCalendar     : "Calendar of Events",
    menuCharpage     : "Charpages",
    menuGuide        : "AQW Guides (old but relevant)",
    menuReddit       : "AQW Subreddit",
    menuTwitter      : "Alina's Twitter",
    menuTakeShot     : "Take a SShot of CP (CP ONLY!)",
    menuCopyURL      : "Copy this page's URL",
    menuReloadPage   : "Reload this page"
}
