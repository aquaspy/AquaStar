const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aquastarInventory", {
  getInventory: () => ipcRenderer.invoke("getInventory"),
  getMessages:  () => ipcRenderer.invoke("getInventoryMessages"),
  syncNow:      () => ipcRenderer.invoke("syncInventoryNow"),
  setActiveChar: (charId) => ipcRenderer.invoke("setInventoryActiveChar", charId),
  openItemWiki: (itemName) => ipcRenderer.invoke("openInventoryItemWiki", itemName)
});

// Re-exposed so hoverPreview.js (res/features/wikiview/hoverPreview.js, loaded directly by
// inventory.html) can fetch wiki pages the same way it does when injected into wiki/account
// windows - the 'fetchWikiPage' IPC handler (res/ipc/wikiFetch.js) is already registered
// globally, this just gives this window's renderer a bridge to reach it too.
contextBridge.exposeInMainWorld("aquastarWiki", {
  fetchWikiPage: (url) => ipcRenderer.invoke("fetchWikiPage", url),
  matchWikiItems: (titles) => ipcRenderer.invoke("matchWikiItems", titles)
});
