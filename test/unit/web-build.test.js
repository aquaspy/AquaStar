const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('web build reuses desktop pages through preload-compatible bridges', () => {
    const build = fs.readFileSync(path.join(__dirname, '../../scripts/build-web.js'), 'utf8');
    ['reminders.html', 'todo.html', 'strategy.html', 'reminders_default.json', 'strategy_default.json'].forEach((name) => assert.ok(build.indexOf(name) !== -1));
    ['reminders.js', 'todo.js', 'strategy.js'].forEach((name) => assert.ok(build.indexOf("bridges/' + " + "f") !== -1 || build.indexOf(name) !== -1));
    const landing = fs.readFileSync(path.join(__dirname, '../../web/landing.html'), 'utf8');
    assert.ok(landing.indexOf('tools/reminders/') !== -1 && landing.indexOf('tools/todo/') !== -1 && landing.indexOf('tools/strategy/') !== -1);
});
