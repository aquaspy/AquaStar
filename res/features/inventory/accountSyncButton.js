// Floating "Sync Now" button for account.aq.com.  Account pages may hydrate or replace
// their body after Electron's did-finish-load event, so this installer deliberately waits
// for a body and keeps restoring the button if that later replacement removes it.
(function () {
    function install() {
        if (window.__aquastarSyncButtonInstaller) {
            window.__aquastarSyncButtonInstaller();
            return;
        }

        var defaultText = 'AquaStar: Sync Now';
        var ensureTimer = null;

        function ensureButton() {
            ensureTimer = null;
            if (!document.body || !window.aquastarWiki ||
                typeof window.aquastarWiki.syncInventoryNow !== 'function') return;
            if (document.getElementById('aquastarSyncBtn')) return;

            var btn = document.createElement('button');
            btn.id = 'aquastarSyncBtn';
            btn.textContent = defaultText;
            btn.style.cssText = 'position:fixed; top:12px; right:12px; z-index:99999; ' +
                'background:#2b6fce; color:#fff; border:1px solid #2b6fce; border-radius:4px; ' +
                'padding:8px 14px; font-family:sans-serif; font-size:13px; cursor:pointer; ' +
                'box-shadow:0 2px 8px rgba(0,0,0,0.4);';

            btn.onclick = function () {
                btn.disabled = true;
                btn.textContent = 'AquaStar: Syncing...';
                window.aquastarWiki.syncInventoryNow().then(function (result) {
                    btn.disabled = false;
                    btn.textContent = (result && result.ok) ? 'AquaStar: Synced!' : 'AquaStar: Sync Failed';
                    setTimeout(function () { btn.textContent = defaultText; }, 2500);
                }).catch(function () {
                    btn.disabled = false;
                    btn.textContent = 'AquaStar: Sync Failed';
                    setTimeout(function () { btn.textContent = defaultText; }, 2500);
                });
            };
            document.body.appendChild(btn);
        }

        function scheduleEnsure() {
            if (ensureTimer !== null) return;
            ensureTimer = setTimeout(ensureButton, 0);
        }

        window.__aquastarSyncButtonInstaller = scheduleEnsure;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', scheduleEnsure, { once: true });
        }
        scheduleEnsure();
        // Aq.com occasionally renders a shell first and swaps its contents afterwards.
        // Observing the root covers a replacement of <body> itself as well as normal
        // client-side navigation, without duplicating a button that already exists.
        new MutationObserver(scheduleEnsure).observe(document.documentElement, {
            childList: true,
            subtree: true
        });
        [100, 500, 1500].forEach(function (delay) { setTimeout(scheduleEnsure, delay); });
    }

    install();
})();
