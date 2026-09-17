// Injection demo for the example plugin.
// Intentionally does NOT inject into github.com — mutating live GitHub pages
// (or their request headers) reliably breaks layout/hydration.
// Demo target is a local HTML page shipped with the plugin.

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
        if (!tipsEnabled()) return;
        if (typeof ctx.executeJavaScriptSafely !== 'function') return;

        const script =
            '(function () {' +
            '  if (window.__aquastarExampleInjected) return false;' +
            '  var el = document.getElementById("inject-status");' +
            '  if (!el) return false;' +
            '  el.textContent = "Injection OK — navigation hook ran from example-companion";' +
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
