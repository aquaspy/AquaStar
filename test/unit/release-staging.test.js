const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('release staging includes the auxiliary Char Page Studio processes', () => {
    const buildScript = fs.readFileSync(path.join(__dirname, '../../scripts/build-arch.sh'), 'utf8');
    const main = fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8');

    assert.ok(buildScript.indexOf('"${ROOT}/scripts"') !== -1,
        'release staging must copy scripts required by the application entry point');
    ['charpage-studio-process.js', 'charpage-studio-capture-process.js'].forEach((fileName) => {
        assert.ok(fs.existsSync(path.join(__dirname, '../../scripts', fileName)), fileName + ' must exist in source');
        assert.ok(main.indexOf('./scripts/' + fileName) !== -1, 'main process must reference ' + fileName);
    });
});
