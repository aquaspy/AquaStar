const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('web build reuses desktop pages through preload-compatible bridges', () => {
    const build = fs.readFileSync(path.join(__dirname, '../../scripts/build-web.js'), 'utf8');
    ['reminders.html', 'todo.html', 'strategy.html', 'reminders_default.json', 'strategy_default.json'].forEach((name) => assert.ok(build.indexOf(name) !== -1));
    ['reminders.js', 'todo.js', 'strategy.js'].forEach((name) => assert.ok(build.indexOf("bridges/' + " + "f") !== -1 || build.indexOf(name) !== -1));
    assert.ok(build.indexOf('Icon/Icon.png') !== -1 && build.indexOf('aquastar-icon.png') !== -1, 'landing must include the AquaStar icon');
    assert.ok(build.indexOf('#2b6fce') !== -1, 'landing must use the tools blue accent');
    assert.ok(build.indexOf("['pt-BR', 'en-US']") !== -1, 'web build must package both tool locales');
    assert.ok(build.indexOf('AppData/AquaStar') !== -1, 'landing must distinguish desktop AppData storage from web storage');
    ['Flash nativo e Ruffle', 'Inventário sincronizado', 'Atalhos personalizados', 'Prévia da wiki'].forEach((feature) => assert.ok(build.indexOf(feature) !== -1, 'landing must describe ' + feature));
    const landing = fs.readFileSync(path.join(__dirname, '../../web/landing.html'), 'utf8');
    assert.ok(landing.indexOf('tools/reminders/') !== -1 && landing.indexOf('tools/todo/') !== -1 && landing.indexOf('tools/strategy/') !== -1);
    assert.ok(landing.indexOf('const d={pt:') !== -1 && landing.indexOf('en:{') !== -1, 'landing must support Portuguese and English');
});
