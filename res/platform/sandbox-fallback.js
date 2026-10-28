// Linux sandbox startup. Prefer a real Chromium sandbox. Fall back to no-sandbox
// only when this process can neither use user namespaces nor a setuid helper.
//
// Packaged builds already have their own copy of that choice:
//   AppImage AppRun (electron-builder) runs `unshare -Ur true` and adds
//   --no-sandbox only when that fails. It skips the probe if --no-sandbox is
//   already an executableArg, which is why the package does not set one.
//   The deb after-install template chmods chrome-sandbox 4755 only when user
//   namespaces are missing, and 0755 when they work. Do not replace that script.
//
// This module covers the unpacked binary and `electron .`, where neither of
// those launchers runs.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function chromeSandboxIsSuid(execPath) {
    const candidate = path.join(path.dirname(path.resolve(execPath || '')), 'chrome-sandbox');
    try {
        return !!(fs.statSync(candidate).mode & 0o4000);
    } catch (_e) {
        return false;
    }
}

function userNamespacesWork() {
    try {
        const result = spawnSync('unshare', ['-Ur', 'true'], { timeout: 2000, stdio: 'ignore' });
        return result.status === 0;
    } catch (_e) {
        return false;
    }
}

function needsNoSandbox(facts) {
    if (!facts || facts.platform !== 'linux') return false;
    const argv = facts.argv || [];
    if (argv.indexOf('--no-sandbox') !== -1) return false;
    if (facts.userNamespaces) return false;
    if (facts.suidSandbox) return false;
    return true;
}

function applyFallback(app, facts) {
    const decisionFacts = facts || {
        platform: process.platform,
        argv: process.argv,
        userNamespaces: userNamespacesWork(),
        suidSandbox: chromeSandboxIsSuid(process.execPath)
    };
    if (!needsNoSandbox(decisionFacts)) return false;
    console.log('[AquaStar] Chromium sandbox helper is unavailable. Starting without the sandbox.');
    app.commandLine.appendSwitch('no-sandbox');
    return true;
}

module.exports = {
    chromeSandboxIsSuid: chromeSandboxIsSuid,
    userNamespacesWork: userNamespacesWork,
    needsNoSandbox: needsNoSandbox,
    applyFallback: applyFallback
};
