const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ruffleOrigin = require('../../res/platform/ruffle-origin.js');
const sandboxFallback = require('../../res/platform/sandbox-fallback.js');
const studioProtocol = require('../../plugins/adventure-quest-worlds/processes/studio-protocol.js');

test('ruffle origin resolves files inside the player directory and rejects escapes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aquastar-ruffle-origin-'));
  fs.writeFileSync(path.join(root, 'ruffle.js'), 'player');
  assert.strictEqual(ruffleOrigin.resolveInside(root, '/ruffle.js'), path.join(root, 'ruffle.js'));
  assert.strictEqual(ruffleOrigin.resolveInside(root, '/../package.json'), null);
  assert.strictEqual(ruffleOrigin.resolveInside(root, '/%2e%2e/package.json'), null);
  assert.strictEqual(ruffleOrigin.scriptUrl(), 'aquastar://ruffle/ruffle.js');
  fs.rmSync(root, { recursive: true, force: true });
});

test('ruffle origin echoes only origins the caller allowed', () => {
  assert.strictEqual(ruffleOrigin.isAllowedOrigin('null'), true);
  assert.strictEqual(ruffleOrigin.isAllowedOrigin('https://account.aq.com'), false);
  ruffleOrigin.allowOrigins(['https://account.aq.com', 'null']);
  assert.strictEqual(ruffleOrigin.isAllowedOrigin('https://account.aq.com'), true);
  assert.strictEqual(ruffleOrigin.isAllowedOrigin('null'), true);
  assert.strictEqual(ruffleOrigin.isAllowedOrigin('https://evil.example'), false);
  assert.strictEqual(ruffleOrigin.isAllowedOrigin(''), false);
});

test('linux drops the sandbox only when user namespaces and the setuid helper are both missing', () => {
  assert.strictEqual(
    sandboxFallback.needsNoSandbox({ platform: 'linux', argv: [], userNamespaces: true, suidSandbox: false }),
    false
  );
  assert.strictEqual(
    sandboxFallback.needsNoSandbox({ platform: 'linux', argv: [], userNamespaces: false, suidSandbox: true }),
    false
  );
  assert.strictEqual(
    sandboxFallback.needsNoSandbox({
      platform: 'linux',
      argv: ['--no-sandbox'],
      userNamespaces: false,
      suidSandbox: false
    }),
    false
  );
  assert.strictEqual(
    sandboxFallback.needsNoSandbox({ platform: 'win32', argv: [], userNamespaces: false, suidSandbox: false }),
    false
  );
  assert.strictEqual(
    sandboxFallback.needsNoSandbox({ platform: 'linux', argv: [], userNamespaces: false, suidSandbox: false }),
    true
  );
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
  assert.strictEqual(pkg.build.linux.executableArgs, undefined);
});

test('studio https handler recognizes the local Artix SWF urls and other Artix hosts', () => {
  assert.ok(studioProtocol.LOCAL_SWF.test('https://game.aq.com/game/gamefiles/etc/chardetail/characterB.swf?v=2'));
  assert.ok(
    studioProtocol.LOCAL_SWF.test('https://game.aq.com/game/gamefiles/etc/chardetail/characterB-empty-scene.swf')
  );
  assert.strictEqual(studioProtocol.LOCAL_SWF.test('https://game.aq.com/game/gamefiles/Loader4.swf'), false);
  assert.strictEqual(studioProtocol.artixHost('https://account.aq.com/CharPage'), true);
  assert.strictEqual(studioProtocol.artixHost('https://example.com/swf'), false);
  const headers = studioProtocol.withArtixCors('https://game.aq.com/a.swf', { 'Content-Type': 'text/plain' });
  assert.strictEqual(headers.get('access-control-allow-origin'), '*');
  assert.strictEqual(headers.get('content-type'), 'text/plain');
});
