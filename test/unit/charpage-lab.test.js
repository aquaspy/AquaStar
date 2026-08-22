const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('Char Page Studio loads an explicitly requested Char Page into native Flash controls', () => {
    const lab = fs.readFileSync(path.join(__dirname, '../../res/features/charpage/lab/characterB-lab.html'), 'utf8');
    ['player-name', 'load-character', 'initialFlashVars = \'\'', 'colorDefinitions', 'intColorHair', 'intColorSkin', 'intColorEye', 'intColorBase', 'intColorTrim', 'intColorAccessory', 'show-weapon', 'items/swords/unarmed.swf', 'strCustWeaponFile', 'bgindex', 'max="31"', 'characterBLab.loadCharacter', 'characterBLab.getDefaults', 'application/x-shockwave-flash', 'player.src = currentSourceUrl', 'Opções avançadas', 'Classe e armadura', 'Cabelo e elmo', 'Armas', 'Pet e cenário', 'function changeParam', 'function removeParam', 'sidebar-controls', 'preview-pane', 'align-items: flex-start'].forEach((fragment) => {
        assert.ok(lab.indexOf(fragment) !== -1, 'laboratory must contain ' + fragment);
    });
    assert.ok(lab.indexOf('if (!currentSourceUrl || !flashvars.value)') !== -1);
    const packageJson = fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8');
    assert.ok(packageJson.indexOf('"charpage-lab": "electron scripts/charpage-lab.js"') !== -1);
    const launcher = fs.readFileSync(path.join(__dirname, '../../scripts/charpage-lab.js'), 'utf8');
    assert.ok(launcher.indexOf('webSecurity: false') !== -1);
    assert.ok(launcher.indexOf("interceptBufferProtocol('https'") !== -1);
    assert.ok(launcher.indexOf("charpage-studio-load-character") !== -1);
    assert.ok(launcher.indexOf('SOURCE_URL') !== -1);
    assert.ok(launcher.indexOf('extractCharPageData') !== -1);
    assert.ok(launcher.indexOf('readConfiguredPlayerName') !== -1);
    assert.ok(launcher.indexOf('session.defaultSession') !== -1);
    assert.ok(launcher.indexOf('LAB_PARTITION') === -1);
    assert.ok(launcher.indexOf('plugins: true') !== -1);
    assert.ok(launcher.indexOf('flash.flashManager') !== -1);
    assert.ok(launcher.indexOf('allowRendererProcessReuse = false') !== -1);
    assert.ok(lab.indexOf('player.src = currentSourceUrl') > lab.indexOf("player.setAttribute('flashvars'"), 'set FlashVars before the native plugin source');
    assert.ok(launcher.indexOf("on('new-window'") !== -1);
    assert.ok(launcher.indexOf('webContents.setWindowOpenHandler(') === -1);
});
