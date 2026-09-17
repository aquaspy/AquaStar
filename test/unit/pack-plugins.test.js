const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '../..');
const distRoot = path.join(repoRoot, 'dist');

const REQUIRED_REL = [
  'plugins/adventure-quest-worlds/plugin.json',
  'plugins/adventure-quest-worlds/main.js',
  'plugins/adventure-quest-worlds/features/reminders/reminders.js',
  'plugins/adventure-quest-worlds/processes/charpage-studio-process.js'
];

function assertFilesUnder(root, label) {
  REQUIRED_REL.forEach((rel) => {
    const full = path.join(root, rel);
    assert.ok(fs.existsSync(full), label + ' missing ' + rel);
  });
}

/** Common electron-builder --dir app roots (asar: false → resources/app). */
function listCandidateAppRoots() {
  if (!fs.existsSync(distRoot)) {
    return [];
  }
  const roots = [];
  const pushIfApp = (candidate) => {
    if (
      fs.existsSync(candidate) &&
      (fs.existsSync(path.join(candidate, 'main.js')) ||
        fs.existsSync(path.join(candidate, 'package.json')))
    ) {
      roots.push(candidate);
    }
  };

  [
    'win-unpacked/resources/app',
    'win-ia32-unpacked/resources/app',
    'linux-unpacked/resources/app',
    'linux-arm64-unpacked/resources/app',
    'mac/AquaStar.app/Contents/Resources/app',
    'mac-arm64/AquaStar.app/Contents/Resources/app'
  ].forEach((rel) => pushIfApp(path.join(distRoot, rel)));

  // Also pick up any other *-unpacked/resources/app layout.
  fs.readdirSync(distRoot, { withFileTypes: true }).forEach((ent) => {
    if (!ent.isDirectory()) {
      return;
    }
    pushIfApp(path.join(distRoot, ent.name, 'resources', 'app'));
    const macApp = path.join(distRoot, ent.name, 'AquaStar.app', 'Contents', 'Resources', 'app');
    pushIfApp(macApp);
  });

  return roots.filter((root, i, all) => all.indexOf(root) === i);
}

test('source tree includes bundled AQW plugin files', () => {
  assertFilesUnder(repoRoot, 'source tree');
});

test('pack output includes bundled AQW plugin files when dist exists', () => {
  const requirePack = process.env.AQUASTAR_ASSERT_PACK === '1';
  const appRoots = listCandidateAppRoots();
  const packedRoots = appRoots.filter((root) =>
    fs.existsSync(path.join(root, 'plugins/adventure-quest-worlds/plugin.json'))
  );

  if (packedRoots.length === 0) {
    if (requirePack) {
      assert.fail(
        'AQUASTAR_ASSERT_PACK=1 but plugins/adventure-quest-worlds/plugin.json not found under dist/**/resources/app'
      );
    }
    console.log(
      '  (skip pack assert: no packed AQW plugin under dist/; pack is expensive — CI asserts after npm run pack)'
    );
    return;
  }

  packedRoots.forEach((root) => {
    assertFilesUnder(root, 'pack ' + path.relative(distRoot, root));
  });
});
