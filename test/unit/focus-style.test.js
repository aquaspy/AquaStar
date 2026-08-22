const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('shared focus style covers every native interactive control used by feature windows', () => {
    const stylesheet = fs.readFileSync(path.join(__dirname, '../../res/features/common/focus.css'), 'utf8');
    ['button', 'input', 'select', 'textarea', 'a', 'summary'].forEach((selector) => {
        assert.ok(stylesheet.indexOf(selector + ':focus-visible') !== -1, selector + ' needs a visible keyboard focus style');
    });
});
