const assert = require('assert');
const { launcherUserAgent } = require('../../plugins/adventure-quest-worlds/user-agent.js');
const session = require('../../plugins/adventure-quest-worlds/session.js');

const LAUNCHER_SENDS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36';

test('AquaStar UA is reduced to the exact UA Artix Game Launcher sends', () => {
  const raw =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'AquaStar/1.12.2 Chrome/87.0.4280.141 Electron/11.5.0 Safari/537.36';
  assert.strictEqual(launcherUserAgent(raw), LAUNCHER_SENDS);
});

test('launcher UA matches the original launcher regex result', () => {
  const raw =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'ArtixGameLauncher/2.2.0 Chrome/87.0.4280.141 Electron/11.5.0 Safari/537.36';
  assert.strictEqual(launcherUserAgent(raw), raw.replace(/Artix.*\s/, ''));
  assert.strictEqual(launcherUserAgent(raw), LAUNCHER_SENDS);
});

test('launcherUserAgent tolerates empty input', () => {
  assert.strictEqual(launcherUserAgent(''), '');
  assert.strictEqual(launcherUserAgent(undefined), '');
});

test('artix-ua rule derives the UA from the platform default UA (platform has no Artix policy)', () => {
  const rule = session.createSessionRules().filter(function (r) {
    return r.id === 'artix-ua';
  })[0];
  const raw =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'AquaStar/1.12.2 Chrome/87.0.4280.141 Electron/11.5.0 Safari/537.36';
  let out = null;
  rule.onBeforeSendHeaders({ requestHeaders: { 'User-Agent': raw } }, { defaultUserAgent: raw }, function (result) {
    out = result;
  });
  assert.strictEqual(out.requestHeaders['User-Agent'], LAUNCHER_SENDS);
  assert.strictEqual(out.requestHeaders.artixmode, 'launcher');
});

test('artix-ua rule leaves the UA alone when the platform gives none', () => {
  const rule = session.createSessionRules().filter(function (r) {
    return r.id === 'artix-ua';
  })[0];
  let out = null;
  rule.onBeforeSendHeaders({ requestHeaders: { 'User-Agent': 'keep-me' } }, {}, function (result) {
    out = result;
  });
  assert.strictEqual(out.requestHeaders['User-Agent'], 'keep-me');
  assert.strictEqual(out.requestHeaders.artixmode, 'launcher');
});
