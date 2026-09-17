function createNavigationHooks() {
    function classify(url) {
        if (typeof url !== 'string') return 'other';
        if (/github\.com\/aquaspy\/AquaStar/i.test(url)) return 'aquastar-github';
        if (/github\.com/i.test(url)) return 'github';
        return 'other';
    }

    async function onDidFinishLoad(ctx) {
        if (ctx.isGameWindow) return;
        const kind = classify(ctx.url);
        if (kind !== 'aquastar-github' && kind !== 'github') return;
        if (typeof ctx.executeJavaScriptSafely !== 'function') return;

        const banner =
            '(function(){' +
            'if (window.__aquastarExampleBanner) return false;' +
            'var el=document.createElement("div");' +
            'el.textContent="AquaStar Example Companion — plugin injection active";' +
            'el.style.cssText="position:fixed;z-index:999999;left:12px;bottom:12px;' +
            'background:#1b1b1b;color:#7fd08a;border:1px solid #2c2c2c;border-radius:6px;' +
            'padding:8px 12px;font:12px/1.4 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4)";' +
            'document.documentElement.appendChild(el);' +
            'window.__aquastarExampleBanner=true;return true;' +
            '})();';

        await ctx.executeJavaScriptSafely(banner, 'Example companion banner');
    }

    return {
        classify: classify,
        onDidFinishLoad: onDidFinishLoad,
        allowChildWindow: function () { return true; }
    };
}

module.exports = {
    createNavigationHooks: createNavigationHooks
};
