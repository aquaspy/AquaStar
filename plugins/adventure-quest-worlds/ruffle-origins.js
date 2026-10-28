// Pages that may fetch the bundled Ruffle player (aquastar://ruffle/).
// "null" is the opaque origin of this plugin's own file:// studio and capture pages.
const path = require('path');

const origins = [
    'https://account.aq.com',
    'https://www.aq.com',
    'https://aq.com',
    'https://game.aq.com',
    'null'
];

function install(ruffleDir) {
    const ruffleOrigin = require('../../res/platform/ruffle-origin.js');
    ruffleOrigin.allowOrigins(origins);
    ruffleOrigin.install(ruffleDir || path.join(__dirname, '..', '..', 'res', 'ruffle'));
}

module.exports = origins;
module.exports.install = install;
