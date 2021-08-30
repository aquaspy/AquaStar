function expand (keyb) {if(Array.isArray(keyb)) return keyb.join(', '); else return keyb;};
exports.helpTitle = 'Help:'
exports.helpMessage = ""
exports.helpDetail = (k) => {return expand(k.wiki) + ' - \n' +
    expand(k.design)    + ' - \n' +
    expand(k.account)   + ' - \n' +
    expand(k.charpage)  + ' - \n' +
    expand(k.cpSshot)   + ' - \n' +
    expand(k.newAqlite) + ' - \n' +
    expand(k.newAqw)    + ' - \n' +
    expand(k.newTabbed) + ' - \n' +
    expand(k.about)     + ' - \n' +
    expand(k.fullscreen)+ ' - \n' +
    expand(k.sshot)     + ' - \n' +
    expand(k.reload)    + " - \n" +
    expand(k.reloadCache)+' - .\n\n' +
    '\n\n' +
    ':' + expand(k.help) + ' .';
}
exports.helpScreenshot = ": "
exports.helpAqliteOld  = ": "
exports.helpCustomKeyPath  = ": "

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
