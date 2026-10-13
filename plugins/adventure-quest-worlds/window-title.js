// Window titles of the AQW game windows. The platform passes the app name and the saved
// settings; what the title says is this plugin's decision.

/**
 * With featurePlayerName on and a Player Character set, the character replaces the app
 * name in the title. Only letters and digits survive: it is typed into a window title.
 */
function displayName(ctx) {
    const appName = (ctx && ctx.displayName) || 'AquaStar';
    const settings = (ctx && ctx.settings) || {};
    if (settings.featurePlayerName !== true) return appName;
    const id = settings.playerCharacter == null
        ? '' : String(settings.playerCharacter).trim().replace(/[^a-zA-Z0-9]/g, '');
    return id === '' ? appName : id;
}

/** Title of the main game window; a local SWF override is called out as such. */
function primaryTitle(ctx) {
    return displayName(ctx) + ' - ' +
        (ctx && ctx.usingCustomSwf ? 'Older/Custom AQLite' : 'Adventure Quest Worlds');
}

module.exports = { displayName: displayName, primaryTitle: primaryTitle };
