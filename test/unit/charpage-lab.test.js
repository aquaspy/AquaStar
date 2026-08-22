const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('CharacterB laboratory keeps the captured FlashVars editable and loads a user-selected local SWF', () => {
    const lab = fs.readFileSync(path.join(__dirname, '../../res/features/charpage/lab/characterB-lab.html'), 'utf8');
    ['type="file"', 'remove-accessories', 'initialFlashVars', 'new URLSearchParams(flashvars.value)', 'characterBLab.stageSwf', 'url: originalSwfUrl', "params.set(key, 'none')", 'strWeaponFile=', 'strCapeFile=', 'strHelmFile=', 'bgindex=0', 'characterB.swf?v=2', 'value="https://game.aq.com/"', 'diagnostics', 'onDiagnostic'].forEach((fragment) => {
        assert.ok(lab.indexOf(fragment) !== -1, 'laboratory must contain ' + fragment);
    });
    const packageJson = fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8');
    assert.ok(packageJson.indexOf('"charpage-lab": "electron scripts/charpage-lab.js"') !== -1);
    const launcher = fs.readFileSync(path.join(__dirname, '../../scripts/charpage-lab.js'), 'utf8');
    assert.ok(launcher.indexOf('webSecurity: false') !== -1);
    assert.ok(launcher.indexOf("charpage-lab-diagnostic") !== -1);
    assert.ok(launcher.indexOf("interceptBufferProtocol('https'") !== -1);
    assert.ok(launcher.indexOf("charpage-lab-stage-swf") !== -1);
    assert.ok(launcher.indexOf('SOURCE_URL') !== -1);
    assert.ok(launcher.indexOf("on('new-window'") !== -1);
    assert.ok(launcher.indexOf('webContents.setWindowOpenHandler(') === -1);
});
