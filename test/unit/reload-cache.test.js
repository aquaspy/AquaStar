const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('clear cache drops the HTTP cache and leaves settings, cookies, and Ruffle localStorage', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../res/keybindings.js'), 'utf8');
  const block = src.slice(
    src.indexOf('const CACHE_STORAGES'),
    src.indexOf('];', src.indexOf('const CACHE_STORAGES')) + 2
  );
  assert.ok(block.indexOf('shadercache') !== -1);
  assert.ok(block.indexOf('cachestorage') !== -1);
  assert.ok(block.indexOf('serviceworkers') !== -1);
  ['localstorage', 'cookies', 'indexdb', 'filesystem', 'websql'].forEach(function (name) {
    assert.strictEqual(block.indexOf("'" + name + "'"), -1, name + ' must survive clear cache');
  });
  assert.ok(src.indexOf('ses.clearCache()') !== -1, 'HTTP cache, which holds SWFs, is cleared');
  const english = fs.readFileSync(path.join(__dirname, '../../res/po/en-US.js'), 'utf8');
  const portuguese = fs.readFileSync(path.join(__dirname, '../../res/po/pt-BR.js'), 'utf8');
  assert.ok(english.indexOf('Smooth Motion') !== -1);
  assert.ok(portuguese.indexOf('Smooth Motion') !== -1);
});

test('reload removes the Ruffle player so the wasm instance and its sockets close', () => {
  const wrapper = fs.readFileSync(path.join(__dirname, '../../res/ruffle_wrapper.html'), 'utf8');
  assert.ok(wrapper.indexOf("addEventListener('pagehide'") !== -1);
  assert.ok(wrapper.indexOf('ruffle-player') !== -1);
  const player = fs.readFileSync(path.join(__dirname, '../../res/ruffle/ruffle.js'), 'utf8');
  assert.ok(player.indexOf('disconnectedCallback(){') !== -1);
  assert.ok(player.indexOf('instance.destroy()') !== -1);
  assert.ok(player.indexOf('ruffle-smooth-motion') !== -1);
});
