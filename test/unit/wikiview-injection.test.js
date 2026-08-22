const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('WikiView injection is retryable and supports hydrated Wiki content', () => {
    const instances = fs.readFileSync(path.join(__dirname, '../../res/instances.js'), 'utf8');
    const source = fs.readFileSync(path.join(__dirname, '../../res/features/wikiview/wikiviewsource.js'), 'utf8');
    const hover = fs.readFileSync(path.join(__dirname, '../../res/features/wikiview/hoverPreview.js'), 'utf8');
    const wikiFetch = fs.readFileSync(path.join(__dirname, '../../res/ipc/wikiFetch.js'), 'utf8');

    assert.ok(instances.indexOf('if (bWiki){') !== -1, 'Wiki pages load AquaStar jQuery');
    assert.ok(instances.indexOf('try {\\n') !== -1, 'injection is guarded transactionally');
    assert.ok(instances.indexOf('delete window.__aquastarWikiViewInjected') !== -1, 'failed injection can retry');
    assert.ok(instances.indexOf('window.__aquastarWikiViewInjected = true; return true;') !== -1, 'success is marked only after source execution');
    assert.ok(source.indexOf("$(document).on('mouseover.aquastarWikiView'") !== -1, 'hover uses delegated events');
    assert.ok(source.indexOf("$(document).off('.aquastarWikiView')") !== -1, 'reinjection does not stack handlers');
    assert.ok(hover.indexOf('function isAqwWikiUrl(link)') !== -1, 'hover accepts both HTTP and HTTPS Wiki links');
    assert.ok(hover.indexOf('link.startsWith("http://aqwwiki.wikidot.com/")') === -1, 'hover no longer rejects HTTPS links');
    assert.ok(wikiFetch.indexOf('request.setTimeout') === -1, 'Electron 11 net.request has no setTimeout method');
    assert.ok(wikiFetch.indexOf('const timeout = setTimeout') !== -1, 'Wiki fetch enforces a compatible timeout');
    assert.ok(wikiFetch.indexOf('clearTimeout(timeout)') !== -1, 'completed Wiki fetch clears its timeout');
});
