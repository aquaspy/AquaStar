// AQW navigation classification + did-finish-load injections (PR 5).
const fs = require('fs');
const path = require('path');

function createNavigationHooks(options) {
    options = options || {};
    const featuresRoot = options.featuresRoot ||
        path.join(__dirname, '..', 'features');

    function classify(url) {
        if (typeof url !== 'string') return 'other';
        if (/aqwwiki\.wikidot\.com\/.+/i.test(url)) return 'wiki';
        if (/account\.aq\.com\/CharPage\?id=.+/i.test(url)) return 'charpage';
        if (/account\.aq\.com\/AQW\/(Inventory|BuyBack|WheelProgress|House)/i.test(url)) {
            return 'account-aqw';
        }
        if (/^https?:\/\/account\.aq\.com\/Login(?:\/|$)/i.test(url)) return 'account-login';
        if (/^https?:\/\/account\.aq\.com(?:\/|$)/i.test(url)) return 'account';
        if (/^https?:\/\/(?:www\.)?aq\.com(?:\/|$)/i.test(url)) return 'aq-home';
        if (/^https?:\/\/aqwwiki\.wikidot\.com(?:\/|$)/i.test(url)) return 'wiki-root';
        return 'other';
    }

    async function onDidFinishLoad(ctx) {
        const url = ctx.url;
        const kind = classify(url);
        const execute = ctx.executeJavaScriptSafely;
        if (typeof execute !== 'function') return;
        if (ctx.isGameWindow) return;

        function testAndDelete(testURL, objName, isClass) {
            if (url.indexOf(testURL) === -1) return;
            const codeTest = isClass
                ? "(document.getElementsByClassName('" + objName + "')[0] == undefined)? false : true"
                : "(document.getElementById('" + objName + "') == undefined)? false : true;";
            return execute(codeTest, 'Page cleanup check').then(function (popUpExists) {
                if (!popUpExists) return;
                const codeNuke = isClass
                    ? "document.getElementsByClassName('" + objName + "')[0].innerHTML = ''"
                    : "document.getElementById('" + objName + "').innerHTML = ''";
                return execute(codeNuke, 'Page cleanup');
            });
        }

        if (kind === 'wiki' || kind === 'wiki-root') {
            await testAndDelete('wikidot', 'ncmp__tool', false);
            await testAndDelete('wikidot', 'wad-aqwwiki-above-content', false);
            await testAndDelete('wikidot', 'wad-aqwwiki-below-content', false);
            await execute(
                "var rem = document.getElementsByTagName('iframe');" +
                "for (var i=0;i<rem.length;i++) rem[i].remove()",
                'Wiki frame cleanup'
            );
        }

        if (kind === 'aq-home') {
            await testAndDelete('aq.com', 'fb-page', true);
        }

        const isViewUrl = kind === 'wiki' || kind === 'charpage' || kind === 'account-aqw';
        if (isViewUrl) {
            const wikiviewDir = path.join(featuresRoot, 'wikiview');
            const nameVariants = fs.readFileSync(path.join(wikiviewDir, 'nameVariants.js'), 'utf8');
            const hoverPreview = fs.readFileSync(path.join(wikiviewDir, 'hoverPreview.js'), 'utf8');
            const wikiviewSource = fs.readFileSync(path.join(wikiviewDir, 'wikiviewsource.js'), 'utf8');
            var wikiview = nameVariants + '\n;\n' + hoverPreview + '\n;\n' + wikiviewSource;
            if (kind === 'wiki') {
                const jquery = fs.readFileSync(path.join(wikiviewDir, 'jquery.min.js'), 'utf8');
                wikiview = jquery + '\n;\n' + wikiview;
            }
            wikiview = '(function () {\n' +
                'if (window.__aquastarWikiViewInjected) return false;\n' +
                'try {\n' + wikiview + '\n' +
                'window.__aquastarWikiViewInjected = true; return true;\n' +
                '} catch (error) { delete window.__aquastarWikiViewInjected; console.error("[AquaStar] WikiView injection failed", error); throw error; }\n' +
                '})();';
            const injected = await execute(wikiview, 'Wiki enhancement');
            if (injected) console.log('[AquaStar] Wiki enhancement injected into ' + url);
        }

        if (kind === 'account') {
            const syncBtnSrc = fs.readFileSync(
                path.join(featuresRoot, 'inventory', 'accountSyncButton.js'),
                'utf8'
            );
            await execute(syncBtnSrc, 'Account sync button');
        }
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
