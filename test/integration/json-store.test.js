const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../../res/repositories/json-store.js');

test('json store creates, reads and overwrites feature state', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aquastar-test-'));
    const filePath = path.join(directory, 'state.json');
    try {
        assert.deepStrictEqual(store.readOrCreate(filePath, () => ({ version: 1 })), { version: 1 });
        assert.deepStrictEqual(store.read(filePath), { version: 1 });
        store.write(filePath, { version: 2, values: ['a'] });
        assert.deepStrictEqual(store.read(filePath), { version: 2, values: ['a'] });
    } finally {
        fs.unlinkSync(filePath);
        fs.rmdirSync(directory);
    }
});
