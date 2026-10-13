const assert = require('assert');
const fs = require('fs');
const path = require('path');

const maker = require('../../scripts/make-locale-templates.js');

function flatten(value, prefix, out) {
  Object.keys(value).forEach(function (name) {
    const item = value[name];
    const key = prefix ? prefix + '.' + name : name;
    if (typeof item === 'function') out[key] = 'function';
    else if (Array.isArray(item)) out[key] = 'array:' + item.length;
    else if (item && typeof item === 'object') flatten(item, key, out);
    else out[key] = 'string';
  });
  return out;
}

test('every translator template has exactly the keys of its en-US catalog, all empty', () => {
  maker.targets().forEach(function (target) {
    assert.ok(fs.existsSync(target.out), 'missing template: ' + path.relative(process.cwd(), target.out));
    const catalog = flatten(maker.loadCatalog(target.catalog), '', {});
    const template = flatten(maker.loadCatalog(target.out), '', {});
    assert.deepStrictEqual(Object.keys(template).sort(), Object.keys(catalog).sort(),
      target.label + ': template keys drifted from the catalog (run scripts/make-locale-templates.js)');
    assert.deepStrictEqual(template, catalog, target.label + ': value kinds differ');

    // Text values are empty so translators cannot ship the English text by accident.
    (function checkEmpty(value) {
      Object.keys(value).forEach(function (name) {
        const item = value[name];
        if (typeof item === 'string') assert.strictEqual(item, '', target.label + ' ' + name);
        else if (Array.isArray(item)) item.forEach(function (x) { assert.strictEqual(x, ''); });
        else if (item && typeof item === 'object') checkEmpty(item);
      });
    })(maker.loadCatalog(target.out));
  });
});

test('a checked-in template equals what the generator would write today', () => {
  maker.targets().forEach(function (target) {
    const expected = maker.renderTemplate(maker.loadCatalog(target.catalog), target.label);
    assert.strictEqual(fs.readFileSync(target.out, 'utf8'), expected,
      target.label + ': template is stale (run scripts/make-locale-templates.js)');
  });
});

test('the platform template carries no plugin strings and vice versa', () => {
  const platformKeys = Object.keys(flatten(maker.loadCatalog(require.resolve('../../res/po/template.js')), '', {}));
  assert.ok(platformKeys.some(function (k) { return k.indexOf('titleMessages.recording') === 0; }));
  assert.ok(!platformKeys.some(function (k) { return /remindersMessages|todoMessages|charPageStudio|wikiMessages/.test(k); }));
  const aqwKeys = Object.keys(flatten(maker.loadCatalog(require.resolve('../../plugins/adventure-quest-worlds/locales/template.js')), '', {}));
  assert.ok(aqwKeys.some(function (k) { return k.indexOf('remindersMessages.') === 0; }));
  assert.ok(aqwKeys.some(function (k) { return k === 'charpageMessages.done'; }));
});
