// Confirms a packed app still contains the bundled plugin, whether electron-builder
// left resources/app as a directory or packed it into resources/app.asar.
const fs = require('fs');
const path = require('path');

const REQUIRED_REL = [
    'plugins/adventure-quest-worlds/plugin.json',
    'plugins/adventure-quest-worlds/main.js',
    'plugins/adventure-quest-worlds/features/reminders/reminders.js',
    'plugins/adventure-quest-worlds/processes/charpage-studio-process.js',
    'plugins/example-companion/plugin.json',
    'plugins/example-companion/main.js',
    'res/ruffle/ruffle.js'
];

function listAsar(archive) {
    return require('@electron/asar').listPackage(archive);
}

function rootContains(root, rel) {
    if (root.endsWith('.asar')) {
        const want = '/' + rel.split(path.sep).join('/');
        return listAsar(root).indexOf(want) !== -1;
    }
    return fs.existsSync(path.join(root, rel));
}

function findPackedRoots(distRoot) {
    if (!fs.existsSync(distRoot)) return [];
    const roots = [];
    function consider(dir) {
        const asar = path.join(dir, 'resources', 'app.asar');
        const app = path.join(dir, 'resources', 'app');
        if (fs.existsSync(asar)) roots.push(asar);
        else if (fs.existsSync(app)) roots.push(app);
    }
    fs.readdirSync(distRoot, { withFileTypes: true }).forEach(function (ent) {
        if (!ent.isDirectory()) return;
        consider(path.join(distRoot, ent.name));
        const mac = path.join(distRoot, ent.name, 'AquaStar.app', 'Contents');
        if (fs.existsSync(mac)) consider(mac);
    });
    return roots;
}

function missingIn(root) {
    return REQUIRED_REL.filter(function (rel) { return !rootContains(root, rel); });
}

function assertDist(distRoot) {
    const roots = findPackedRoots(distRoot);
    if (!roots.length) {
        throw new Error('No packed app under ' + distRoot);
    }
    roots.forEach(function (root) {
        const missing = missingIn(root);
        if (missing.length) {
            throw new Error(root + ' missing ' + missing.join(', '));
        }
    });
    return roots;
}

if (require.main === module) {
    const distRoot = process.argv[2] || path.join(__dirname, '..', 'dist');
    try {
        const roots = assertDist(distRoot);
        console.log('pack plugins ok: ' + roots.join(', '));
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
}

module.exports = {
    REQUIRED_REL: REQUIRED_REL,
    findPackedRoots: findPackedRoots,
    missingIn: missingIn,
    assertDist: assertDist
};
