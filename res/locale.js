const path = require("path");

// Default is english.
let   lang       = "en-US";
const langFolder = "po";

function detectLang(systemLang, keyb){
    lang       = systemLang;
    pathToFile = path.join(__dirname, langFolder, lang + ".js");
    let langFile;
    if(require('fs').existsSync(pathToFile)){
        langFile = require(pathToFile);
    }
    else {
        console.log("ALERT: Translations for "+ lang + " not found. Using the default en-US");
        langFile = require(path.join(__dirname, langFolder, "en-US" + ".js"));
        //TODO - test for similar langs with substringing the Lang using the '-' as a separator.
    }

    exports.getHelpTitle        = langFile.helpTitle;
    exports.getHelpMessage      = langFile.helpMessage;
    exports.getHelpDetail       = langFile.helpDetail(keyb);
    exports.getHelpScreenshot   = langFile.helpScreenshot;
    exports.getHelpAqliteOld    = langFile.helpAqliteOld;
    exports.getAboutTitle       = langFile.aboutTitle;
    exports.getAboutMessage     = langFile.aboutMessage;
    exports.getAboutDetail      = langFile.aboutDetail;
    exports.getGithubPage       = langFile.aboutGithubPrompt;
    exports.getCloseWindow      = langFile.aboutClosePrompt;
    exports.getDebug            = langFile.aboutDebug;

    exports.getInvalidCharpage  = langFile.invalidCharpage;
    exports.getLoadingCharpage  = langFile.loadingCharpage;
    exports.getBuildingCharpage = langFile.buildingCharpage;
    exports.getCPDone           = langFile.cpDone;
    exports.getDoneSavedAs      = langFile.doneSavedAs;

    exports.getMenuBackward     = langFile.menuBackward;
    exports.getMenuFoward       = langFile.menuFoward;
    exports.getMenuOtherPages   = langFile.menuOtherPages;
    exports.getMenuOtherPages2  = langFile.menuOtherPages2;
    exports.getMenuWiki         = langFile.menuWiki;
    exports.getMenuDesign       = langFile.menuDesign;
    exports.getMenuAccount      = langFile.menuAccount;
    exports.getMenuPortal       = langFile.menuPortal;
    exports.getMenuHeromart     = langFile.menuHeromart;
    exports.getMenuCalendar     = langFile.menuCalendar;
    exports.getMenuCharpage     = langFile.menuCharpage;
    exports.getMenuGuide        = langFile.menuGuide;
    exports.getMenuTakeShot     = langFile.menuTakeShot;
    exports.getMenuCopyURL      = langFile.menuCopyURL;

    return lang;
}

exports.detectLang = detectLang;
