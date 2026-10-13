const assert = require('assert');

const urls = require('../../plugins/adventure-quest-worlds/urls.js');
const config = require('../../plugins/adventure-quest-worlds/launcher-config.js');

// Same shape as https://www.artix.com/scripts/AppLaunch.js (trimmed).
const APP_LAUNCH_JS = [
  'var version = 103;',
  'var launcherVersion = 220;',
  '',
  'var gameWindows =',
  '{',
  '    aqw: { url:"https://game.aq.com/game/gamefiles/Loader4.swf?ver=b", size:"top=100,left=15,width=960,height=580" },',
  '\taqwcreate: { url:"https://www.aq.com/landing/", size:"top=160,left=30,width=960,height=580" },',
  '    //df: { url:"https://play.dragonfable.com/game/DFLoader.swf?ver=2", size:"top=150" },',
  '\tdf: { url:"https://play.dragonfable.com/game/verly.asp", size:"top=150" },',
  '    ebil: { url:"http://www.ebilgames.com", size:"top=270" }',
  '};',
  '',
  'var neverParsed = { aqw: { url:"https://evil.example/Loader4.swf" } };'
].join('\n');

const PAGE_HTML = '<html><head>' +
  '<script src="//ajax.googleapis.com/ajax/libs/jquery/2.2.0/jquery.min.js"></script>' +
  '<script src="/scripts/AppLaunch.js?version=220L5"></script></head></html>';

function freshUrls() {
  urls.resetLoaderUrl();
  return urls;
}

test('parseGameWindows reads the literal as text, skips comments, stops at the end', () => {
  const windows = config.parseGameWindows(APP_LAUNCH_JS);
  assert.strictEqual(windows.aqw, 'https://game.aq.com/game/gamefiles/Loader4.swf?ver=b');
  assert.strictEqual(windows.df, 'https://play.dragonfable.com/game/verly.asp');
  assert.strictEqual(windows.neverParsed, undefined);
  assert.deepStrictEqual(config.parseGameWindows('no literal here'), {});
  assert.deepStrictEqual(config.parseGameWindows(null), {});
});

test('extractScriptUrl only trusts AppLaunch.js served from www.artix.com over https', () => {
  assert.strictEqual(config.extractScriptUrl(PAGE_HTML),
    'https://www.artix.com/scripts/AppLaunch.js?version=220L5');
  assert.strictEqual(config.extractScriptUrl('<script src="https://evil.example/AppLaunch.js"></script>'), null);
  assert.strictEqual(config.extractScriptUrl('<script src="http://www.artix.com/scripts/AppLaunch.js"></script>'), null);
  assert.strictEqual(config.extractScriptUrl('<html>no scripts</html>'), null);
  assert.strictEqual(config.extractScriptUrl(undefined), null);
});

test('loader URL validation only accepts game.aq.com gamefiles Loader*.swf', () => {
  assert.strictEqual(urls.isValidLoaderUrl('https://game.aq.com/game/gamefiles/Loader4.swf?ver=b'), true);
  assert.strictEqual(urls.isValidLoaderUrl('https://game.aq.com/game/gamefiles/Loader5.swf'), true);
  [
    'http://game.aq.com/game/gamefiles/Loader4.swf',
    'https://evil.example/game/gamefiles/Loader4.swf',
    'https://game.aq.com.evil.example/game/gamefiles/Loader4.swf',
    'https://game.aq.com/game/gamefiles/../Loader4.swf',
    'https://game.aq.com/game/gamefiles/Game.swf',
    'https://game.aq.com/game/gamefiles/Loader4.swf?ver=<script>',
    'javascript:alert(1)',
    '',
    null
  ].forEach(function (bad) {
    assert.strictEqual(urls.isValidLoaderUrl(bad), false, 'must reject ' + bad);
  });
});

test('urls: setLoaderUrl rejects junk and loaderUrl falls back to the built-in default', () => {
  freshUrls();
  assert.strictEqual(urls.loaderUrl(), urls.URLS.loader4);
  assert.strictEqual(urls.setLoaderUrl('https://evil.example/Loader4.swf'), false);
  assert.strictEqual(urls.loaderUrl(), urls.URLS.loader4);
  assert.strictEqual(urls.setLoaderUrl('https://game.aq.com/game/gamefiles/Loader7.swf?ver=q'), true);
  assert.strictEqual(urls.loaderUrl(), 'https://game.aq.com/game/gamefiles/Loader7.swf?ver=q');
  // Any numbered loader still counts as the game (older windows, customUrl pointing at one).
  assert.strictEqual(urls.isLoaderUrl('https://game.aq.com/game/gamefiles/Loader3.swf?ver=a'), true);
  assert.strictEqual(urls.isLoaderUrl('https://game.aq.com/game/gamefiles/Game4000r2.swf'), false);
  freshUrls();
});

function fakeDeps(responses, initialCache, clock) {
  const writes = [];
  let cache = initialCache || null;
  return {
    writes: writes,
    calls: [],
    deps: {
      fetchText: function (url) {
        this.calls.push(url);
        const r = responses[url];
        return Promise.resolve(r || { ok: false, error: 'no fake for ' + url });
      },
      store: {
        read: function () { return cache; },
        write: function (v) { cache = v; writes.push(v); }
      },
      urls: urls,
      now: function () { return clock.t; },
      log: function () {}
    }
  };
}

