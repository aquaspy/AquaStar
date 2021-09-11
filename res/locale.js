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
    
    // Convert the function to a gettable string.
    var newHelpDetail = { 
        helpDetail : langFile.dialogMessages.helpDetail(keyb)
    }

    Object.assign(langFile.dialogMessages,newHelpDetail);

    exports.strings = langFile;

    return lang;
}

exports.detectLang = detectLang;
