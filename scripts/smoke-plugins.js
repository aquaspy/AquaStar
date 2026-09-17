#!/usr/bin/env node
/**
 * Lightweight smoke checks for the plugin system (no Electron window).
 * Exit 1 on failure. Safe for CI alongside npm test.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

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

if (process.exitCode) {
  console.error('smoke-plugins: FAILED');
  process.exit(1);
}
console.log('smoke-plugins: all checks passed');
