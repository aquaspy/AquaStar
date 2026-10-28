'use strict';

function chooseGamePresentation(opts) {
    if (opts && opts.looksLikeSwf) return { kind: 'ruffle' };
    return { kind: 'raw' };
}

module.exports = { chooseGamePresentation };
