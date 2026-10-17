'use strict';

// How a game URL is opened.
//
// useDirectWmode false (the macOS default, so F2 can capture the window) is a
// legitimate state. The SWF still has to be an HTML embed. A top-level SWF
// navigation sizes the Pepper plugin from the movie's preferred size, and on a
// Retina display that size is the stage divided by devicePixelRatio twice.
// Width 100% can still stretch, but the height falls back to that preferred
// size, so a 960x550 movie sits in a strip about 240x137 at the top of the
// window. An embed with a definite height does not use the preferred size.

function chooseGamePresentation(opts) {
  const wrap = (opts && opts.wrap) || null;
  const looksLikeSwf = !!(opts && opts.looksLikeSwf);
  if (opts && opts.renderMode === 'ruffle' && opts.ruffleEligible) {
    return { kind: 'ruffle' };
  }
  if (looksLikeSwf && wrap && (wrap.wmode || wrap.scale)) {
    return { kind: 'embed', wmode: wrap.wmode || null, scale: wrap.scale || null };
  }
  if (looksLikeSwf && opts && !opts.standalone && !(wrap && wrap.preferDirectWmode === false)) {
    if (opts.useDirectWmode) return { kind: 'embed', wmode: null, scale: null };
    return { kind: 'embed', wmode: 'opaque', scale: 'showall' };
  }
  return { kind: 'raw' };
}

module.exports = { chooseGamePresentation };
