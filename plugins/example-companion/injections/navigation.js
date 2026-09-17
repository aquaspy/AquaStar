// Lightweight GitHub tip injection. Kept intentionally tiny so it cannot
// disturb GitHub's React layout (Shadow DOM chip, no document reflow).

function createNavigationHooks(host) {
    function tipsEnabled() {
        try {
            const settings = host && typeof host.getPlatformSettings === 'function'
                ? (host.getPlatformSettings() || {})
                : {};
            // Default on when unset; explicit false disables.
            return settings.demoShowTips !== false;
        } catch (e) {
            return true;
        }
    }

    function classify(url) {
        if (typeof url !== 'string') return 'other';
        // Only the AquaStar repo — never all of github.com.
        if (/github\.com\/aquaspy\/AquaStar(?:\/|$|\?|#)/i.test(url)) {
            return 'aquastar-github';
        }
        return 'other';
    }

    async function onDidFinishLoad(ctx) {
        if (ctx.isGameWindow) return;
        if (classify(ctx.url) !== 'aquastar-github') return;
        if (!tipsEnabled()) return;
        if (typeof ctx.executeJavaScriptSafely !== 'function') return;

        // Isolated chip: shadow DOM, fixed, no layout participation, dismissible.
        const script =
            '(function () {' +
            '  if (window.__aquastarExampleBanner) return false;' +
            '  if (document.getElementById("aquastar-example-chip-host")) return false;' +
            '  var host = document.createElement("div");' +
            '  host.id = "aquastar-example-chip-host";' +
            '  host.setAttribute("data-aquastar-example", "1");' +
            '  host.style.cssText = "all:initial;position:fixed;z-index:2147483646;' +
            'right:16px;bottom:16px;width:auto;height:auto;margin:0;padding:0;' +
            'border:0;pointer-events:none;display:block;";' +
            '  var root = host.attachShadow({ mode: "open" });' +
            '  var chip = document.createElement("div");' +
            '  chip.setAttribute("role", "status");' +
            '  chip.style.cssText = "pointer-events:auto;display:inline-flex;align-items:center;' +
            'gap:8px;max-width:280px;background:#161b22;color:#7ee787;border:1px solid #30363d;' +
            'border-radius:999px;padding:6px 8px 6px 12px;font:12px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;' +
            'box-shadow:0 8px 24px rgba(0,0,0,.35);";' +
            '  var text = document.createElement("span");' +
            '  text.textContent = "AquaStar example plugin";' +
            '  var btn = document.createElement("button");' +
            '  btn.type = "button";' +
            '  btn.setAttribute("aria-label", "Dismiss");' +
            '  btn.textContent = "×";' +
            '  btn.style.cssText = "all:unset;cursor:pointer;color:#8b949e;font-size:14px;' +
            'line-height:1;padding:2px 6px;border-radius:999px;";' +
            '  btn.onmouseenter = function () { btn.style.color = "#e6edf3"; };' +
            '  btn.onmouseleave = function () { btn.style.color = "#8b949e"; };' +
            '  btn.onclick = function (ev) {' +
            '    ev.preventDefault(); ev.stopPropagation();' +
            '    if (host.parentNode) host.parentNode.removeChild(host);' +
            '    window.__aquastarExampleBanner = true;' +
            '  };' +
            '  chip.appendChild(text);' +
            '  chip.appendChild(btn);' +
            '  root.appendChild(chip);' +
            '  (document.body || document.documentElement).appendChild(host);' +
            '  window.__aquastarExampleBanner = true;' +
            '  return true;' +
            '})();';

        await ctx.executeJavaScriptSafely(script, 'Example companion tip chip');
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
