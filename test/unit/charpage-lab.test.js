const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('Char Page Studio loads an explicitly requested Char Page into native Flash controls', () => {
  const lab = fs.readFileSync(path.join(__dirname, '../../res/features/charpage/lab/characterB-lab.html'), 'utf8');
  [
    'player-name',
    'load-character',
    'character-load-row',
    "initialFlashVars = ''",
    'colorDefinitions',
    'intColorHair',
    'intColorSkin',
    'intColorEye',
    'intColorBase',
    'intColorTrim',
    'intColorAccessory',
    'studioVisibilityDefinitions',
    'studioShowIdentity',
    'studioShowProfileButton',
    'studioShowCosmeticsButton',
    'studioShowBackground',
    'show-weapon',
    'items/swords/unarmed.swf',
    'strCustWeaponFile',
    'bgindex',
    'max="31"',
    'scene-mode',
    'empty-scene',
    'scene-background-color',
    'studioBackgroundColor',
    'scene-options',
    'empty-scene-fps',
    'studioFrameRate',
    '24 FPS (AQW)',
    'studioApi.loadCharacter',
    'studioApi.getDefaults',
    'studioApi.getRendererConfig',
    'studioApi.capturePreview',
    'studioApi.captureGif',
    'gif-fps',
    'gif-colors',
    'value="60"',
    'value="64"',
    'value="128"',
    'value="256"',
    'value="15"',
    'value="30"',
    'maior tamanho que o monitor permite',
    'Salvar print PNG',
    'application/x-shockwave-flash',
    'FlashVars',
    "flashVarString = '&' + parameters.toString()",
    'Opções avançadas',
    'Classe e armadura',
    'Cabelo e elmo',
    'Armas',
    'Pet e cenário',
    'function changeParam',
    'function removeParam',
    'sidebar-controls',
    'preview-pane',
    'flash-frame',
    'activePlayer.width = String(width)',
    'function resizePreview',
    'nativeMovieWidth = 715',
    'nativeMovieHeight = 455',
    "window.addEventListener('resize', resizePreview)"
  ].forEach((fragment) => {
    assert.ok(lab.indexOf(fragment) !== -1, 'laboratory must contain ' + fragment);
  });
  assert.ok(lab.indexOf('if (!currentSourceUrl || !flashvars.value)') !== -1);
  assert.ok(lab.indexOf('function writeParams(params, advancedGroup)') !== -1);
  assert.ok(lab.indexOf('function syncDirectControls(params)') !== -1);
  assert.ok(lab.indexOf('function renderAdvancedGroup(title, params)') !== -1);
  const writeParamsBody = lab.slice(lab.indexOf('function writeParams'), lab.indexOf('function changeParam'));
  assert.ok(
    writeParamsBody.indexOf('syncControls(params)') === -1,
    'ordinary field edits must not rebuild every advanced group'
  );
  assert.ok(lab.indexOf("writeParams(params, 'Armas')") !== -1, 'weapon toggle refreshes only its own advanced group');
  assert.strictEqual(lab.indexOf('studioShowBorder'), -1, 'Studio must not expose the unfinished border control');
  assert.strictEqual(lab.indexOf('Abrir DevTools'), -1, 'Studio must not expose debugging controls');
  assert.strictEqual(lab.indexOf('Diagnóstico'), -1, 'Studio must not expose diagnostics');
  const bridge = fs.readFileSync(path.join(__dirname, '../../res/features/charpage/studio.js'), 'utf8');
  const config = fs.readFileSync(path.join(__dirname, '../../res/windows/config.js'), 'utf8');
  const instances = fs.readFileSync(path.join(__dirname, '../../res/instances.js'), 'utf8');
  const menu = fs.readFileSync(path.join(__dirname, '../../res/windows/menu.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8');
  assert.ok(bridge.indexOf('charpage-studio-load-character') !== -1);
  assert.ok(bridge.indexOf('charpage-studio-capture') !== -1);
  assert.ok(bridge.indexOf('charpage-studio-open-devtools') !== -1);
  assert.ok(bridge.indexOf('charpage-studio-runtime-status') !== -1);
  assert.ok(bridge.indexOf('extractCharPageData') !== -1);
  assert.ok(bridge.indexOf("'characterB-studio.swf'") !== -1, 'Studio uses its packaged SWF');
  assert.ok(bridge.indexOf('studioAssetBaseUrl') !== -1, 'local Studio SWF receives its AQW asset root');
  assert.ok(bridge.indexOf('interceptBufferProtocol') === -1, 'Studio must not replace the default HTTPS session');
  assert.ok(bridge.indexOf('.filterResponseData(') === -1, 'Electron 11 does not provide filterResponseData');
  assert.ok(config.indexOf('charPageStudioConfig') !== -1);
  assert.ok(config.indexOf('plugins: true') !== -1);
  assert.ok(config.indexOf('sandbox: false') !== -1);
  assert.ok(config.indexOf('studio.deactivateProtocol()') !== -1);
  assert.ok(instances.indexOf('openCharPageStudioWindow') !== -1);
  assert.ok(menu.indexOf('menuCharPageStudio') !== -1);
  assert.ok(main.indexOf("require('./res/features/charpage/studio.js')") !== -1);
  const studioSwf = fs.readFileSync(path.join(__dirname, '../../res/features/charpage/characterB-studio.swf'));
  assert.ok(
    ['CWS', 'FWS'].indexOf(studioSwf.slice(0, 3).toString('ascii')) !== -1,
    'bundled Studio asset must be a valid SWF'
  );
  const emptySceneSwf = fs.readFileSync(path.join(__dirname, '../../res/features/charpage/characterB-empty-scene.swf'));
  assert.ok(
    ['CWS', 'FWS', 'ZWS'].indexOf(emptySceneSwf.slice(0, 3).toString('ascii')) !== -1,
    'bundled Empty Scene asset must be a valid SWF'
  );
  assert.strictEqual(emptySceneSwf[3], 15, 'Empty Scene must target the bundled Flash 32 runtime');
  const emptySceneReadme = fs.readFileSync(
    path.join(__dirname, '../../res/features/charpage/empty-scene/README.md'),
    'utf8'
  );
  const emptySceneBuild = fs.readFileSync(
    path.join(__dirname, '../../res/features/charpage/empty-scene/build-empty-scene.ps1'),
    'utf8'
  );
  assert.ok(
    emptySceneReadme.indexOf('SWF2PNG') !== -1 && emptySceneReadme.indexOf('version=15') !== -1,
    'Empty Scene must document provenance and target'
  );
  assert.ok(
    emptySceneBuild.indexOf('-importScript') !== -1 && emptySceneBuild.indexOf('-set version 15') !== -1,
    'Empty Scene must have a reproducible FFDec build'
  );
  const studioProcess = fs.readFileSync(path.join(__dirname, '../../scripts/charpage-studio-process.js'), 'utf8');
  assert.ok(
    studioProcess.indexOf('characterB-empty-scene.swf') !== -1,
    'dedicated Studio process must serve the Empty Scene SWF'
  );
  assert.ok(
    studioProcess.indexOf('charpage-studio-renderer-config') !== -1,
    'dedicated Studio process must select the requested renderer'
  );
  assert.ok(
    studioProcess.indexOf('Menu.setApplicationMenu(null)') !== -1 &&
      studioProcess.indexOf('studioWindow.setMenu(null)') !== -1,
    'dedicated Studio window must not create its own menu'
  );
  assert.ok(
    studioProcess.indexOf('icon: constant.iconPath') !== -1,
    'dedicated Studio window must use the AquaStar icon'
  );
  assert.ok(
    studioProcess.indexOf('charpage-studio-messages') !== -1,
    'dedicated Studio process must provide localized UI strings'
  );
  const preloadLab = fs.readFileSync(path.join(__dirname, '../../res/features/charpage/lab/preload_lab.js'), 'utf8');
  assert.ok(
    preloadLab.indexOf('getRendererConfig') !== -1,
    'renderer selection must cross the isolated preload bridge'
  );
  assert.ok(
    preloadLab.indexOf('getMessages') !== -1,
    'localized Studio strings must cross the isolated preload bridge'
  );
  assert.ok(preloadLab.indexOf('capturePreview') !== -1, 'capture must cross the isolated preload bridge');
  assert.ok(
    studioProcess.indexOf('charpage-studio-capture-preview') !== -1,
    'dedicated Studio process must create the preview capture'
  );
  assert.ok(
    studioProcess.indexOf("'--charpage-studio-capture'") !== -1,
    'capture must use its dedicated renderer process'
  );
  const captureProcess = fs.readFileSync(
    path.join(__dirname, '../../scripts/charpage-studio-capture-process.js'),
    'utf8'
  );
  assert.ok(captureProcess.indexOf('await delay(5000)') !== -1, 'high-resolution capture must wait for AQW assets');
  assert.ok(
    captureProcess.indexOf('movieRatio = 715 / 455') !== -1,
    'capture must preserve the original Char Page proportion'
  );
  assert.ok(
    captureProcess.indexOf('image.crop(pixelRect)') !== -1,
    'capture must trim the fitted Flash area from the monitor-sized framebuffer'
  );
  assert.ok(
    fs
      .readFileSync(path.join(__dirname, '../../res/features/charpage/lab/capture.html'), 'utf8')
      .indexOf('application/x-shockwave-flash') !== -1,
    'capture page must render native Flash'
  );
  assert.ok(
    lab.indexOf("var movieUrl = renderer.swfUrl + '?v=2&' + parameters.toString()") !== -1,
    'pass FlashVars through the selected renderer URL for Pepper Flash'
  );
  assert.ok(
    lab.indexOf("player.setAttribute('flashvars', flashVarString)") !== -1,
    'pass FlashVars directly to the PPAPI embed'
  );
  assert.ok(
    lab.indexOf('player.src = movieUrl') > lab.indexOf("player.setAttribute('flashvars', flashVarString)"),
    'set FlashVars before the native plugin source'
  );
  assert.ok(config.indexOf("on('new-window'") !== -1);
  assert.ok(config.indexOf('webContents.setWindowOpenHandler(') === -1);
  ['en-US.js', 'pt-BR.js', 'template.js'].forEach((localeName) => {
    const messages = fs.readFileSync(path.join(__dirname, '../../res/po', localeName), 'utf8');
    assert.ok(messages.indexOf('charPageStudioMessages') !== -1, localeName + ' must define Char Page Studio strings');
  });
});
