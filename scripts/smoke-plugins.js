#!/usr/bin/env node
/**
 * Lightweight smoke checks for the plugin system (no Electron window).
 * Exit 1 on failure. Safe for CI alongside npm test.
 *
 * Manual PPAPI / UI checklist: docs/FLASH_CHECKLIST.md
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const platform = require(path.join(root, 'res', 'platform'));

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

const aqw = path.join(root, 'plugins', 'adventure-quest-worlds');
const example = path.join(root, 'plugins', 'example-companion');

ok(fs.existsSync(path.join(aqw, 'plugin.json')), 'AQW plugin.json');
ok(fs.existsSync(path.join(example, 'plugin.json')), 'example plugin.json');
ok(fs.existsSync(path.join(example, 'assets', 'boxmover.swf')), 'example boxmover.swf');
ok(fs.statSync(path.join(example, 'assets', 'boxmover.swf')).size > 500, 'boxmover.swf size');
ok(fs.existsSync(path.join(example, 'assets', 'rectangle.swf')), 'example rectangle.swf');
ok(fs.statSync(path.join(example, 'assets', 'rectangle.swf')).size > 500, 'rectangle.swf size');
ok(fs.existsSync(path.join(example, 'flash', 'BoxMover.as')), 'BoxMover.as source');
ok(fs.existsSync(path.join(example, 'flash', 'StaticRect.as')), 'StaticRect.as source');

const discovered = platform.discoverPlugins({
  bundledDir: path.join(root, 'plugins'),
  appVersion: '1.12.2',
  log: function () {}
});
const ids = discovered.plugins.map(function (p) { return p.manifest.id; });
ok(ids.indexOf('adventure-quest-worlds') !== -1, 'discover AQW');
ok(ids.indexOf('example-companion') !== -1, 'discover example-companion');
ok(ids.indexOf('my-flash-game') === -1, 'skip _template');

const exManifest = JSON.parse(fs.readFileSync(path.join(example, 'plugin.json'), 'utf8'));
const validated = platform.manifestSchema.validateManifest(exManifest, { appVersion: '1.12.2' });
ok(validated.ok, 'example manifest validates: ' + ((validated.errors || []).join('; ')));

const preload = fs.readFileSync(
  path.join(example, 'features', 'dashboard', 'preload_dashboard.js'),
  'utf8'
);
ok(preload.indexOf('preload-bridge') === -1, 'dashboard preload is sandboxed-self-contained');
ok(preload.indexOf("require('electron')") !== -1, 'dashboard preload requires electron only');

const aqwHelp = fs.readFileSync(path.join(aqw, 'locales', 'en-US.js'), 'utf8');
ok(aqwHelp.indexOf('helpDetailExtra') !== -1, 'AQW help uses helpDetailExtra');
ok(aqwHelp.indexOf('helpDetail:') === -1 || aqwHelp.indexOf('helpDetailExtra') !== -1,
  'AQW does not replace platform helpDetail wholesale');

const exHelp = fs.readFileSync(path.join(example, 'locales', 'en-US.js'), 'utf8');
ok(exHelp.indexOf('helpDetailExtra') !== -1, 'example help uses helpDetailExtra');
ok(exHelp.indexOf('exampleNewBoxMover') !== -1, 'example menuMessages include New BoxMover');
ok(exHelp.indexOf('injectDemoMessages') !== -1, 'example injectDemoMessages present');
ok(exHelp.indexOf('windowTitles') !== -1, 'example windowTitles present');

const exHelpPt = fs.readFileSync(path.join(example, 'locales', 'pt-BR.js'), 'utf8');
ok(exHelpPt.indexOf('Nova janela BoxMover') !== -1, 'example pt-BR menu strings');

const localeSrc = fs.readFileSync(path.join(root, 'res', 'locale.js'), 'utf8');
ok(localeSrc.indexOf('helpDetailExtra') !== -1, 'locale.js composes helpDetailExtra');
ok(localeSrc.indexOf('resolveLangFile') !== -1, 'locale.js has language fallback resolver');

const platformHelp = fs.readFileSync(path.join(root, 'res', 'po', 'en-US.js'), 'utf8');
ok(platformHelp.indexOf('Active-plugin shortcuts') !== -1, 'platform help is plugin-aware');
ok(platformHelp.indexOf('AQW Wiki') === -1, 'platform help has no AQW wiki line');
ok(platformHelp.indexOf('appLanguage') !== -1, 'platform settings expose appLanguage');

const mainSrc = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
ok(mainSrc.indexOf('applyWindowMenu(win, bootGameUrl)') !== -1, 'boot reapplies per-window menu');
ok(mainSrc.indexOf('appLanguage') !== -1, 'boot respects appLanguage preference');

ok(fs.existsSync(path.join(root, 'docs', 'FLASH_CHECKLIST.md')), 'FLASH_CHECKLIST.md exists');

if (process.exitCode) {
  console.error('smoke-plugins: FAILED');
  process.exit(1);
}
console.log('smoke-plugins: all checks passed');
console.log('Manual Flash checklist: docs/FLASH_CHECKLIST.md');
