const assert = require('assert');
const merge = require('../../res/platform/settings-merge.js');

test('mergeLoadedSettings: plugin slice overlays plugin keys; platform top-level wins', () => {
  const merged = merge.mergeLoadedSettings({
    activePluginId: 'adventure-quest-worlds',
    platformDefaults: {
      settings: 'Alt+9',
      sshot: 'F2',
      recordingFormat: 'h264-mkv',
      newAqw: 'Alt+N'
    },
    pluginDefaults: {
      newAqw: 'Alt+N',
      playerCharacter: '',
      autoSync: false
    },
    topLevel: {
      settings: 'Alt+0',
      newAqw: 'Alt+N',
      playerCharacter: 'LegacyHero',
      plugins: {
        'adventure-quest-worlds': {
          newAqw: 'Alt+Shift+N',
          playerCharacter: 'PluginHero',
          settings: 'SHOULD_IGNORE'
        }
      }
    },
    plugins: {
      'adventure-quest-worlds': {
        newAqw: 'Alt+Shift+N',
        playerCharacter: 'PluginHero',
        settings: 'SHOULD_IGNORE'
      }
    }
  });
  assert.strictEqual(merged.settings, 'Alt+0');
  assert.strictEqual(merged.newAqw, 'Alt+Shift+N');
  assert.strictEqual(merged.playerCharacter, 'PluginHero');
  assert.strictEqual(merged.recordingFormat, 'h264-mkv');
});

test('mergeLoadedSettings falls back to top-level plugin keys when slice empty', () => {
  const merged = merge.mergeLoadedSettings({
    activePluginId: 'adventure-quest-worlds',
    platformDefaults: { sshot: 'F2' },
    pluginDefaults: { playerCharacter: '' },
    topLevel: { playerCharacter: 'OnlyTop' },
    plugins: {}
  });
  assert.strictEqual(merged.playerCharacter, 'OnlyTop');
});

test('splitSavePatch dual-writes plugin keys and keeps platform top-level', () => {
  const next = merge.splitSavePatch({
    sshot: 'F3',
    playerCharacter: 'Hero',
    newAqw: 'Alt+N'
  }, 'adventure-quest-worlds', {
    sshot: 'F2',
    playerCharacter: 'Old'
  });
  assert.strictEqual(next.sshot, 'F3');
  assert.strictEqual(next.playerCharacter, 'Hero');
  assert.strictEqual(next.plugins['adventure-quest-worlds'].playerCharacter, 'Hero');
  assert.strictEqual(next.plugins['adventure-quest-worlds'].newAqw, 'Alt+N');
  assert.strictEqual(next.plugins['adventure-quest-worlds'].sshot, undefined);
});
