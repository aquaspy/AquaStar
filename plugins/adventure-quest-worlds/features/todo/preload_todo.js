const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aquastarTodo", {
  getTodo:     () => ipcRenderer.invoke("getTodo"),
  getMessages: () => ipcRenderer.invoke("getTodoMessages"),
  saveTodo:    (state) => ipcRenderer.invoke("saveTodo", state),
  openLink:    (url) => ipcRenderer.send("todoOpenLink", url),
  copyText:    (text) => ipcRenderer.send("todoCopyText", text)
});
