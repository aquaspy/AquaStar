// Local SWF override: Settings → "Custom SWF File" lets the user run a SWF from disk instead
// of the active plugin's primary game. The platform owns the feature and its neutral file
// name; a plugin can declare older file names it used to read (manifest customSwfAliases) so
// files users already placed keep working.
//
// Lookup order: the managed AppData file first, then its aliases, then the same names next to
// the app (old portable installs), then the directory that contains the .app. Finder launches
// with a working directory of /, so a SWF dropped beside AquaStar.app is invisible to cwd.

const fs = require('fs');
const path = require('path');

const GENERIC_NAME = 'custom-game.swf';

function createCustomSwf(opts) {
    const appDataDirectory = opts.appDataDirectory;
    const appCurrentDirectory = opts.appCurrentDirectory;
    const bundleDirectory = opts.bundleDirectory;
    const toFileUrl = opts.toFileUrl;
    let aliases = [];

    function names() { return [GENERIC_NAME].concat(aliases); }

    function candidates() {
        const list = [];
        names().forEach(function (name) { list.push(path.join(appDataDirectory, name)); });
        names().forEach(function (name) { list.push(path.join(appCurrentDirectory, name)); });
        if (bundleDirectory) {
            names().forEach(function (name) { list.push(path.join(bundleDirectory, name)); });
        }
        return list;
    }

    return {
        GENERIC_NAME: GENERIC_NAME,
        /** Where Settings writes a newly chosen SWF. */
        managedPath: path.join(appDataDirectory, GENERIC_NAME),
        setAliases: function (list) {
            aliases = (Array.isArray(list) ? list : []).filter(function (name) {
                return typeof name === 'string' && /^[A-Za-z0-9._-]+\.swf$/.test(name) && name !== GENERIC_NAME;
            });
        },
        /** The file in effect, or null. */
        activePath: function () {
            const hit = candidates().filter(function (p) { return fs.existsSync(p); })[0];
            return hit || null;
        },
        url: function () {
            const active = this.activePath();
            return active ? toFileUrl(active) : '';
        },
        /** Remove every file that would count as the override (all names, both places). */
        removeAll: function () {
            candidates().forEach(function (p) {
                try { if (fs.existsSync(p)) fs.unlinkSync(p); }
                catch (e) { console.log('[AquaStar] Could not remove ' + p + ': ' + e.message); }
            });
        },
        names: names
    };
}

module.exports = { createCustomSwf: createCustomSwf, GENERIC_NAME: GENERIC_NAME };
