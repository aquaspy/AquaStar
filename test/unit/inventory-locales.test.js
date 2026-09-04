const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('Inventory renderer only references translated message keys', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../res/features/inventory/inventory.html'), 'utf8');
  const keys = new Set(Array.from(html.matchAll(/messages\.([A-Za-z0-9_]+)/g), (match) => match[1]));
  ['pt-BR', 'en-US'].forEach((locale) => {
    const messages = require(path.join(__dirname, '../../res/po', locale + '.js')).inventoryMessages;
    const missing = Array.from(keys).filter((key) => !(key in messages));
    assert.deepStrictEqual(missing, [], locale + ' Inventory messages missing: ' + missing.join(', '));
  });
});

test('Inventory IPC normalizes local file URLs before authorizing its own preload', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../res/features/inventory/inventory.js'), 'utf8');
  assert.ok(source.includes('fileURLToPath') && source.includes('_isLocalPageSender'));
  assert.ok(source.includes('path.resolve(fileURLToPath(parsed)) === expectedPath'));
});
