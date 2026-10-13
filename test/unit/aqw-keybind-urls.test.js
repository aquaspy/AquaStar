const assert = require('assert');

const urls = require('../../plugins/adventure-quest-worlds/urls.js');
const keybinds = require('../../plugins/adventure-quest-worlds/keybinds.js');

function registrations(primaryUrl, player) {
  const opened = [];
  const regs = keybinds.createKeybindRegistrations({
    instances: {
      newBrowserWindow: function (url) { opened.push(url); },
      openRemindersWindow: function () { opened.push('feature:reminders'); },
      charPagePrint: function () { opened.push('charpagePrint'); }
    },
    getPrimaryUrl: function () { return primaryUrl; },
    getPlayerCharacter: function () { return player; }
  });
  const byId = {};
  regs.forEach(function (r) { byId[r.id] = r; });
  return { opened: opened, byId: byId };
}

test('AQW keybinds open URLs from the plugin catalog, with the platform override for the main game', () => {
  const r = registrations('https://game.aq.com/game/gamefiles/Loader4.swf?ver=b', 'Hero 1!');
  r.byId.newAqw.action();
  r.byId.wiki.action();
  r.byId.design.action();
  r.byId.account.action();
  r.byId.charpage.action();
  r.byId.dragon.action();
  assert.deepStrictEqual(r.opened, [
    'https://game.aq.com/game/gamefiles/Loader4.swf?ver=b',
    urls.URLS.wikiReleases,
    urls.URLS.designNotes,
    urls.URLS.accountAq,
    urls.URLS.charLookup + '?id=Hero1',
    urls.URLS.dfLoader
  ]);
});

test('newAqw follows the effective primary URL (customUrl / local SWF), not the built-in loader', () => {
  const r = registrations('file:///C:/data/aqlite_old.swf', '');
  r.byId.newAqw.action();
  assert.deepStrictEqual(r.opened, ['file:///C:/data/aqlite_old.swf']);
});

test('newTest opens the testing loader with a cache-busting ver each time', () => {
  const r = registrations('x', '');
  r.byId.newTest.action();
  r.byId.newTest.action();
  assert.strictEqual(r.opened.length, 2);
  r.opened.forEach(function (u) { assert.ok(urls.isTestingAqwUrl(u), u); });
});

test('cpSshot is HTML-windows-only on macOS and plugin-declared (platform has no id check)', () => {
  const r = registrations('x', '');
  assert.strictEqual(r.byId.cpSshot.onlyHtml, process.platform === 'darwin');
  r.byId.cpSshot.action();
  assert.deepStrictEqual(r.opened, ['charpagePrint']);
});

test('every AQW keybind id registered is described and has an action', () => {
  const r = registrations('x', '');
  keybinds.describeKeybindActions().forEach(function (meta) {
    assert.strictEqual(typeof r.byId[meta.id].action, 'function', meta.id);
  });
});
