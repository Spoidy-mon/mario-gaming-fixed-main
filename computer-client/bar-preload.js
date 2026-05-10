const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("barApi", {
  onUpdate: (cb) => ipcRenderer.on("update", (_, data) => cb(data)),
  setMousePass: (pass) => ipcRenderer.send("bar-mouse-pass", pass),
});