// Plugin manifest validation for AquaStar's CommonJS plugin loader (Electron 11).
// Keep this module Electron-free so Node unit tests can exercise it.

const KNOWN_PERMISSIONS = {
    'net-fetch': true,
    'web-request': true,
    'flash-trust': true,
    'inject-scripts': true,
    'persistent-store': true,
    'spawn-helper-process': true,
    'unsafe-renderer': true
};

const KNOWN_CAPABILITIES = {
    'game-launch': true,
    'session-rules': true,
    'navigation-hooks': true,
    'feature-windows': true,
    'menus': true,
    'keybinds': true,
    'locales': true,
    'web': true
};

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function isStringArray(value) {
    return Array.isArray(value) && value.every(function (item) {
        return typeof item === 'string';
    });
}

function parseSemver(version) {
    if (!isNonEmptyString(version)) return null;
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
    if (!match) return null;
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3])
    };
}

function compareSemver(a, b) {
    if (a.major !== b.major) return a.major < b.major ? -1 : 1;
    if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
    if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
    return 0;
}

function hasPathEscape(relativePath) {
    if (!isNonEmptyString(relativePath)) return true;
    if (pathIsAbsolute(relativePath)) return true;
    const parts = relativePath.replace(/\\/g, '/').split('/');
    return parts.indexOf('..') !== -1;
}

function pathIsAbsolute(value) {
    if (typeof value !== 'string' || value.length === 0) return false;
    if (value[0] === '/' || value[0] === '\\') return true;
    return /^[A-Za-z]:[\\/]/.test(value);
}

/**
 * Validate a plugin.json object.
 * @param {object} manifest
 * @param {{ appVersion?: string }} [opts]
 * @returns {{ ok: true, manifest: object } | { ok: false, errors: string[] }}
 */
function validateManifest(manifest, opts) {
    const errors = [];
    opts = opts || {};

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        return { ok: false, errors: ['Manifest must be a JSON object.'] };
    }

    if (!isNonEmptyString(manifest.id) || !ID_RE.test(manifest.id)) {
        errors.push('id must match ^[a-z0-9]+(?:-[a-z0-9]+)*$');
    }
    if (!isNonEmptyString(manifest.name)) {
        errors.push('name is required');
    }
    if (!isNonEmptyString(manifest.version)) {
        errors.push('version is required');
    }
    if (manifest.apiVersion !== 1) {
        errors.push('apiVersion must be 1');
    }
    if (!isNonEmptyString(manifest.main) || hasPathEscape(manifest.main)) {
        errors.push('main must be a relative path without ".."');
    }
    if (!isNonEmptyString(manifest.minAppVersion)) {
        errors.push('minAppVersion is required');
    } else {
        const needed = parseSemver(manifest.minAppVersion);
        if (!needed) {
            errors.push('minAppVersion must be a semver-like string (e.g. 1.12.2)');
        } else if (opts.appVersion) {
            const have = parseSemver(opts.appVersion);
            if (!have) {
                errors.push('appVersion is not a valid semver-like string');
            } else if (compareSemver(have, needed) < 0) {
                errors.push(
                    'minAppVersion ' + manifest.minAppVersion +
                    ' requires a newer AquaStar (have ' + opts.appVersion + ')'
                );
            }
        }
    }

    if (manifest.permissions != null) {
        if (!isStringArray(manifest.permissions)) {
            errors.push('permissions must be an array of strings');
        } else {
            manifest.permissions.forEach(function (perm) {
                if (!KNOWN_PERMISSIONS[perm]) {
                    errors.push('Unknown permission: ' + perm);
                }
            });
        }
    }

    if (manifest.capabilities != null) {
        if (!isStringArray(manifest.capabilities)) {
            errors.push('capabilities must be an array of strings');
        } else {
            manifest.capabilities.forEach(function (cap) {
                if (!KNOWN_CAPABILITIES[cap]) {
                    errors.push('Unknown capability: ' + cap);
                }
            });
        }
    }

    const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
    const needsFetchAllowlist = permissions.indexOf('net-fetch') !== -1;
    const needsInjectPatterns = permissions.indexOf('inject-scripts') !== -1;

    if (needsFetchAllowlist) {
        if (!isStringArray(manifest.fetchAllowlist) || manifest.fetchAllowlist.length === 0) {
            errors.push('fetchAllowlist is required when permission net-fetch is present');
        }
    } else if (manifest.fetchAllowlist != null && !isStringArray(manifest.fetchAllowlist)) {
        errors.push('fetchAllowlist must be an array of strings');
    }

    if (needsInjectPatterns) {
        if (!isStringArray(manifest.injectHostPatterns) || manifest.injectHostPatterns.length === 0) {
            errors.push('injectHostPatterns is required when permission inject-scripts is present');
        }
    } else if (manifest.injectHostPatterns != null && !isStringArray(manifest.injectHostPatterns)) {
        errors.push('injectHostPatterns must be an array of strings');
    }

    if (manifest.web != null) {
        if (typeof manifest.web !== 'object' || Array.isArray(manifest.web)) {
            errors.push('web must be an object');
        } else if (manifest.web.contribute != null &&
            (!isNonEmptyString(manifest.web.contribute) || hasPathEscape(manifest.web.contribute))) {
            errors.push('web.contribute must be a relative path without ".."');
        }
    }

    if (errors.length) return { ok: false, errors: errors };
    return { ok: true, manifest: manifest };
}

module.exports = {
    KNOWN_PERMISSIONS: KNOWN_PERMISSIONS,
    KNOWN_CAPABILITIES: KNOWN_CAPABILITIES,
    validateManifest: validateManifest,
    parseSemver: parseSemver,
    compareSemver: compareSemver,
    hasPathEscape: hasPathEscape
};
