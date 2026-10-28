// Check that a staged app folder (what the release workflow hands to electron-builder, or
// what ends up in resources/app) can actually start: everything main.js reads at runtime is
// there and at least one bundled game plugin can be discovered from it.
//
// Usage: node scripts/verify-staging.js [stagedDir]      (defaults to the repository root)
//
// A release once shipped without plugins/ because the staging list in build-arch.sh is kept
// by hand: the app started, found no plugin and exited. build-arch.sh now runs this check, and
// so does the test suite, so a missing piece fails the build instead of reaching users.

const fs = require('fs');
const path = require('path');

// What the app reads at runtime, relative to its root.
const RUNTIME_ENTRIES = ['main.js', 'package.json', 'res', 'Icon', 'plugins', 'node_modules'];

/** @returns {string[]} problems; empty means the folder can start */
function verifyStaging(root) {
  const problems = [];
  RUNTIME_ENTRIES.forEach(function (entry) {
    if (!fs.existsSync(path.join(root, entry))) problems.push("missing '" + entry + "'");
  });
  if (problems.length) return problems;

  // Discover plugins with the staged copy of the platform, exactly as main.js will.
  let platform;
  let appVersion;
  try {
    platform = require(path.join(root, 'res', 'platform'));
    appVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  } catch (e) {
    return ["could not load the staged platform: " + e.message];
  }
  const discovered = platform.discoverPlugins({
    bundledDir: path.join(root, 'plugins'),
    enableLocalPlugins: false,
    appVersion: appVersion
  });
  discovered.errors.forEach(function (err) { problems.push('plugin discovery: ' + err); });

  const bundled = discovered.plugins.filter(function (p) { return p.source === 'bundled'; });
  if (!bundled.length) problems.push('no bundled plugin can be discovered (the app would open nothing)');
  const chosen = platform.pickBundledDefault(discovered.plugins);
  if (!chosen) {
    problems.push('no bundled default plugin (a plugin.json with "bundledDefault": true)');
  } else if (!fs.existsSync(path.join(chosen.root, chosen.manifest.main))) {
    problems.push('default plugin main is missing: ' + chosen.manifest.main);
  }
  return problems;
}

if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
  const problems = verifyStaging(root);
  if (problems.length) {
    console.error('Staging check failed for ' + root + ':\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('Staging check passed for ' + root);
}

module.exports = { verifyStaging: verifyStaging, RUNTIME_ENTRIES: RUNTIME_ENTRIES };
