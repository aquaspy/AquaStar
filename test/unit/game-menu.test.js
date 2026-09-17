const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('game menu is optional by default and keeps platform AquaStar chrome', () => {
  const constants = fs.readFileSync(path.join(__dirname, '../../res/const.js'), 'utf8');
  const menu = fs.readFileSync(path.join(__dirname, '../../res/windows/menu.js'), 'utf8');
  const settings = fs.readFileSync(path.join(__dirname, '../../res/features/settings/settings.html'), 'utf8');

  assert.ok(constants.indexOf('showGameMenu:      true') !== -1);
  assert.ok(settings.indexOf("showGameMenu:      'boolean'") !== -1);
  assert.ok(menu.indexOf('exports.getGameMenu') !== -1);
  assert.ok(menu.indexOf('platformAquaStarMenu') !== -1);
  assert.ok(menu.indexOf('platformToolsMenu') !== -1);
  assert.ok(menu.indexOf('pluginContributorMenus') !== -1);
  // Must not hardcode AQW feature entries anymore.
  assert.ok(menu.indexOf("command(menuMessages.menuReminders") === -1);
  assert.ok(menu.indexOf("command(menuMessages.menuNewAqw") === -1);
});

test('game menu useful pages stay new-window while app-menu pages stay in-place', () => {
  const aqwMenus = require('../../plugins/adventure-quest-worlds/menus.js');
  const appLinks = aqwMenus.flattenLinkItems(aqwMenus.describeAppUsefulPages({}));
  const gameLinks = aqwMenus.describeGameMenuPages({});
  assert.ok(appLinks.every((l) => l.openMode === 'in-place'));
  assert.ok(gameLinks.every((l) => l.openMode === 'new-window'));
});

test('originalKeybinds are platform-only; AQW ids live on the plugin', () => {
  const constants = fs.readFileSync(path.join(__dirname, '../../res/const.js'), 'utf8');
  assert.ok(constants.indexOf('legacyAqwKeybinds') !== -1);
  assert.ok(constants.indexOf('wiki:        "Alt+W"') === -1 ||
    constants.indexOf('exports.legacyAqwKeybinds') !== -1);
  // Platform block should not list newAqw before legacy export.
  const platformBlock = constants.slice(
    constants.indexOf('const originalKeybinds'),
    constants.indexOf('exports.originalKeybinds')
  );
  assert.ok(platformBlock.indexOf('settings:') !== -1);
  assert.ok(platformBlock.indexOf('newAqw:') === -1);
  assert.ok(platformBlock.indexOf('wiki:') === -1);
  const src = fs.readFileSync(
    path.join(__dirname, '../../plugins/adventure-quest-worlds/keybinds.js'),
    'utf8'
  );
  assert.ok(src.indexOf("newAqw: 'Alt+N'") !== -1);
});
