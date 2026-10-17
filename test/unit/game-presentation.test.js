const assert = require('assert');
const { chooseGamePresentation } = require('../../res/game-presentation.js');

const aqw = { preferDirectWmode: true, ruffleEligible: true };

test('macOS Flash embeds the SWF with opaque wmode when direct wmode is off', () => {
  const choice = chooseGamePresentation({
    looksLikeSwf: true,
    wrap: aqw,
    standalone: false,
    renderMode: 'flash',
    ruffleEligible: true,
    useDirectWmode: false
  });
  assert.deepStrictEqual(choice, { kind: 'embed', wmode: 'opaque', scale: 'showall' });
});

test('direct wmode still uses the wrapper default', () => {
  const choice = chooseGamePresentation({
    looksLikeSwf: true,
    wrap: aqw,
    standalone: false,
    renderMode: 'flash',
    ruffleEligible: true,
    useDirectWmode: true
  });
  assert.deepStrictEqual(choice, { kind: 'embed', wmode: null, scale: null });
});

test('Ruffle wins over the Flash embed', () => {
  const choice = chooseGamePresentation({
    looksLikeSwf: true,
    wrap: aqw,
    standalone: false,
    renderMode: 'ruffle',
    ruffleEligible: true,
    useDirectWmode: false
  });
  assert.deepStrictEqual(choice, { kind: 'ruffle' });
});

test('an explicit wrap is kept when direct wmode is off', () => {
  const choice = chooseGamePresentation({
    looksLikeSwf: true,
    wrap: { wmode: 'opaque', scale: 'showall' },
    standalone: true,
    renderMode: 'flash',
    ruffleEligible: true,
    useDirectWmode: false
  });
  assert.deepStrictEqual(choice, { kind: 'embed', wmode: 'opaque', scale: 'showall' });
});

test('preferDirectWmode false leaves a SWF as the document', () => {
  const choice = chooseGamePresentation({
    looksLikeSwf: true,
    wrap: { preferDirectWmode: false },
    standalone: false,
    renderMode: 'flash',
    ruffleEligible: false,
    useDirectWmode: false
  });
  assert.deepStrictEqual(choice, { kind: 'raw' });
});

test('a standalone SWF without an explicit wrap stays raw', () => {
  const choice = chooseGamePresentation({
    looksLikeSwf: true,
    wrap: { preferDirectWmode: true },
    standalone: true,
    renderMode: 'flash',
    ruffleEligible: false,
    useDirectWmode: true
  });
  assert.deepStrictEqual(choice, { kind: 'raw' });
});

test('an HTML page is never embedded as Flash', () => {
  const choice = chooseGamePresentation({
    looksLikeSwf: false,
    wrap: aqw,
    standalone: false,
    renderMode: 'flash',
    ruffleEligible: false,
    useDirectWmode: false
  });
  assert.deepStrictEqual(choice, { kind: 'raw' });
});
