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

test('Ruffle defaults to automatic rendering and High quality while respecting explicit quality', async () => {
  const wrapper = fs.readFileSync(path.join(__dirname, '../../res/ruffle_wrapper.html'), 'utf8');
  const script = wrapper.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const [query, expectedQuality] of [
    ['', 'high'],
    ['&quality=invalid', 'high'],
    ['&quality=high', 'high'],
    ['&quality=medium', 'medium'],
    ['&quality=low', 'low']
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
        RufflePlayer: { newest: () => ({ createPlayer: () => player }) }
      },
      document: {
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
    assert.strictEqual(options.base, 'https://example.com/game/');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(options, 'preferredRenderer'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(options, 'renderer'), false);
    assert.strictEqual(context.window.RufflePlayer.config, undefined);
  }
});
