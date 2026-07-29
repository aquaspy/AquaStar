const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aquastarSettings", {
  getKeybindings:   () => ipcRenderer.invoke("getKeybindings"),
  getMessages:      () => ipcRenderer.invoke("getSettingsMessages"),
  saveKeybindings:  (binds) => ipcRenderer.invoke("saveKeybindings", binds),
  restartApp:       () => ipcRenderer.send("restartApp"),
  getCustomSwfStatus: () => ipcRenderer.invoke("getCustomSwfStatus"),
  chooseCustomSwf:    () => ipcRenderer.invoke("chooseCustomSwf"),
  removeCustomSwf:    () => ipcRenderer.invoke("removeCustomSwf"),
  platform:         process.platform
});
