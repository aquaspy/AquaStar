const assert = require('assert');
const { resolveOption } = require('../../res/platform/settings-resolve.js');

test('resolveOption prefers top-level settings over plugins[id]', () => {
  const settings = {
    customUrl: 'https://top.example/swf',
    plugins: {
      'adventure-quest-worlds': {
        customUrl: 'https://nested.example/swf',
        autoSync: true
      }
    }
  };
  assert.strictEqual(
    resolveOption(settings, 'customUrl', 'adventure-quest-worlds'),
    'https://top.example/swf'
  );
  assert.strictEqual(
    resolveOption(settings, 'autoSync', 'adventure-quest-worlds'),
    true
  );
});

test('resolveOption falls back to nested plugin options when top-level missing', () => {
  const settings = {
    plugins: {
      'sample-plugin': {
        theme: 'dark'
      }
    }
  };
  assert.strictEqual(resolveOption(settings, 'theme', 'sample-plugin'), 'dark');
  assert.strictEqual(resolveOption(settings, 'theme', 'other-plugin'), undefined);
  assert.strictEqual(resolveOption(settings, 'missing', 'sample-plugin'), undefined);
});

test('resolveOption treats explicit top-level undefined as a win', () => {
  const settings = {
    customUrl: undefined,
    plugins: {
      'adventure-quest-worlds': {
        customUrl: 'https://nested.example/swf'
      }
    }
  };
  assert.strictEqual(
    resolveOption(settings, 'customUrl', 'adventure-quest-worlds'),
    undefined
  );
});

test('resolveOption tolerates null or non-object settings', () => {
  assert.strictEqual(resolveOption(null, 'x', 'p'), undefined);
  assert.strictEqual(resolveOption(undefined, 'x', 'p'), undefined);
  assert.strictEqual(resolveOption('bad', 'x', 'p'), undefined);
});
