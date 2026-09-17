const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('web build reuses desktop pages through preload-compatible bridges', () => {
  const build = fs.readFileSync(path.join(__dirname, '../../scripts/build-web.js'), 'utf8');
  const contribute = require('../../plugins/adventure-quest-worlds/web/contribute.js')();
  const landing = fs.readFileSync(path.join(__dirname, '../../web/landing.html'), 'utf8');
  const landingScript = fs.readFileSync(path.join(__dirname, '../../web/assets/landing.js'), 'utf8');

  assert.ok(build.indexOf('contributeWebBuild') !== -1 || build.indexOf('contribute.js') !== -1);
  assert.ok(build.indexOf('loadContribution') !== -1);

  assert.strictEqual(contribute.landing.landingHtml, 'web/landing.html');
  assert.ok(contribute.landing.iconFrom.indexOf('Icon.png') !== -1);

  const toolIds = contribute.tools.map((t) => t.id).sort();
  assert.deepStrictEqual(toolIds, ['reminders', 'strategy', 'todo']);
  contribute.tools.forEach((tool) => {
    assert.ok(tool.sourceHtml.indexOf('plugins/adventure-quest-worlds/features') === 0);
    assert.ok(tool.outToolsPath.indexOf('tools/' + tool.id + '/') === 0);
    assert.ok(fs.existsSync(path.join(__dirname, '../..', tool.sourceHtml)), tool.sourceHtml);
    assert.ok(fs.existsSync(path.join(__dirname, '../..', tool.bridge)), tool.bridge);
    if (tool.defaultsJson) {
      assert.ok(fs.existsSync(path.join(__dirname, '../..', tool.defaultsJson)), tool.defaultsJson);
    }
  });

  assert.ok(
    contribute.sharedKits.some((p) => p.indexOf('list_window_common.js') !== -1)
  );
  assert.ok(contribute.bridges.commonBridge.indexOf('common.js') !== -1);
  assert.ok(contribute.localeModules['en-US']);
  assert.ok(contribute.localeModules['pt-BR']);

  assert.ok(
    fs.readFileSync(path.join(__dirname, '../../web/assets/landing.css'), 'utf8').indexOf('#2b6fce') !== -1,
    'landing must use the tools blue accent'
  );
  assert.ok(
    landingScript.indexOf('AppData/AquaStar') !== -1,
    'landing must distinguish desktop AppData storage from web storage'
  );
  ['Flash nativo e Ruffle', 'Inventário sincronizado', 'Atalhos personalizados', 'Prévia da wiki'].forEach((feature) =>
    assert.ok(landingScript.indexOf(feature) !== -1, 'landing must describe ' + feature)
  );
  assert.ok(
    landing.indexOf('tools/reminders/') !== -1 &&
      landing.indexOf('tools/todo/') !== -1 &&
      landing.indexOf('tools/strategy/') !== -1
  );
  assert.ok(landingScript.indexOf('const content =') !== -1, 'landing must support Portuguese and English');
});

test('AQW contributeWebBuild keeps tools at site-root tools/* paths', () => {
  const contribute = require('../../plugins/adventure-quest-worlds/web/contribute.js')();
  contribute.tools.forEach((tool) => {
    assert.strictEqual(tool.outToolsPath, 'tools/' + tool.id + '/index.html');
    assert.ok(tool.outToolsPath.indexOf('adventure-quest-worlds') === -1);
  });
});
