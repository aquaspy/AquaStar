const path = require("path");

const appRoot = () => {
    return __dirname.substring(0,__dirname.lastIndexOf(path.sep));
}

exports.appName = "AquaStar"
exports.iconPath = path.join(appRoot(), 'Icon', 'Icon.png');
exports.aqlitePath = 'file://'+ path.join(appRoot(), 'aqlite.swf');
exports.vanillaAQW = 'http://aq.com/game/gamefiles/Loader.swf'
exports.pagesPath = 'file://'+ path.join(appRoot(), 'pages', 'pages.html');

exports.wikiReleases = 'http://aqwwiki.wikidot.com/new-releases';
exports.accountAq = 'https://account.aq.com/'
exports.designNotes = 'https://www.aq.com/gamedesignnotes/'
exports.charLookup = 'https://www.aq.com/character.asp';
