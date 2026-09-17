const assert = require('assert');
const fs = require('fs');
const path = require('path');

const platform = require('../../res/platform');

test('instances titles prefer plugin primary/launch helpers', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../res/instances.js'), 'utf8');
  assert.ok(src.indexOf('_titleForGameWindow') !== -1);
  assert.ok(src.indexOf('_titleForLaunchWindow') !== -1);
  // Hardcoded AQW title only as legacy fallback, not the sole path.
  assert.ok(src.indexOf('Adventure Quest Worlds') !== -1);
  assert.ok(src.indexOf('primary.title') !== -1 || src.indexOf('primary.title({') !== -1);
});

test('Host exposes getLocaleStrings and getAppIconPath', () => {
  const { createPluginHost } = require('../../res/platform/plugin-host.js');
  const host = createPluginHost({
    manifest: {
      id: 'sample-swf',
      name: 'Sample',
      version: '1.0.0',
      apiVersion: 1,
      main: 'main.js',
      minAppVersion: '1.12.2',
      permissions: []
    },
    pluginRoot: path.join(__dirname, '../fixtures/sample-plugin'),
    appRootPath: path.join(__dirname, '../..'),
    deps: {}
  });
  assert.strictEqual(typeof host.getLocaleId, 'function');
  assert.strictEqual(typeof host.getLocaleStrings, 'function');
  assert.strictEqual(typeof host.getAppIconPath, 'function');
  assert.strictEqual(typeof host.readPluginText, 'function');
  const icon = host.getAppIconPath();
  assert.ok(typeof icon === 'string' && icon.indexOf('Icon') !== -1);
});

test('sandboxed preload template only requires electron', () => {
  const src = platform.buildSandboxedPreloadSource({
    pluginId: 'demo',
    methods: ['getState', 'saveNote']
  });
  assert.ok(src.indexOf("require('electron')") !== -1);
  assert.ok(src.indexOf('plugin:demo:') !== -1);
  assert.ok(src.indexOf('getState') !== -1);
  assert.ok(src.indexOf('path.join') === -1);
});

test('menu templates force registerAccelerator false to avoid double keybind fire', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../res/windows/menu.js'), 'utf8');
  assert.ok(src.indexOf('sanitizeMenuAccelerators') !== -1);
  assert.ok(src.indexOf('return sanitizeMenuAccelerators(template)') !== -1);
});

test('plugin-runtime dedupes duplicate window/external opens', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../res/platform/plugin-runtime.js'), 'utf8');
  assert.ok(src.indexOf('shouldSkipDuplicate') !== -1);
  assert.ok(src.indexOf('ACTION_DEDUP_MS') !== -1);
});

test('instances assigns per-window menus and suppresses duplicate opens', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../res/instances.js'), 'utf8');
  assert.ok(src.indexOf('_windowOpenGate') !== -1);
  assert.ok(src.indexOf('Suppressed duplicate newBrowserWindow') !== -1);
  assert.ok(src.indexOf('function applyWindowMenu') !== -1);
  assert.ok(src.indexOf('exports.applyWindowMenu') !== -1);
  const mainSrc = fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8');
  // Full app menu must not be set globally alongside per-window menus.
  assert.ok(mainSrc.indexOf('Menu.buildFromTemplate(windowsMenu.getMenu(finalkeyb') === -1);
  assert.ok(mainSrc.indexOf('applyWindowMenu(win, bootGameUrl)') !== -1);
});

test('locale resolveLangFile maps pt to pt-BR', () => {
  const locale = require('../../res/locale.js');
  // detectLang uses resolveLangFile internally; pt should load pt-BR catalog.
  locale.detectLang('pt', { help: 'F1', settings: 'Alt+9', about: 'F9', fullscreen: 'F11',
    sshot: 'F2', record: 'Ctrl+J', reload: 'F5', reloadCache: 'Ctrl+F5',
    forward: 'Alt+F', backward: 'Alt+B' });
  assert.strictEqual(locale.getLang(), 'pt-BR');
  assert.ok(locale.strings.dialogMessages.helpTitle.indexOf('Ajuda') !== -1);
});

test('example menus.js reads labels from ctx.labels', () => {
  const menus = require('../../plugins/example-companion/menus.js');
  const pages = menus.describeAppUsefulPages({
    labels: { exampleGithub: 'GitHub PT' },
    keybinds: {}
  });
  assert.strictEqual(pages[0].label, 'GitHub PT');
  const chrome = menus.register && true;
  assert.ok(chrome);
});

test('example companion ships Flex-built SWFs and sandboxed dashboard preload', () => {
  const root = path.join(__dirname, '../../plugins/example-companion');
  const box = fs.readFileSync(path.join(root, 'assets/boxmover.swf'));
  const rect = fs.readFileSync(path.join(root, 'assets/rectangle.swf'));
  assert.ok(box.length > 500);
  assert.ok(rect.length > 500);
  const preload = fs.readFileSync(
    path.join(root, 'features/dashboard/preload_dashboard.js'),
    'utf8'
  );
  assert.ok(preload.indexOf("require('electron')") !== -1);
  assert.ok(preload.indexOf('preload-bridge') === -1);
  assert.ok(fs.existsSync(path.join(root, 'flash/StaticRect.as')));
});
