const path = require("path");
const locale = require("./locale.js");

const appRoot = __dirname.substring(0,__dirname.lastIndexOf(path.sep));
const appVersion = require('electron').app.getVersion();
const appName = "AquaStar";

exports.appName = appName;
exports.appVersion = appVersion;
exports.iconPath = path.join(appRoot, 'Icon', 'Icon.png');

exports.aqlitePath = 'file://'+ path.join(appRoot, 'aqlite.swf');
exports.vanillaAQW = 'http://aq.com/game/gamefiles/Loader.swf'
exports.pagesPath = 'file://'+ path.join(appRoot, 'pages', 'pages.html');

exports.wikiReleases = 'http://aqwwiki.wikidot.com/new-releases';
exports.accountAq = 'https://account.aq.com/'
exports.designNotes = 'https://www.aq.com/gamedesignnotes/'
//exports.charLookup = 'https://www.aq.com/character.asp';
exports.charLookup = 'https://account.aq.com/CharPage';


// Show help Function ----------------------------------------------------------------
function showHelpMessage(){
    const { dialog } = require('electron')
    const dialog_options = {
        buttons: ['Ok'],
        title:   locale.getHelpTitle,
        message: locale.getHelpMessage,
        detail:  locale.getHelpDetail,
    };
    const response = dialog.showMessageBox(null,dialog_options);
}

// About function
function showAboutMessage(){
    const { dialog } = require('electron')
    const dialog_options = {
        buttons: ['Ok'],
        title:   locale.getAboutTitle + appVersion,
        message: locale.getAboutMessage,
        detail:  locale.getAboutDetail + 'https://github.com/aquaspy/AquaStar',
    };
    const response = dialog.showMessageBox(null,dialog_options);
}

exports.showHelpMessage  = showHelpMessage;
exports.showAboutMessage = showAboutMessage;
exports.setLocale = () => {locale.detectLang()};
