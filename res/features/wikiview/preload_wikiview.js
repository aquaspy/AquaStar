const { contextBridge, ipcRenderer } = require("electron");

// Bridge for WikiView (see wikiviewsource.js). The wiki preview needs to fetch
// AQW Wiki pages even when the current window's origin is account.aq.com, which
// a renderer-side fetch() can't do cross-origin. The main process does the actual
// HTTP request instead (see 'fetchWikiPage' handler in const.js) and hands the
// raw HTML back here.
contextBridge.exposeInMainWorld("aquastarWiki", {
  fetchWikiPage: (url) => ipcRenderer.invoke("fetchWikiPage", url)
});
