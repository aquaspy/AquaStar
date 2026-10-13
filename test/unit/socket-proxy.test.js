const assert = require('assert');
const fs = require('fs');
const net = require('net');
const path = require('path');
const WebSocket = require('ws');

const socketProxy = require('../../res/socketProxy.js');
const aqwRuffle = require('../../plugins/adventure-quest-worlds/ruffle.js');

test('relay host allowlist: exact hosts and *.suffix only, deny by default', () => {
  assert.strictEqual(socketProxy.isAllowedHost('sock8.aq.com'), false, 'deny all until a plugin declares hosts');
  socketProxy.allowHosts(['*.aq.com', '*.artix.com', 'localhost']);
  assert.strictEqual(socketProxy.isAllowedHost('sock8.aq.com'), true);
  assert.strictEqual(socketProxy.isAllowedHost('SOCK7.AQ.COM'), true);
  assert.strictEqual(socketProxy.isAllowedHost('euro.aqw.artix.com'), true);
  assert.strictEqual(socketProxy.isAllowedHost('aq.com'), true);
  assert.strictEqual(socketProxy.isAllowedHost('aq.com.evil.example'), false);
  assert.strictEqual(socketProxy.isAllowedHost('evilaq.com'), false);
  assert.strictEqual(socketProxy.isAllowedHost('192.168.0.1'), false);
  assert.strictEqual(socketProxy.isAllowedHost(''), false);
  assert.strictEqual(socketProxy.isAllowedHost(null), false);
});

test('the AQW plugin declares exactly the hosts its server list uses', () => {
  const allowed = aqwRuffle.socket.allowedHosts;
  Object.keys(aqwRuffle.socket.fallbackHosts).forEach(function (host) {
    const ok = allowed.some(function (p) {
      return p.indexOf('*.') === 0 ? host.endsWith('.' + p.slice(2)) : host === p;
    });
    assert.ok(ok, host + ' must be covered by allowedHosts');
  });
  assert.strictEqual(aqwRuffle.socket.policyPort, 843);
});

test('relay forwards to an allowed host and refuses everything else', async () => {
  socketProxy.allowHosts(['localhost']);

  const echo = net.createServer(function (socket) {
    socket.on('data', function (d) {
      socket.write(d);
    });
  });
  await new Promise(function (resolve) {
    echo.listen(0, '127.0.0.1', resolve);
  });
  const echoPort = echo.address().port;

  socketProxy.start();
  const open = function (query) {
    return new Promise(function (resolve) {
      const ws = new WebSocket(socketProxy.proxyUrl + '/?' + query);
      const result = { messages: [], closeCode: null };
      ws.on('open', function () {
        ws.send(Buffer.from('ping'));
      });
      ws.on('message', function (m) {
        result.messages.push(Buffer.from(m).toString());
        ws.close();
      });
      ws.on('close', function (code) {
        result.closeCode = code;
        resolve(result);
      });
      ws.on('error', function () {
        result.error = true;
        resolve(result);
      });
    });
  };

  try {
    const allowed = await open('host=localhost&port=' + echoPort);
    assert.deepStrictEqual(allowed.messages, ['ping'], 'allowed host is relayed');

    const refused = await open('host=example.org&port=80');
    assert.deepStrictEqual(refused.messages, []);
    assert.strictEqual(refused.closeCode, 1008, 'disallowed host is closed with policy violation');

    const missing = await open('host=localhost');
    assert.strictEqual(missing.closeCode, 1008, 'missing port is refused');
  } finally {
    socketProxy.stop();
    await new Promise(function (resolve) {
      echo.close(resolve);
    });
  }
});

test('ruffle wrapper takes sockets from the plugin config and names no game', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../res/ruffle_wrapper.html'), 'utf8');
  assert.ok(html.indexOf("params.get('cfg')") !== -1);
  assert.ok(html.indexOf('socketCfg.serversApi') !== -1);
  ['aq.com', 'artix', 'dragonfable', 'DFLoader', 'AQW'].forEach(function (name) {
    assert.strictEqual(html.toLowerCase().indexOf(name.toLowerCase()), -1, 'wrapper must not mention ' + name);
  });
  const proxySrc = fs.readFileSync(path.join(__dirname, '../../res/socketProxy.js'), 'utf8');
  assert.strictEqual(/aq\.com|artix\.com/i.test(proxySrc), false);
});
