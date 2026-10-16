const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { verifyStaging, RUNTIME_ENTRIES } = require('../../scripts/verify-staging.js');

test('release staging includes the auxiliary Char Page Studio processes', () => {
  const buildScript = fs.readFileSync(path.join(__dirname, '../../scripts/build-arch.sh'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8');
  const aqwMain = fs.readFileSync(path.join(__dirname, '../../plugins/adventure-quest-worlds/main.js'), 'utf8');
  const studioProcess = fs.readFileSync(
    path.join(__dirname, '../../plugins/adventure-quest-worlds/processes/charpage-studio-process.js'),
    'utf8'
  );
  const processesDir = path.join(__dirname, '../../plugins/adventure-quest-worlds/processes');

  // build-arch.sh stages by an explicit list. Every entry the app reads at runtime must be on it
  // (plugins/ was missing once: the release started, found no game plugin and exited).
  const staged = (buildScript.match(/cp -R \\\n([\s\S]*?)"\$WORKDIR\/"/) || [])[1] || '';
  ['Icon', 'res', 'plugins', 'main.js', 'package.json', 'node_modules'].forEach((entry) => {
    assert.ok(staged.indexOf('"${ROOT}/' + entry + '"') !== -1, 'release staging must copy ' + entry);
  });
  // linux.icon is build/icons. The app does not read that directory at runtime, but
  // electron-builder does, and a missing directory installs Icon/Icon.png as hicolor/0x0.
  assert.ok(
    staged.indexOf('"${ROOT}/build"') !== -1,
    'release staging must copy build so the hicolor icon set is packaged'
  );
  [16, 32, 48, 64, 128, 256, 512].forEach((size) => {
    const file = path.join(__dirname, '../../build/icons', size + 'x' + size + '.png');
    const buf = fs.readFileSync(file);
    assert.strictEqual(buf.readUInt32BE(16), size, file + ' width');
    assert.strictEqual(buf.readUInt32BE(20), size, file + ' height');
  });
  assert.ok(buildScript.indexOf('verify-staging.js') !== -1, 'release staging must verify what it staged');
  assert.ok(buildScript.indexOf('FlashPlayer/') !== -1);
  ['charpage-studio-process.js', 'charpage-studio-capture-process.js'].forEach((fileName) => {
    assert.ok(fs.existsSync(path.join(processesDir, fileName)), fileName + ' must exist under plugin processes');
  });
  // main.js only knows the generic helper entry point; the plugin names its own scripts.
  assert.ok(main.indexOf('res/platform/helper-process.js') !== -1);
  assert.strictEqual(main.indexOf('charpage'), -1);
  assert.ok(aqwMain.indexOf('processes/charpage-studio-process.js') !== -1);
  assert.ok(studioProcess.indexOf('charpage-studio-capture-process.js') !== -1);
});

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aquastar-staging-'));
}

test('verify-staging accepts the repository itself (the shape electron-builder --dir ships)', () => {
  assert.deepStrictEqual(verifyStaging(path.join(__dirname, '../..')), []);
});

test('verify-staging reports every runtime entry that is missing', () => {
  const dir = tmpDir();
  try {
    const problems = verifyStaging(dir);
    RUNTIME_ENTRIES.forEach((entry) => {
      assert.ok(problems.indexOf("missing '" + entry + "'") !== -1, 'must report ' + entry);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verify-staging fails a staged app that has no bundled game plugin (the release bug)', () => {
  const root = path.join(__dirname, '../..');
  const dir = tmpDir();
  try {
    // A staged folder as the old release built it: everything except plugins/ content.
    ['res', 'Icon'].forEach((name) => fs.cpSync(path.join(root, name), path.join(dir, name), { recursive: true }));
    fs.mkdirSync(path.join(dir, 'FlashPlayer'));
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.mkdirSync(path.join(dir, 'plugins'));
    fs.copyFileSync(path.join(root, 'main.js'), path.join(dir, 'main.js'));
    fs.copyFileSync(path.join(root, 'package.json'), path.join(dir, 'package.json'));

    const problems = verifyStaging(dir);
    assert.ok(
      problems.some((p) => p.indexOf('no bundled plugin can be discovered') !== -1),
      problems.join('; ')
    );
    assert.ok(
      problems.some((p) => p.indexOf('no bundled default plugin') !== -1),
      problems.join('; ')
    );

    // Copy the real plugin back in: the same folder now passes.
    fs.cpSync(path.join(root, 'plugins'), path.join(dir, 'plugins'), { recursive: true });
    assert.deepStrictEqual(verifyStaging(dir), []);

    // A default plugin whose entry file is gone is caught too.
    fs.rmSync(path.join(dir, 'plugins', 'adventure-quest-worlds', 'main.js'));
    assert.ok(verifyStaging(dir).some((p) => p.indexOf('default plugin main is missing') !== -1));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
