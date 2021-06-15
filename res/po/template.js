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
    k.ccache + ' - \n\n' +
    "<Older AQLite instructions>. "+
    'Note:' + k.help.join(', ') + ' Shows this message.';
}
exports.helpScreenshot = ""
exports.helpAqliteOld  = ""
exports.aboutTitle     = ""
exports.aboutMessage   = ""
exports.aboutDetail    = ""


exports.invalidCharpage  = "";
exports.loadingCharpage  = "";
exports.buildingCharpage = "";
exports.cpDone           = "";
exports.doneSavedAs      = "";