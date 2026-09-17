const assert = require('assert');
const fs = require('fs');
const path = require('path');
const menuRegistry = require('../../res/platform/menu-registry.js');

test('menu registry clears previous plugin pages on adopt', () => {
  menuRegistry.clear();
  menuRegistry.adoptHostState({
    menus: [],
    menuProviders: {
      appUsefulPages: function () {
        return [{ label: 'Wiki', url: 'https://aqwwiki.wikidot.com/', openMode: 'in-place' }];
      }
    }
  });
  assert.strictEqual(menuRegistry.getAppUsefulPages({})[0].label, 'Wiki');

  menuRegistry.adoptHostState({
    menus: [function () {
      return [{ label: 'Example', submenu: [] }];
    }],
    menuProviders: {
      appUsefulPages: function () {
        return [{ label: 'GitHub', url: 'https://github.com/aquaspy/AquaStar', openMode: 'in-place' }];
      },
      gameMenuPages: function () {
        return [{ label: 'Releases', url: 'https://github.com/aquaspy/AquaStar/releases', openMode: 'new-window' }];
      }
    }
  });
  assert.strictEqual(menuRegistry.getAppUsefulPages({})[0].label, 'GitHub');
  assert.ok(menuRegistry.getAppUsefulPages({})[0].label !== 'Wiki');
  assert.strictEqual(menuRegistry.getGameMenuPages({})[0].label, 'Releases');
  assert.strictEqual(menuRegistry.getContributors().length, 1);
  menuRegistry.clear();
});

test('menu.js source no longer embeds AQW catalog fallback', () => {
  const menuSrc = fs.readFileSync(
    path.join(__dirname, '../../res/windows/menu.js'),
    'utf8'
  );
  assert.ok(menuSrc.indexOf('platformAquaStarMenu') !== -1);
  assert.ok(menuSrc.indexOf('constant.wikiReleases') === -1);
  assert.ok(menuSrc.indexOf('constant.accountAq') === -1);
  assert.ok(menuSrc.indexOf("command(menuMessages.menuReminders") === -1);
  assert.ok(menuSrc.indexOf("command(menuMessages.menuNewAqw") === -1);
  assert.ok(menuSrc.indexOf('never fall back to the AQW catalog') !== -1 ||
    menuSrc.indexOf('Plugin Useful Pages only') !== -1);
});
