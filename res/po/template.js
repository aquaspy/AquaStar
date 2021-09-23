function expand (keyb) {if(Array.isArray(keyb)) return keyb.join(', '); else return keyb;};

exports.titleMessages = {
    invalidCharpage  : "",
    loadingCharpage  : "",
    buildingCharpage : "",
    cpDone           : "",
    doneSavedAs      : "",
    recording        : "", // Please, dont use '!'s
    alreadyRecording : ""
}

exports.dialogMessages = {
    helpTitle   :'Help:',
    helpMessage : "",
    helpDetail(k) {return expand(k.wiki) + ' - \n' +
        expand(k.design)    + ' - \n' +
        expand(k.account)   + ' - \n' +
        expand(k.charpage)  + ' - \n' +
        expand(k.cpSshot)   + ' - \n' +
        expand(k.newAqw)    + ' - \n' +
        expand(k.newTest)   + ' - \n' +
        expand(k.about)     + ' - \n' +
        expand(k.fullscreen)+ ' - \n' +
        expand(k.sshot)     + ' - \n' +
        expand(k.record)    + ' - \n' +
        expand(k.reload)    + " - \n" +
        expand(k.reloadCache)+' - .\n\n' +
        '\n\n' +
        ':' + expand(k.help) + ' .';
    },
    helpScreenshot     : ": ",
    helpAqliteOld      : ": ",
    helpCustomKeyPath  : ": ",
    
    aboutTitle     : "",
    aboutMessage   : "",
    aboutDetail    : "",
    aboutDebug     : "",
    
    aboutGithubPrompt : "",
    aboutClosePrompt  : ""
}

exports.menuMessages = {
    menuBackward     : "",
    menuFoward       : "",
    menuOtherPages   : "",
    menuOtherPages2  : "",
    menuSocialMedia  : "",
    menuWiki         : "",
    menuDesign       : "",
    menuAccount      : "",
    menuPortal       : "",
    menuHeromart     : "",
    menuDailyGifts   : "",
    menuCalendar     : "",
    menuCharpage     : "",
    menuGuide        : "",
    menuReddit       : "",
    menuTwitter      : "",
    menuTakeShot     : "",
    menuCopyURL      : "",
    menuReloadPage   : ""
}
