const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('Ruffle updater exposes stable and nightly channels without labelling every update as nightly', () => {
    const settings = fs.readFileSync(path.join(__dirname, '../../res/features/settings/settings.html'), 'utf8');
    const updater = fs.readFileSync(path.join(__dirname, '../../res/ruffleUpdate.js'), 'utf8');
    const english = fs.readFileSync(path.join(__dirname, '../../res/po/en-US.js'), 'utf8');

    assert.ok(updater.indexOf("LATEST_URL = 'https://api.github.com/repos/ruffle-rs/ruffle/releases/latest'") !== -1);
    assert.ok(updater.indexOf("channel === 'nightly' ? RELEASES_URL : LATEST_URL") !== -1);
    assert.ok(settings.indexOf("buildSelectOptionRow('ruffleUpdateChannel'") < settings.indexOf('updateRow, buildBooleanOptionRow'));
    assert.ok(english.indexOf('ruffleUpdateLabel      : "Update Ruffle"') !== -1);
    assert.ok(english.indexOf('Downloads Ruffle\'s self-hosted web build from its official GitHub nightly release') === -1);
});
