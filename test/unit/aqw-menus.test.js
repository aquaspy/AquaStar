const assert = require('assert');
const path = require('path');
const fs = require('fs');

const menus = require('../../plugins/adventure-quest-worlds/menus.js');
const keybinds = require('../../plugins/adventure-quest-worlds/keybinds.js');
const menuRegistry = require('../../res/platform/menu-registry.js');
const platform = require('../../res/platform');
const urls = require('../../plugins/adventure-quest-worlds/urls.js');

test('AQW app-menu Useful Pages declare openMode in-place', () => {
  const pages = menus.describeAppUsefulPages({
    urls: urls,
    labels: {},
    keybinds: { wiki: 'Alt+W', design: 'Alt+D', account: 'Alt+A', charpage: 'Alt+P' }
  });
  const links = menus.flattenLinkItems(pages);
  assert.ok(links.length >= 10, 'expected full useful-pages catalog');
  links.forEach(function (link) {
    assert.strictEqual(
      link.openMode,
      'in-place',
      link.id + ' app-menu link must be in-place'
    );
    assert.strictEqual(link.surface, 'app-menu');
    assert.ok(typeof link.url === 'string' && link.url.indexOf('http') === 0, link.id);
  });
  const ids = links.map(function (l) { return l.id; });
  ['wiki', 'design', 'account', 'charpage', 'dailyGifts', 'reddit'].forEach(function (id) {
    assert.ok(ids.indexOf(id) !== -1, 'missing app useful page ' + id);
  });
});

test('AQW game-menu page links declare openMode new-window', () => {
  const pages = menus.describeGameMenuPages({ urls: urls, labels: {}, keybinds: {} });
  assert.strictEqual(pages.length, 4);
  pages.forEach(function (link) {
    assert.strictEqual(link.openMode, 'new-window', link.id + ' must be new-window');
    assert.strictEqual(link.surface, 'game-menu');
  });
});

test('AQW keybind URL navigations declare openMode new-window', () => {
  const actions = keybinds.describeKeybindActions();
  const byId = {};
  actions.forEach(function (a) { byId[a.id] = a; });

  ['wiki', 'account', 'design', 'charpage', 'newAqw', 'newTest', 'dragon'].forEach(function (id) {
    assert.ok(byId[id], 'missing keybind ' + id);
    assert.strictEqual(byId[id].openMode, 'new-window', id + ' keybind must open new-window');
  });

  ['reminders', 'todo', 'inventory', 'strategy', 'cpSshot'].forEach(function (id) {
    assert.ok(byId[id], 'missing feature keybind ' + id);
  });

  Object.keys(keybinds.AQW_KEYBIND_DEFAULTS).forEach(function (id) {
    assert.ok(byId[id], 'default without registration meta: ' + id);
    assert.ok(
      !platform.PLATFORM_RESERVED_KEYBIND_IDS[id],
      id + ' must not be platform-reserved'
    );
  });
});

test('MenuContributor builds Useful Pages with in-place openMode and openLink', () => {
  const opened = [];
  const contributor = menus.createMenuContributor();
  const template = contributor({
    keybinds: { wiki: 'Alt+W' },
    labels: { menuOtherPages: 'Usefull Pages', menuWiki: 'AQW Wiki' },
    openLink: function (url, mode) {
      opened.push({ url: url, mode: mode });
    }
  });

  assert.strictEqual(template.length, 1);
  assert.strictEqual(template[0].openMode, 'in-place');
  assert.ok(template[0].submenu && template[0].submenu.length);

  function findWiki(items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && item.label === 'AQW Wiki') return item;
      if (item && item.submenu) {
        const nested = findWiki(item.submenu);
        if (nested) return nested;
      }
    }
    return null;
  }

  const wikiItem = findWiki(template[0].submenu);
  assert.ok(wikiItem, 'wiki item missing from contributor');
  assert.strictEqual(wikiItem.openMode, 'in-place');
  assert.strictEqual(wikiItem.registerAccelerator, false);
  wikiItem.click();
  assert.strictEqual(opened.length, 1);
  assert.strictEqual(opened[0].mode, 'in-place');
  assert.strictEqual(opened[0].url, urls.URLS.wikiReleases);
});

test('menu-registry adopts host contributors and page providers', () => {
  menuRegistry.clear();
  const host = platform.createPluginHost({
    manifest: {
      id: 'adventure-quest-worlds',
      name: 'AQW',
      version: '1.0.0',
      apiVersion: 1,
      main: 'main.js',
      minAppVersion: '1.12.2',
      permissions: [],
      capabilities: ['menus', 'keybinds']
    },
    pluginRoot: path.join(__dirname, '../../plugins/adventure-quest-worlds'),
    appVersion: '1.12.2',
    log: function () {}
  });

  menus.register(host);
  keybinds.register(host, { deferActions: true });

  const state = host._getState();
  assert.strictEqual(state.menus.length, 1);
  assert.ok(state.menuProviders);
  assert.strictEqual(state.menuProviders.appUsefulPages, menus.describeAppUsefulPages);
  assert.strictEqual(state.menuProviders.gameMenuPages, menus.describeGameMenuPages);
  assert.ok(state.keybinds.length >= 12);
  assert.strictEqual(state.keybindDefaults.wiki, 'Alt+W');
  assert.strictEqual(state.keybindDefaults.newAqw, 'Alt+N');

  menuRegistry.adoptHostState(state, state.menuProviders || null);

  assert.strictEqual(menuRegistry.getContributors().length, 1);
  assert.ok(menuRegistry.hasAppUsefulPages());

  const appPages = menuRegistry.getAppUsefulPages({ labels: {}, keybinds: {} });
  menus.flattenLinkItems(appPages).forEach(function (link) {
    assert.strictEqual(link.openMode, 'in-place');
  });

  const gamePages = menuRegistry.getGameMenuPages({});
  gamePages.forEach(function (link) {
    assert.strictEqual(link.openMode, 'new-window');
  });

  menuRegistry.clear();
  assert.strictEqual(menuRegistry.hasAppUsefulPages(), false);
});

