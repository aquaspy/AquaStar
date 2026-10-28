const assert = require('assert');
const { chooseGamePresentation } = require('../../res/game-presentation.js');

test('a SWF opens in Ruffle even when an old Flash setting is still stored', () => {
  const choice = chooseGamePresentation({
    looksLikeSwf: true,
    wrap: { preferDirectWmode: true, ruffleEligible: true, wmode: 'opaque', scale: 'showall' },
    standalone: false,
    renderMode: 'flash',
    ruffleEligible: false,
    useDirectWmode: false
  });
  assert.deepStrictEqual(choice, { kind: 'ruffle' });
});

test('a standalone SWF opens in Ruffle', () => {
  const choice = chooseGamePresentation({
    looksLikeSwf: true,
    wrap: { preferDirectWmode: true },
    standalone: true,
    renderMode: 'flash',
    ruffleEligible: false,
    useDirectWmode: true
  });
  assert.deepStrictEqual(choice, { kind: 'ruffle' });
});

test('an HTML page is not sent to Ruffle', () => {
  const choice = chooseGamePresentation({
    looksLikeSwf: false,
    wrap: { preferDirectWmode: true, ruffleEligible: true },
    standalone: false,
    renderMode: 'ruffle',
    ruffleEligible: true,
    useDirectWmode: false
  });
  assert.deepStrictEqual(choice, { kind: 'raw' });
});
