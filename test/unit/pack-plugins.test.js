const assert = require('assert');
const path = require('path');

const packed = require('../../scripts/assert-packed-plugins.js');

const repoRoot = path.join(__dirname, '../..');
const distRoot = path.join(repoRoot, 'dist');

function assertFilesUnder(root, label) {
  const missing = packed.missingIn(root);
  assert.deepStrictEqual(missing, [], label + ' missing ' + missing.join(', '));
}

function listCandidateAppRoots() {
  return packed.findPackedRoots(distRoot);
}

test('asar listings from Windows and POSIX name the same packed file', () => {
  assert.strictEqual(
    packed.normalizeAsarPath('\\plugins\\adventure-quest-worlds\\plugin.json'),
    '/plugins/adventure-quest-worlds/plugin.json'
  );
  assert.strictEqual(packed.normalizeAsarPath('/res/ruffle/ruffle.js'), '/res/ruffle/ruffle.js');
});

test('source tree includes bundled AQW plugin files', () => {
  assertFilesUnder(repoRoot, 'source tree');
});

test('pack output includes bundled AQW plugin files when dist exists', () => {
  const requirePack = process.env.AQUASTAR_ASSERT_PACK === '1';
  const appRoots = listCandidateAppRoots();
  const packedRoots = appRoots.filter((root) => packed.missingIn(root).length === 0);

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
