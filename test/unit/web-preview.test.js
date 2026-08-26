const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('web preview serves the generated artifact over HTTP instead of file URLs', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../scripts/serve-web.js'), 'utf8');
    assert.ok(source.indexOf("'web-dist'") !== -1);
    assert.ok(source.indexOf("listen(port, '127.0.0.1'") !== -1);
});
