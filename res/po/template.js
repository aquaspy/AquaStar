// If you want to translate our program, thanks! Check out the english file for an example.

exports.helpTitle = ""
exports.helpMessage = ""
exports.helpDetail = (k) => {return k.wiki + ' - \n' +
    k.design   + ' - \n' +
    k.account  + ' - \n' +
    k.charpage + ' - \n' +
    k.cpSshot + ' - \n' +
    k.newAqlite + ' - \n' +
    k.newAqw + ' - \n' +
    k.newTabbed + ' - \n' +
    k.about + ' - \n' +
    k.fullscreen + ' - \n' +
    k.sshot + ' - \n' + 
    k.reload + ' or ' + k.reload2 + " - \n" +
    k.reloadCache + ' - \n\n' +
    "<Older AQLite instructions>. "+
    'Note:' + k.help.join(', ') + ' Shows this message.';
}
exports.helpScreenshot = ""
exports.helpAqliteOld  = ""
exports.aboutTitle     = ""
exports.aboutMessage   = ""
exports.aboutDetail    = ""
exports.aboutDebug     = ""

exports.aboutGithubPrompt = ""
exports.aboutClosePrompt  = ""

exports.invalidCharpage  = "";
exports.loadingCharpage  = "";
exports.buildingCharpage = "";
exports.cpDone           = "";
exports.doneSavedAs      = "";

exports.menuBackward     = "";
exports.menuFoward       = "";
exports.menuOtherPages   = "";
exports.menuOtherPages2  = "";
exports.menuWiki         = "";
exports.menuDesign       = "";
exports.menuAccount      = "";
exports.menuPortal       = "";
exports.menuHeromart     = "";
exports.menuCalendar     = "";
exports.menuCharpage     = "";
exports.menuGuide        = "";
exports.menuTakeShot     = "";
exports.menuCopyURL      = "";
