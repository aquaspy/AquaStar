const path = require("path")
const fs   = require('fs')
// Default is english.
let   lang       = "en-US"
const langFolder = "po"

exports.detectLang = function (systemLang, keyb){
    lang       = systemLang;
    pathToFile = path.join(__dirname, langFolder, lang + ".js");
    let langFile;
    if(fs.existsSync(pathToFile)){
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
