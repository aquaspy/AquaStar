const assert = require('assert');
const path = require('path');

const urls = require('../../plugins/adventure-quest-worlds/urls.js');
const session = require('../../plugins/adventure-quest-worlds/session.js');
const { applySessionRules } = require('../../res/platform/session-rules.js');

test('AQW url catalog exposes loader, DF, and testing helpers', () => {
  assert.ok(urls.URLS.loader3.indexOf('Loader3.swf') !== -1);
  assert.ok(urls.URLS.dfLoader.indexOf('dragonfable.com') !== -1);
  const testing = urls.testingAQW();
  assert.ok(urls.isTestingAqwUrl(testing));
  assert.ok(urls.buildCharLookupUrl('Hero').indexOf('id=Hero') !== -1);
});

test('AQW session rules use Electron callback shapes', () => {
  const rules = session.createSessionRules();
  const artix = rules.filter(function (r) { return r.id === 'artix-ua'; })[0];
  const swf = rules.filter(function (r) { return r.id === 'swf-log'; })[0];
  assert.ok(artix && typeof artix.onBeforeSendHeaders === 'function');
  assert.ok(swf && typeof swf.onBeforeRequest === 'function');
  assert.strictEqual(swf.enabledWhen({ swfLog: true }), true);
  assert.strictEqual(swf.enabledWhen({ swfLog: false }), false);

  let headersOut = null;
  artix.onBeforeSendHeaders(
    { requestHeaders: {} },
    { spoofedUA: 'UA-TEST' },
    function (result) { headersOut = result; }
  );
  assert.strictEqual(headersOut.requestHeaders['User-Agent'], 'UA-TEST');
  assert.strictEqual(headersOut.requestHeaders.artixmode, 'launcher');

  let cancelOut = null;
  const logged = [];
  swf.onBeforeRequest(
    { url: 'https://game.aq.com/game/x.swf' },
    { logLine: function (u) { logged.push(u); } },
    function (result) { cancelOut = result; }
  );
  assert.deepStrictEqual(cancelOut, { cancel: false });
  assert.deepStrictEqual(logged, ['https://game.aq.com/game/x.swf']);
});

test('applySessionRules registers matching Electron webRequest handlers', () => {
  const calls = [];
  const fakeSession = {
    webRequest: {
      onBeforeSendHeaders: function (filter, listener) {
        calls.push({ type: 'headers', filter: filter, listener: listener });
      },
      onBeforeRequest: function (filter, listener) {
        calls.push({ type: 'request', filter: filter, listener: listener });
      }
    }
  };
  applySessionRules(fakeSession, session.createSessionRules(), {
    spoofedUA: 'x',
    settings: { swfLog: true },
    logLine: function () {}
  });
  assert.ok(calls.some(function (c) { return c.type === 'headers'; }));
  assert.ok(calls.some(function (c) { return c.type === 'request'; }));
});

test('flashTrustUrlList includes primary and known game hosts', () => {
  const list = session.flashTrustUrlList('file:///custom.swf');
  assert.ok(list.indexOf('file:///custom.swf') !== -1);
  assert.ok(list.indexOf(urls.URLS.loader3) !== -1);
  assert.ok(list.indexOf(urls.URLS.dfLoader) !== -1);
});
