exports.helpTitle = 'Help:'
exports.helpMessage = "These are the keybindings added to the game."
exports.helpDetail = (k) => {return k.wiki + ' - AQW Wiki\n' +
    k.design    + ' - AQW Design notes\n' +
    k.account   + ' - Account page\n' +
    k.charpage  + ' - Character (Player) lookup. You can also just use the in-game lookup.\n' +
    k.cpSshot   + ' - (Char pages only!) Take a screenshot of the current char page.\n' +
    k.newAqlite + ' - Opens a new Aqlite instance.\n' +
    k.newAqw    + ' - Opens a Vanilla AQW instance as in aq.com/game/ (keybind subject to change as its temporary)\n' +
    k.newTabbed + ' - Opens a new Window with the usefull browser pages with tabs, being grouped up so doesnt spam windows. Uses more memory (300mb) tho.\n' +
    k.about     + ' - About AquaStar.\n' +
    k.fullscreen+ ' - Toggles Fullscreen\n' +
    k.sshot     + ' - Screenshot the game window (AQW and AQLITE only). They are saved in another folder as detailed below.\n' +
    k.reload + ' or ' + k.reload2 + " - Reload the pages, like in a browser\n" +
    k.reloadCache+' - Clears all game cache, some cookies and refresh the window (can fix some bugs in game).\n\n' +
    'For an older/custom aqlite file, please name it "aqlite_old.swf" and put it in the same folder as the executable, as said below!\n\n' +
    'Note:' + k.help.join(', ') + ' Shows this message.';
}
exports.helpScreenshot = "Screenshot folder: "
exports.helpAqliteOld  = "App folder for aqlite_old (can change if user move the application): "

exports.aboutTitle = 'About AquaStar Version: '
exports.aboutMessage = "Aquastar would not be possible without the help of:";
exports.aboutDetail = 
    '133spider (github) for creating AQLite itself\n' +
    'CaioFViana (github)\n' +
    'aquaspy (github)\n' +
    'Artix Entertainment (artix.com)\n' +
    'ElectronJs (electronjs.org)\n' +
    'Adobe Flash Player (adobe.com)\n' +
    'YOU! (Yes, You! Thanks for supporting us!)\n\n' +
    'Note: This is NOT an official Artix product. Artix Entertainment does not recommends it by any means. You are at your own risk using it.\n\n' +
    'You can give your opinion, contribute and follow the project here: '

exports.aboutDebug       = "Debug Info"

exports.aboutGithubPrompt = "AquaStar Releases page"
exports.aboutClosePrompt  = "Close this Popup"

exports.invalidCharpage  = "Not valid Char Page window!";
exports.loadingCharpage  = "Loading Char Page...";
exports.buildingCharpage = "Building scenario. Please wait some seconds...";
exports.cpDone           = "DONE! Saved CP in Screenshot folder";
exports.doneSavedAs      = "Done! Saved as ";

exports.menuBackward     = "Backward";
exports.menuFoward       = "Foward";
exports.menuOtherPages   = "Usefull Pages"
exports.menuOtherPages2  = "Other usefull Pages";
exports.menuWiki         = "AQW Wiki";
exports.menuDesign       = "Design Notes";
exports.menuAccount      = "AQW Account";
exports.menuPortal       = "Portal Battleon";
exports.menuHeromart     = "Heromart";
exports.menuCalendar     = "Calendar of Events";
exports.menuCharpage     = "Charpages";
exports.menuGuide        = "AQW Guides (old but relevant)";
exports.menuTakeShot     = "Take a SShot of CP (CP ONLY!)";
exports.menuCopyURL      = "Copy this page's URL";
