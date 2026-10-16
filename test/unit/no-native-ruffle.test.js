const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const skipDirs = new Set(['.git', 'node_modules', 'lite', 'dist', 'work', 'web-dist', 'squashfs-root', 'res/ruffle']);
const allowed = {
  'res/platform/settings-merge.js': new Set(['ruffle-native']),
  'test/unit/settings-merge.test.js': new Set(['ruffle-native', 'ruffleGraphics'])
};
const needles = [
  'ruffle-native',
  'ruffleNative',
  'ruffle_native',
  'nativeWindowCapture',
  'fetch-ruffle-native',
  'ruffleNativeBundle',
  'RuffleNative',
  'ruffleGraphics',
  'nativeCapture'
];

function walk(dir, hits) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    const rel = path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name) || skipDirs.has(rel)) return;
      walk(path.join(dir, entry.name), hits);
      return;
    }
    if (rel === 'test/unit/no-native-ruffle.test.js') return;
    const text = fs.readFileSync(path.join(dir, entry.name), 'utf8');
    const permit = allowed[rel] || new Set();
    needles.forEach(function (needle) {
      if (permit.has(needle)) return;
      if (text.indexOf(needle) !== -1) hits.push(rel + ' still contains ' + needle);
    });
  });
}

test('the Electron app no longer ships a native Ruffle mode', () => {
  const hits = [];
  walk(root, hits);
  assert.deepStrictEqual(hits, []);
});
