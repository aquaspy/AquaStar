'use strict';

// electron-builder with no Developer ID leaves Electron's original signature on a
// bundle whose Info.plist and resources no longer match it. Gatekeeper then calls
// the app damaged. Strip those signatures and ad-hoc sign the AquaStar bits only.
// Ruffle.app keeps the signature from the upstream tarball. This is not --deep.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function insideRuffle(file) {
    return file.split(path.sep).indexOf('Ruffle.app') !== -1;
}

function collect(dir, acc) {
    let names;
    try { names = fs.readdirSync(dir); }
    catch (e) { return; }
    names.forEach(function (name) {
        const child = path.join(dir, name);
        if (insideRuffle(child)) return;
        let st;
        try { st = fs.lstatSync(child); }
        catch (e) { return; }
        if (st.isSymbolicLink()) return;
        if (st.isDirectory()) {
            collect(child, acc);
            if (/\.(framework|app|plugin|dylib)$/.test(name)) acc.push(child);
            return;
        }
        if (st.isFile() && (st.mode & 0o111)) acc.push(child);
    });
}

function codesign(args) {
    try { execFileSync('codesign', args, { stdio: 'ignore' }); }
    catch (e) { /* unsigned data files and non-bundles */ }
}

async function stripMacSignature(context) {
    if (!context || context.electronPlatformName !== 'darwin') return;
    if (process.platform !== 'darwin') return;
    const product = context.packager.appInfo.productFilename;
    const app = path.join(context.appOutDir, product + '.app');
    if (!fs.existsSync(app)) return;
    const targets = [];
    collect(app, targets);
    targets.push(app);
    targets.forEach(function (target) { codesign(['--remove-signature', target]); });
    targets.forEach(function (target) { codesign(['--force', '--sign', '-', target]); });
}

module.exports = stripMacSignature;
