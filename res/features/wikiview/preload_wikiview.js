const { contextBridge, ipcRenderer } = require("electron");

// Bridge for WikiView (see wikiviewsource.js). The wiki preview needs to fetch
// AQW Wiki pages even when the current window's origin is account.aq.com, which
// a renderer-side fetch() can't do cross-origin. The main process does the actual
// HTTP request instead (see 'fetchWikiPage' handler in const.js) and hands the
// raw HTML back here.
contextBridge.exposeInMainWorld("aquastarWiki", {
  fetchWikiPage: (url) => ipcRenderer.invoke("fetchWikiPage", url),
  // Used by the floating "Sync Now" button injected on account.aq.com/Home
  // (res/features/inventory/accountSyncButton.js) - see res/features/inventory/inventory.js
  // for the 'syncInventoryNow' handler itself.
  syncInventoryNow: () => ipcRenderer.invoke("syncInventoryNow"),
  // Used by wikiviewsource.js's ownership badge + character-switcher chip on wiki item
  // pages - see res/features/inventory/inventory.js for all three handlers.
  getInventory: () => ipcRenderer.invoke("getInventory"),
  setInventoryActiveChar: (charId) => ipcRenderer.invoke("setInventoryActiveChar", charId),
  matchWikiItem: (title) => ipcRenderer.invoke("matchWikiItem", title),
  matchWikiItems: (titles) => ipcRenderer.invoke("matchWikiItems", titles)
});
