const path = require('path');

const tests = [];
global.test = function (name, fn) { tests.push({ name: name, fn: fn }); };

[
    './unit/list-state.test.js',
    './unit/reset-time.test.js',
    './unit/feature-window-controller.test.js',
    './unit/focus-style.test.js',
    './unit/ruffle-update-ui.test.js',
    './unit/wikiview-injection.test.js',
    './unit/charpage-lab.test.js',
    './unit/game-menu.test.js',
    './unit/release-staging.test.js',
    './unit/web-build.test.js',
    './unit/web-preview.test.js',
    './unit/pages-workflow.test.js',
    './integration/json-store.test.js'
].forEach((file) => require(path.join(__dirname, file)));

(async () => {
    let failed = 0;
    for (const item of tests) {
        try {
            await item.fn();
            console.log('✓ ' + item.name);
        } catch (error) {
            failed++;
            console.error('✗ ' + item.name + '\n' + (error.stack || error));
        }
    }
    console.log(tests.length + ' tests, ' + failed + ' failed');
    process.exitCode = failed ? 1 : 0;
})();
