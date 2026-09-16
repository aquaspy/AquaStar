const assert = require('assert');
const path = require('path');

const { createNavigationHooks } = require('../../plugins/adventure-quest-worlds/injections/navigation.js');

test('AQW navigation classify maps wiki, charpage, and account URLs', () => {
  const hooks = createNavigationHooks({
    featuresRoot: path.join(__dirname, '../../res/features')
  });
  assert.strictEqual(hooks.classify('https://aqwwiki.wikidot.com/sword'), 'wiki');
  assert.strictEqual(hooks.classify('https://account.aq.com/CharPage?id=Hero'), 'charpage');
  assert.strictEqual(
    hooks.classify('https://account.aq.com/AQW/Inventory'),
    'account-aqw'
  );
  assert.strictEqual(hooks.classify('https://account.aq.com/Home'), 'account');
  assert.strictEqual(hooks.classify('https://account.aq.com/Login'), 'account-login');
  assert.strictEqual(hooks.classify('https://www.aq.com/'), 'aq-home');
  assert.strictEqual(hooks.classify('https://example.com/'), 'other');
});

test('AQW navigation onDidFinishLoad injects WikiView for wiki pages', async () => {
  const hooks = createNavigationHooks({
    featuresRoot: path.join(__dirname, '../../res/features')
  });
  const scripts = [];
  await hooks.onDidFinishLoad({
    url: 'https://aqwwiki.wikidot.com/armor',
    isGameWindow: false,
    executeJavaScriptSafely: function (source, label) {
      scripts.push({ source: source, label: label });
      if (label === 'Page cleanup check') return Promise.resolve(false);
      if (label === 'Wiki enhancement') return Promise.resolve(true);
      return Promise.resolve(null);
    }
  });
  assert.ok(scripts.some(function (s) { return s.label === 'Wiki enhancement'; }));
  assert.ok(scripts.some(function (s) {
    return s.label === 'Wiki enhancement' && s.source.indexOf('jquery') !== -1;
  }) || scripts.some(function (s) {
    return s.source.indexOf('__aquastarWikiViewInjected') !== -1;
  }));
});
