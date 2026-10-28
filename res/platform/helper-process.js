// Generic helper Electron processes (host.windows.spawnHelperProcess).
//
// A plugin can run a script in a second Electron process (e.g. because a window must own
// the default session on its own). The platform knows nothing about what the script does:
// it spawns itself with `--aquastar-helper=<absolute script path>` and main.js hands control
// to that script before booting the normal app.
//
// Only scripts inside the bundled plugins directory may be launched this way. The decision
// runs before plugin discovery and trust settings are loaded, so a script outside the
// bundled tree is refused rather than trusted blindly.

const fs = require('fs');
const path = require('path');

const HELPER_FLAG = '--aquastar-helper=';

/**
 * Build the argv for spawning a helper process.
 * @param {string} scriptPath absolute path of the helper script
 * @param {string[]} [extraArgs] extra argv the script reads itself
 * @param {{ defaultApp?: boolean, appPath?: string }} [runtime] Electron runtime details
 */
function buildHelperArgs(scriptPath, extraArgs, runtime) {
    runtime = runtime || {};
    const args = [];
    // `electron .` (dev) needs the app path first; packaged builds run as the app itself.
    if (runtime.defaultApp && runtime.appPath) args.push(runtime.appPath);
    args.push(HELPER_FLAG + scriptPath);
    return args.concat(Array.isArray(extraArgs) ? extraArgs : []);
}

/**
 * Inspect argv at process start.
 * @returns {{ requested: boolean, script: string|null, error: string|null }}
 */
// realpath follows symlinks in a dev tree. Inside app.asar it throws, but the member
// is still readable and require() can load it, so an existing archive path is accepted.
function resolveExisting(file, io) {
    const files = io || fs;
    const resolved = path.resolve(file);
    try {
        return files.realpathSync(resolved);
    } catch (e) {
        if (files.existsSync(resolved)) return resolved;
        throw e;
    }
}

function resolveHelperScript(argv, appRoot) {
    const arg = (argv || []).find(function (a) { return typeof a === 'string' && a.indexOf(HELPER_FLAG) === 0; });
    if (!arg) return { requested: false, script: null, error: null };

    const requested = arg.slice(HELPER_FLAG.length);
    let script;
    let allowedRoot;
    try {
        script = resolveExisting(requested);
        allowedRoot = resolveExisting(path.join(appRoot, 'plugins'));
    } catch (e) {
        return { requested: true, script: null, error: 'helper script not found: ' + requested };
    }
    const prefix = allowedRoot.endsWith(path.sep) ? allowedRoot : allowedRoot + path.sep;
    if (script.indexOf(prefix) !== 0 || path.extname(script) !== '.js') {
        return { requested: true, script: null, error: 'helper script outside bundled plugins: ' + requested };
    }
    return { requested: true, script: script, error: null };
}

module.exports = {
    HELPER_FLAG: HELPER_FLAG,
    buildHelperArgs: buildHelperArgs,
    resolveExisting: resolveExisting,
    resolveHelperScript: resolveHelperScript
};