test('refresh reads the launcher page, applies and caches the aqw loader', async () => {
  freshUrls();
  const clock = { t: 1000 };
  const f = fakeDeps({}, null, clock);
  const calls = [];
  f.deps.fetchText = function (url) {
    calls.push(url);
    if (url === config.PAGE_URL) return Promise.resolve({ ok: true, html: PAGE_HTML });
    if (url === 'https://www.artix.com/scripts/AppLaunch.js?version=220L5') {
      return Promise.resolve({ ok: true, html: APP_LAUNCH_JS.replace('Loader4.swf?ver=b', 'Loader9.swf?ver=z') });
    }
    return Promise.resolve({ ok: false, error: 'unexpected ' + url });
  };
  const launcher = config.createLauncherConfig(f.deps);
  const result = await launcher.refresh();

  assert.deepStrictEqual(calls, [config.PAGE_URL, 'https://www.artix.com/scripts/AppLaunch.js?version=220L5']);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.changed, true);
  assert.strictEqual(urls.loaderUrl(), 'https://game.aq.com/game/gamefiles/Loader9.swf?ver=z');
  assert.strictEqual(f.writes.length, 1);
  assert.strictEqual(f.writes[0].loaderUrl, 'https://game.aq.com/game/gamefiles/Loader9.swf?ver=z');
  assert.strictEqual(f.writes[0].checkedAt, 1000);
  freshUrls();
});

test('refresh keeps the built-in loader when the page is unreachable, malformed or hostile', async () => {
  const clock = { t: 1 };
  const scenarios = [
    { name: 'page down', page: { ok: false, error: 'timeout' }, script: null },
    { name: 'no script tag', page: { ok: true, html: '<html></html>' }, script: null },
    { name: 'script down', page: { ok: true, html: PAGE_HTML }, script: { ok: false, error: 'http-500' } },
    {
      name: 'hostile aqw url',
      page: { ok: true, html: PAGE_HTML },
      script: { ok: true, html: 'var gameWindows =\n{\n aqw: { url:"https://evil.example/game/gamefiles/Loader4.swf" }\n};' }
    },
    { name: 'no aqw entry', page: { ok: true, html: PAGE_HTML }, script: { ok: true, html: 'var gameWindows =\n{\n};' } }
  ];
  for (const sc of scenarios) {
    freshUrls();
    const f = fakeDeps({}, null, clock);
    f.deps.fetchText = function (url) {
      return Promise.resolve(url === config.PAGE_URL ? sc.page : sc.script);
    };
    const result = await config.createLauncherConfig(f.deps).refresh();
    assert.strictEqual(result.ok, false, sc.name);
    assert.strictEqual(urls.loaderUrl(), urls.URLS.loader4, sc.name + ': default kept');
    assert.strictEqual(f.writes.length, 0, sc.name + ': nothing cached');
  }
  freshUrls();
});

test('cache: applyCached is synchronous; stale or corrupt entries are not trusted', () => {
  freshUrls();
  const clock = { t: 10 * 60 * 60 * 1000 };
  const good = { loaderUrl: 'https://game.aq.com/game/gamefiles/Loader8.swf?ver=c', checkedAt: clock.t - 1000 };
  const launcher = config.createLauncherConfig(fakeDeps({}, good, clock).deps);
  assert.ok(launcher.applyCached());
  assert.strictEqual(urls.loaderUrl(), good.loaderUrl);
  assert.strictEqual(launcher.isCacheFresh(), true);

  freshUrls();
  const stale = { loaderUrl: good.loaderUrl, checkedAt: clock.t - config.CACHE_TTL_MS - 1 };
  const staleLauncher = config.createLauncherConfig(fakeDeps({}, stale, clock).deps);
  assert.ok(staleLauncher.applyCached(), 'a stale value is still better than nothing');
  assert.strictEqual(staleLauncher.isCacheFresh(), false);

  freshUrls();
  const corrupt = config.createLauncherConfig(
    fakeDeps({}, { loaderUrl: 'https://evil.example/Loader4.swf', checkedAt: clock.t }, clock).deps);
  assert.strictEqual(corrupt.applyCached(), null);
  assert.strictEqual(urls.loaderUrl(), urls.URLS.loader4);
  freshUrls();
});

test('AQW manifest allows exactly the Artix launcher page and scripts for live loader lookups', () => {
  const manifest = require('../../plugins/adventure-quest-worlds/plugin.json');
  assert.ok(manifest.permissions.indexOf('net-fetch') !== -1);
  assert.ok(manifest.fetchAllowlist.indexOf('https://www.artix.com/gamelauncher') !== -1);
  assert.ok(manifest.fetchAllowlist.indexOf('https://www.artix.com/scripts/*') !== -1);
  assert.strictEqual(manifest.fetchAllowlist.some(function (u) { return u === 'https://www.artix.com/*'; }), false);
});
