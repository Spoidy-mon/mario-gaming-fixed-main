const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("barApi", {
  onUpdate: (cb) => ipcRenderer.on("update", (_, data) => cb(data)),
});
