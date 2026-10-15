const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('Ruffle updater exposes stable and nightly channels without labelling every update as nightly', () => {
  const settings = fs.readFileSync(path.join(__dirname, '../../res/features/settings/settings.html'), 'utf8');
  const updater = fs.readFileSync(path.join(__dirname, '../../res/ruffleUpdate.js'), 'utf8');
  const english = fs.readFileSync(path.join(__dirname, '../../res/po/en-US.js'), 'utf8');

  assert.ok(updater.indexOf("LATEST_URL = 'https://api.github.com/repos/ruffle-rs/ruffle/releases/latest'") !== -1);
  assert.ok(updater.indexOf("channel === 'nightly' ? RELEASES_URL : LATEST_URL") !== -1);
  assert.ok(
    settings.indexOf("buildSelectOptionRow('ruffleUpdateChannel'") <
      settings.indexOf('updateRow, buildBooleanOptionRow')
  );
  assert.ok(/ruffleUpdateLabel\s*:\s*"Update Ruffle"/.test(english));
  assert.ok(
    english.indexOf("Downloads Ruffle's self-hosted web build from its official GitHub nightly release") === -1
  );
});

test('Ruffle quality setting reaches the player with a safe default', () => {
  const root = path.join(__dirname, '../..');
  const wrapper = fs.readFileSync(path.join(root, 'res/ruffle_wrapper.html'), 'utf8');
  const constSrc = fs.readFileSync(path.join(root, 'res/const.js'), 'utf8');
  assert.ok(/quality: quality/.test(wrapper));
  assert.ok(wrapper.indexOf("/^(high|medium|low)$/") !== -1);
  assert.ok(/ruffleQuality:\s*'high'/.test(constSrc));
  assert.ok(constSrc.indexOf("'&quality=' + encodeURIComponent(exports.normalizeRuffleQuality(quality))") !== -1);
});
