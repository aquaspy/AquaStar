const assert = require('assert');

const { applySessionRules, matchesPattern } = require('../../res/platform/session-rules.js');
const {
  createPlatformSessionRules,
  BLOCKED_HOST_PATTERNS,
  AD_HOSTS,
  blockedHostPatterns
} = require('../../res/platform/platform-rules.js');

function fakeSession() {
  const registered = { headers: [], request: [] };
  return {
    registered: registered,
    webRequest: {
      onBeforeSendHeaders: function (filter, listener) {
        registered.headers.push({ filter: filter, listener: listener });
      },
      onBeforeRequest: function (filter, listener) {
        registered.request.push({ filter: filter, listener: listener });
      }
    }
  };
}

test('ad patterns are the shared host list, one wildcard pattern each', () => {
  assert.ok(AD_HOSTS.indexOf('nitropay.com') !== -1);
  assert.ok(AD_HOSTS.indexOf('doubleclick.net') !== -1);
  assert.deepStrictEqual(BLOCKED_HOST_PATTERNS, blockedHostPatterns(AD_HOSTS));
  assert.strictEqual(BLOCKED_HOST_PATTERNS.length, AD_HOSTS.length);
});

test('matchesPattern follows Chrome match-pattern rules for the subset rules use', () => {
  assert.strictEqual(matchesPattern('*://*.aq.com/*', 'https://game.aq.com/game/x.swf'), true);
  assert.strictEqual(matchesPattern('*://*.aq.com/*', 'http://aq.com/'), true);
  assert.strictEqual(matchesPattern('*://*.aq.com/*', 'https://notaq.com/x'), false);
  assert.strictEqual(matchesPattern('*://*.aq.com/*', 'https://aq.com.evil.example/x'), false);
  assert.strictEqual(matchesPattern('*://game.aq.com/game/*', 'https://game.aq.com/game/a/b'), true);
  assert.strictEqual(matchesPattern('*://game.aq.com/game/*', 'https://game.aq.com/other'), false);
  assert.strictEqual(matchesPattern('https://api.github.com/*', 'http://api.github.com/x'), false);
  assert.strictEqual(matchesPattern('https://api.github.com/*', 'https://api.github.com:8443/x'), true);
  assert.strictEqual(matchesPattern('*://*/*', 'file:///C:/x.html'), false);
  assert.strictEqual(matchesPattern('<all_urls>', 'https://anything.example/'), true);
  assert.strictEqual(matchesPattern('garbage', 'https://x.example/'), false);
});

test('one listener per webRequest event: rules cannot replace each other (ad block + swf log)', () => {
  const session = fakeSession();
  const logged = [];
  const rules = createPlatformSessionRules().concat([
    {
      id: 'swf-log',
      urls: ['*://game.aq.com/game/*'],
      onBeforeRequest: function (details, ctx, callback) {
        ctx.logLine(details.url);
        callback({ cancel: false });
      }
    }
  ]);
  applySessionRules(session, rules, {
    logLine: function (l) {
      logged.push(l);
    }
  });

  // Both rules hook onBeforeRequest, yet Electron sees exactly one registration.
  assert.strictEqual(session.registered.request.length, 1);
  const listener = session.registered.request[0].listener;
  assert.ok(session.registered.request[0].filter.urls.indexOf('*://game.aq.com/game/*') !== -1);
  BLOCKED_HOST_PATTERNS.forEach(function (p) {
    assert.ok(session.registered.request[0].filter.urls.indexOf(p) !== -1);
  });

  let result = null;
  listener({ url: 'https://pagead2.doubleclick.net/ad.js' }, function (r) {
    result = r;
  });
  assert.deepStrictEqual(result, { cancel: true }, 'ad host still blocked while swf log is on');

  listener({ url: 'https://s.nitropay.com/ads-143.js' }, function (r) {
    result = r;
  });
  assert.deepStrictEqual(result, { cancel: true }, 'NitroPay exchange host is blocked');

  listener({ url: 'https://translate.googleapis.com/translate_a/element.js' }, function (r) {
    result = r;
  });
  assert.deepStrictEqual(result, { cancel: true }, 'translate.googleapis.com is blocked');

  listener({ url: 'https://www.aq.com/' }, function (r) {
    result = r;
  });
  assert.deepStrictEqual(result, { cancel: false }, 'game host is not an ad host');
  assert.deepStrictEqual(logged, [], 'ad host is not a game request');

  listener({ url: 'https://game.aq.com/game/gamefiles/Loader4.swf' }, function (r) {
    result = r;
  });
  assert.deepStrictEqual(result, { cancel: false });
  assert.deepStrictEqual(logged, ['https://game.aq.com/game/gamefiles/Loader4.swf']);

  listener({ url: 'https://www.example.org/' }, function (r) {
    result = r;
  });
  assert.deepStrictEqual(result, { cancel: false }, 'unmatched URLs pass through');
});

test('header rules chain in order and a later rule sees earlier changes', () => {
  const session = fakeSession();
  applySessionRules(
    session,
    [
      {
        id: 'first',
        urls: ['*://*.aq.com/*'],
        onBeforeSendHeaders: function (d, ctx, cb) {
          d.requestHeaders['X-A'] = '1';
          cb({ requestHeaders: d.requestHeaders });
        }
      },
      {
        id: 'second',
        urls: ['*://game.aq.com/*'],
        onBeforeSendHeaders: function (d, ctx, cb) {
          d.requestHeaders['X-B'] = d.requestHeaders['X-A'] + '2';
          cb({ requestHeaders: d.requestHeaders });
        }
      },
      {
        id: 'elsewhere',
        urls: ['*://other.example/*'],
        onBeforeSendHeaders: function (d, ctx, cb) {
          d.requestHeaders['X-C'] = 'no';
          cb({ requestHeaders: d.requestHeaders });
        }
      }
    ],
    {}
  );
  assert.strictEqual(session.registered.headers.length, 1);

  let out = null;
  session.registered.headers[0].listener({ url: 'https://game.aq.com/x', requestHeaders: {} }, function (r) {
    out = r;
  });
  assert.deepStrictEqual(out.requestHeaders, { 'X-A': '1', 'X-B': '12' });
});

test('rules disabled by enabledWhen are never registered', () => {
  const session = fakeSession();
  applySessionRules(
    session,
    [
      {
        id: 'off',
        urls: ['*://x.example/*'],
        enabledWhen: function (settings) {
          return !!settings.on;
        },
        onBeforeRequest: function (d, c, cb) {
          cb({ cancel: true });
        }
      }
    ],
    { settings: { on: false } }
  );
  assert.strictEqual(session.registered.request.length, 0);
  assert.strictEqual(session.registered.headers.length, 0);
});

test('a redirect or cancel from any rule is final', () => {
  const session = fakeSession();
  const seen = [];
  applySessionRules(
    session,
    [
      {
        id: 'redir',
        urls: ['*://x.example/*'],
        onBeforeRequest: function (d, c, cb) {
          seen.push('redir');
          cb({ redirectURL: 'https://y.example/' });
        }
      },
      {
        id: 'after',
        urls: ['*://x.example/*'],
        onBeforeRequest: function (d, c, cb) {
          seen.push('after');
          cb({ cancel: false });
        }
      }
    ],
    {}
  );
  let out = null;
  session.registered.request[0].listener({ url: 'https://x.example/a' }, function (r) {
    out = r;
  });
  assert.deepStrictEqual(out, { redirectURL: 'https://y.example/' });
  assert.deepStrictEqual(seen, ['redir']);
});
