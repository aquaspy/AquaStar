// Injection demo for the example plugin.
// Local inject-demo page only — never mutate github.com.

const path = require('path');
const url = require('url');

function demoPageUrl() {
    return url.pathToFileURL(
        path.join(__dirname, '..', 'features', 'inject-demo', 'inject-demo.html')
    ).href;
}

function createNavigationHooks(host) {
    function tipsEnabled() {
        try {
            const settings = host && typeof host.getPlatformSettings === 'function'
                ? (host.getPlatformSettings() || {})
                : {};
            return settings.demoShowTips !== false;
        } catch (e) {
            return true;
        }
    }

    function classify(urlStr) {
        if (typeof urlStr !== 'string') return 'other';
        if (urlStr.indexOf('inject-demo.html') !== -1) return 'inject-demo';
        return 'other';
    }

    async function onDidFinishLoad(ctx) {
        if (ctx.isGameWindow) return;
        if (classify(ctx.url) !== 'inject-demo') return;
        if (typeof ctx.executeJavaScriptSafely !== 'function') return;

        const msg = (host && typeof host.getLocaleStrings === 'function')
            ? (host.getLocaleStrings('injectDemoMessages') || {})
            : {};

        const applyScript =
            '(function () {' +
            '  var msg = ' + JSON.stringify({
                title: msg.title || 'Injection demo page',
                heading: msg.heading || 'Injection demo page',
                body: msg.body || '',
                waiting: msg.waiting || 'Waiting for navigation hook…',
                ok: msg.ok || 'Injection OK'
            }) + ';' +
            '  if (typeof window.__aquastarInjectDemoApply === "function") {' +
            '    window.__aquastarInjectDemoApply(msg);' +
            '  }' +
            '  return true;' +
            '})();';
        await ctx.executeJavaScriptSafely(applyScript, 'Example inject-demo i18n');

        if (!tipsEnabled()) return;

        const okText = JSON.stringify(msg.ok || 'Injection OK — navigation hook ran from example-companion');
        const script =
            '(function () {' +
            '  if (window.__aquastarExampleInjected) return false;' +
            '  var el = document.getElementById("inject-status");' +
            '  if (!el) return false;' +
            '  el.textContent = ' + okText + ';' +
            '  el.className = "ok";' +
            '  window.__aquastarExampleInjected = true;' +
            '  return true;' +
            '})();';

        await ctx.executeJavaScriptSafely(script, 'Example inject-demo status');
    }

    return {
        classify: classify,
        onDidFinishLoad: onDidFinishLoad,
        allowChildWindow: function () { return true; },
        demoPageUrl: demoPageUrl
    };
}

module.exports = {
    createNavigationHooks: createNavigationHooks,
    demoPageUrl: demoPageUrl
};
