const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('release staging includes the auxiliary Char Page Studio processes', () => {
  const buildScript = fs.readFileSync(path.join(__dirname, '../../scripts/build-arch.sh'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8');
  const processesDir = path.join(__dirname, '../../plugins/adventure-quest-worlds/processes');

  assert.ok(
    buildScript.indexOf('"${ROOT}/scripts"') !== -1,
    'release staging must copy scripts required by the application entry point'
  );
  ['charpage-studio-process.js', 'charpage-studio-capture-process.js'].forEach((fileName) => {
    assert.ok(fs.existsSync(path.join(processesDir, fileName)), fileName + ' must exist under plugin processes');
    assert.ok(
      main.indexOf('./plugins/adventure-quest-worlds/processes/' + fileName) !== -1,
      'main process must reference plugin process ' + fileName
    );
  });
});
