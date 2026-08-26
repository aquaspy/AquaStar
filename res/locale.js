const path = require("path");

// Default is english.
let   lang       = "en-US";
let   pathToFile;
const langFolder = "po";

// Accelerators are kept as Electron's "CmdOrCtrl" internally (needed for key
// registration); only the text shown to the user in the F1 help dialog is
// swapped to the actual key for the OS its running on.
function _displayKeybinds(keyb){
    const modLabel = (process.platform === 'darwin') ? 'Cmd' : 'Ctrl';
    function fmt(v){
        return typeof v === 'string' ? v.replace(/CmdOrCtrl/g, modLabel) : v;
    }
    var display = {};
    Object.keys(keyb).forEach((k) => {
        display[k] = Array.isArray(keyb[k]) ? keyb[k].map(fmt) : fmt(keyb[k]);
    });
    return display;
}

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
        helpDetail : langFile.dialogMessages.helpDetail(_displayKeybinds(keyb))
    }

    Object.assign(langFile.dialogMessages,newHelpDetail);

    exports.strings = langFile;

    return lang;
}

exports.detectLang = detectLang;
