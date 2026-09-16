const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('game menu is optional by default and dispatches through shortcut actions', () => {
  const constants = fs.readFileSync(path.join(__dirname, '../../res/const.js'), 'utf8');
  const menu = fs.readFileSync(path.join(__dirname, '../../res/windows/menu.js'), 'utf8');
  const keybindings = fs.readFileSync(path.join(__dirname, '../../res/keybindings.js'), 'utf8');
  const settings = fs.readFileSync(path.join(__dirname, '../../res/features/settings/settings.html'), 'utf8');

  assert.ok(constants.indexOf('showGameMenu:      true') !== -1);
  assert.ok(settings.indexOf("showGameMenu:      'boolean'") !== -1);
  assert.ok(menu.indexOf('exports.getGameMenu') !== -1);
  assert.ok(menu.indexOf('runGameMenuAction(action, focusedWin)') !== -1);
  assert.ok(menu.indexOf('submenu: links.slice(3, 6)') !== -1, 'browser pages must group tools');
  assert.ok(menu.indexOf('submenu: links.slice(6)') !== -1, 'browser pages must group features');
  ['wiki', 'newAqw', 'sshot', 'record', 'reloadCache', 'reminders', 'strategy'].forEach((action) => {
    assert.ok(keybindings.indexOf("case '" + action + "'") !== -1, action + ' must be available through the game menu');
  });
});

test('game menu useful pages stay new-window while app-menu generateLink stays in-place', () => {
  const aqwMenus = require('../../plugins/adventure-quest-worlds/menus.js');
  const appLinks = aqwMenus.flattenLinkItems(aqwMenus.describeAppUsefulPages({}));
  const gameLinks = aqwMenus.describeGameMenuPages({});
  assert.ok(appLinks.every((l) => l.openMode === 'in-place'));
  assert.ok(gameLinks.every((l) => l.openMode === 'new-window'));
});
