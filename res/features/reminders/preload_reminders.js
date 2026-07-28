const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aquastarReminders", {
  getReminders:  () => ipcRenderer.invoke("getReminders"),
  getMessages:   () => ipcRenderer.invoke("getRemindersMessages"),
  saveReminders: (state) => ipcRenderer.invoke("saveReminders", state),
  copyText:      (text) => ipcRenderer.send("remindersCopyText", text)
});