test('Host registerMenuPages stores providers for any plugin id', () => {
  const host = platform.createPluginHost({
    manifest: {
      id: 'third-party-game',
      name: 'Third Party',
      version: '1.0.0',
      apiVersion: 1,
      main: 'main.js',
      minAppVersion: '1.12.2',
      permissions: [],
      capabilities: ['menus']
    },
    pluginRoot: path.join(__dirname, '../fixtures/sample-plugin'),
    appVersion: '1.12.2',
    log: function () {}
  });

  function appPages() { return [{ id: 'home', openMode: 'in-place' }]; }
  function gamePages() { return [{ id: 'shop', openMode: 'new-window' }]; }

  host.registerMenuPages({
    appUsefulPages: appPages,
    gameMenuPages: gamePages
  });

  const state = host._getState();
  assert.strictEqual(state.menuProviders.appUsefulPages, appPages);
  assert.strictEqual(state.menuProviders.gameMenuPages, gamePages);

  menuRegistry.clear();
  menuRegistry.adoptHostState(state, state.menuProviders || null);
  assert.ok(menuRegistry.hasAppUsefulPages());
  assert.strictEqual(menuRegistry.getAppUsefulPages({})[0].id, 'home');
  assert.strictEqual(menuRegistry.getGameMenuPages({})[0].openMode, 'new-window');
  menuRegistry.clear();

  assert.throws(function () {
    host.registerMenuPages({ appUsefulPages: 'nope' });
  }, /appUsefulPages expects a function/);
});

test('menu.js uses plugin pages without AQW catalog fallback', () => {
  const menuSrc = fs.readFileSync(
    path.join(__dirname, '../../res/windows/menu.js'),
    'utf8'
  );
  assert.ok(menuSrc.indexOf('focusedWin.webContents.loadURL(link)') !== -1 ||
    menuSrc.indexOf('focusedWin.webContents.loadURL(item.url)') !== -1);
  assert.ok(menuSrc.indexOf("openMode === 'external'") !== -1 ||
    menuSrc.indexOf("openMode: 'external'") !== -1 ||
    menuSrc.indexOf("openMode || 'in-place'") !== -1);
  assert.ok(menuSrc.indexOf('menuRegistry') !== -1);
  assert.ok(menuSrc.indexOf('hasAppUsefulPages') !== -1);
  assert.ok(menuSrc.indexOf('constant.wikiReleases') === -1);
  assert.ok(menuSrc.indexOf('menuReminders') === -1 ||
    menuSrc.indexOf("command(menuMessages.menuReminders") === -1);
  assert.ok(menuSrc.indexOf('runGameMenuAction') !== -1);
});

test('AQW menus register Game/Features contributors', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../plugins/adventure-quest-worlds/menus.js'),
    'utf8'
  );
  assert.ok(src.indexOf('createAqwChromeContributor') !== -1);
  assert.ok(src.indexOf("labelOr(labels, 'menuGame'") !== -1);
  assert.ok(src.indexOf("labelOr(labels, 'menuFeatures'") !== -1);
});

test('main.js adopts menu providers from host state without AQW id check', () => {
  const mainSrc = fs.readFileSync(
    path.join(__dirname, '../../main.js'),
    'utf8'
  );
  assert.ok(
    mainSrc.indexOf('platform.menuRegistry.adoptHostState(state, state.menuProviders || null)') !== -1
  );
  assert.ok(mainSrc.indexOf("manifest.id === 'adventure-quest-worlds'") === -1);
  assert.ok(mainSrc.indexOf("require('./plugins/adventure-quest-worlds/menus.js')") === -1);
});

test('AQW activate source registers menus and keybinds', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../plugins/adventure-quest-worlds/main.js'),
    'utf8'
  );
  assert.ok(src.indexOf("require('./menus.js')") !== -1);
  assert.ok(src.indexOf("require('./keybinds.js')") !== -1);
  assert.ok(src.indexOf('menus.register(host)') !== -1);
  assert.ok(src.indexOf('keybinds.register(host)') !== -1);

  const menusSrc = fs.readFileSync(
    path.join(__dirname, '../../plugins/adventure-quest-worlds/menus.js'),
    'utf8'
  );
  assert.ok(menusSrc.indexOf('host.registerMenuPages') !== -1);
  assert.ok(menusSrc.indexOf('appUsefulPages: describeAppUsefulPages') !== -1);
  assert.ok(menusSrc.indexOf('gameMenuPages: describeGameMenuPages') !== -1);
});
