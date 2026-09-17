const assert = require('assert');
const path = require('path');

const locale = require('../../res/locale.js');

test('AQW plugin locale catalogs export feature message namespaces', () => {
  ['en-US', 'pt-BR'].forEach((code) => {
    const catalog = require(path.join(
      __dirname,
      '../../plugins/adventure-quest-worlds/locales',
      code + '.js'
    ));
    assert.ok(catalog.remindersMessages && catalog.remindersMessages.title);
    assert.ok(catalog.todoMessages && catalog.todoMessages.title);
    assert.ok(catalog.strategyMessages && catalog.strategyMessages.title);
    assert.ok(catalog.inventoryMessages && catalog.inventoryMessages.title);
    assert.ok(catalog.wikiMessages && catalog.wikiMessages.mergeMaterialsTitle);
    assert.ok(catalog.charPageStudioMessages && catalog.charPageStudioMessages.heading);
    assert.strictEqual(typeof catalog.dialogMessages.helpDetail, 'function');
    assert.ok(catalog.menuMessages.menuWiki);
    assert.ok(catalog.settingsMessages.labels.wiki);
  });
});

test('platform locale catalogs keep chrome and omit moved AQW feature namespaces', () => {
  ['en-US', 'pt-BR'].forEach((code) => {
    const platform = require(path.join(__dirname, '../../res/po', code + '.js'));
    assert.ok(platform.titleMessages && platform.titleMessages.recording);
    assert.ok(platform.dialogMessages && platform.dialogMessages.aboutTitle);
    assert.ok(platform.settingsMessages && platform.settingsMessages.optionLabels.recordingFormat);
    assert.ok(platform.settingsMessages.optionLabels.renderMode);
    assert.ok(platform.settingsMessages.labels.settings);
    assert.strictEqual(platform.remindersMessages, undefined);
    assert.strictEqual(platform.todoMessages, undefined);
    assert.strictEqual(platform.strategyMessages, undefined);
    assert.strictEqual(platform.inventoryMessages, undefined);
    assert.strictEqual(platform.wikiMessages, undefined);
    assert.strictEqual(platform.charPageStudioMessages, undefined);
  });
});

test('mergePluginLocales applies plugin keys without clobbering platformMessages', () => {
  locale.mergePluginLocales({
    'en-US': require('../../plugins/adventure-quest-worlds/locales/en-US.js')
  });
  locale.detectLang('en-US', {
    help: 'F1',
    settings: 'Alt+9',
    about: 'Alt+F1',
    fullscreen: 'F11',
    sshot: 'F2',
    record: 'Ctrl+J',
    reload: 'F5',
    reloadCache: 'Ctrl+F5',
    wiki: 'Alt+W',
    design: 'Alt+D',
    account: 'Alt+A',
    charpage: 'Alt+P',
    cpSshot: 'Alt+K',
    newAqw: 'Alt+N',
    newTest: 'Alt+Q',
    dragon: 'Alt+1',
    reminders: 'Alt+T',
    todo: 'Alt+Y',
    inventory: 'Alt+I',
    strategy: 'Alt+U'
  });

  assert.ok(locale.strings.remindersMessages.title.indexOf('Reminders') !== -1);
  assert.ok(locale.strings.settingsMessages.optionLabels.recordingFormat);
  assert.ok(locale.strings.settingsMessages.labels.wiki);
  assert.ok(locale.strings.settingsMessages.labels.settings);
  assert.ok(locale.strings.menuMessages.menuSettings);
  assert.ok(locale.strings.menuMessages.menuWiki);
  assert.ok(String(locale.strings.dialogMessages.helpDetail).indexOf('AQW Wiki') !== -1);

  locale.strings.platformMessages = { keep: true };
  locale.mergePluginLocales({
    'en-US': {
      platformMessages: { keep: false, evil: true },
      remindersMessages: { title: 'Reminders-merged' }
    }
  });
  assert.deepStrictEqual(locale.strings.platformMessages, { keep: true });
  assert.strictEqual(locale.strings.remindersMessages.title, 'Reminders-merged');
});
