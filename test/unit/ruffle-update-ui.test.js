const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('Ruffle updater exposes stable and nightly channels without labelling every update as nightly', () => {
  const settings = fs.readFileSync(path.join(__dirname, '../../res/features/settings/settings.html'), 'utf8');
  const updater = fs.readFileSync(path.join(__dirname, '../../res/ruffleUpdate.js'), 'utf8');
  const english = fs.readFileSync(path.join(__dirname, '../../res/po/en-US.js'), 'utf8');

  assert.ok(updater.indexOf("LATEST_URL = 'https://api.github.com/repos/ruffle-rs/ruffle/releases/latest'") !== -1);
  assert.ok(updater.indexOf("channel === 'nightly' ? RELEASES_URL : LATEST_URL") !== -1);
  assert.ok(
    settings.indexOf("buildSelectOptionRow('ruffleUpdateChannel'") <
      settings.indexOf('updateRow, buildBooleanOptionRow')
  );
  assert.ok(/ruffleUpdateLabel\s*:\s*"Update Ruffle"/.test(english));
  assert.ok(
    english.indexOf("Downloads Ruffle's self-hosted web build from its official GitHub nightly release") === -1
  );
});

test('display settings stay inside the values the vendored player accepts', () => {
  const display = require('../../res/ruffle-display.js');
  const wrapper = fs.readFileSync(path.join(__dirname, '../../res/ruffle_wrapper.html'), 'utf8');
  const english = fs.readFileSync(path.join(__dirname, '../../res/po/en-US.js'), 'utf8');
  const portuguese = fs.readFileSync(path.join(__dirname, '../../res/po/pt-BR.js'), 'utf8');
  function hasChoice(source, id) {
    return source.indexOf(id + ':') !== -1 || source.indexOf(JSON.stringify(id) + ':') !== -1;
  }
  display.qualities.forEach(function (item) {
    assert.strictEqual(display.normalizeQuality(item.id), item.id);
    assert.ok(wrapper.indexOf("'" + item.id + "'") !== -1 || wrapper.indexOf(item.id + ':') !== -1);
    assert.ok(hasChoice(english, item.id));
    assert.ok(hasChoice(portuguese, item.id));
  });
  display.scales.forEach(function (item) {
    assert.strictEqual(display.normalizeScale(item.id), item.id);
    assert.strictEqual(display.scaleValue(item.id), item.value);
    assert.ok(wrapper.indexOf("'" + item.id + "'") !== -1);
  });
  assert.strictEqual(display.normalizeQuality('nope'), 'high');
  assert.strictEqual(display.normalizeScale('9'), '1');
  assert.strictEqual(display.scaleValue('missing'), 1);
});

test('Ruffle defaults to automatic rendering and High quality while respecting explicit quality', async () => {
  const wrapper = fs.readFileSync(path.join(__dirname, '../../res/ruffle_wrapper.html'), 'utf8');
  const script = wrapper.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const [query, expectedQuality, expectedScale] of [
    ['', 'high', 1],
    ['&quality=invalid', 'high', 1],
    ['&quality=high', 'high', 1],
    ['&quality=medium', 'medium', 1],
    ['&quality=low', 'low', 1],
    ['&quality=best', 'best', 1],
    ['&quality=8x8', '8x8', 1],
    ['&quality=8x8linear', '8x8linear', 1],
    ['&quality=16x16', '16x16', 1],
    ['&quality=16x16linear', '16x16linear', 1],
    ['&scale=0.5', 'high', 0.5],
    ['&scale=2', 'high', 2],
    ['&scale=3', 'high', 1],
    ['&quality=best&scale=0.75', 'best', 0.75]
  ]) {
    let options;
    let bootstrap;
    const player = {
      load: async (value) => {
        options = value;
      }
    };
    const context = {
      URL,
      URLSearchParams,
      Map,
      Set,
      console,
      window: {
        location: { search: '?swf=https://example.com/game/loader.swf' + query },
        RufflePlayer: { newest: () => ({ createPlayer: () => player }) },
        addEventListener: function () {}
      },
      document: {
        querySelectorAll: function () {
          return [];
        },
        createElement: () => ({}),
        head: {
          appendChild: (value) => {
            bootstrap = value;
          }
        },
        getElementById: () => ({ appendChild: (value) => assert.strictEqual(value, player) })
      }
    };
    vm.runInNewContext(script, context);
    await bootstrap.onload();
    assert.strictEqual(options.quality, expectedQuality);
    assert.strictEqual(player.renderScale, expectedScale);
    assert.strictEqual(options.base, 'https://example.com/game/');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(options, 'preferredRenderer'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(options, 'renderer'), false);
    assert.strictEqual(context.window.RufflePlayer.config, undefined);
  }
});
