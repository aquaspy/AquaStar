// Floating "Sync Now" button injected on the logged-in account.aq.com/Home page (see
// res/instances.js), for people who want to trigger an Inventory/BuyBack sync without
// opening AquaStar's own Inventory window (Alt+I). Plain DOM APIs only - no jQuery needed
// for one button, and this runs on account.aq.com regardless of whether the page itself
// happens to have jQuery loaded yet.
(function () {
    if (document.getElementById('aquastarSyncBtn')) return; // avoid double-injection on reload
    if (!window.aquastarWiki || typeof window.aquastarWiki.syncInventoryNow !== 'function') return;

    var btn = document.createElement('button');
    btn.id = 'aquastarSyncBtn';
    var defaultText = 'AquaStar: Sync Now';
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
        });
    };

    document.body.appendChild(btn);
})();
