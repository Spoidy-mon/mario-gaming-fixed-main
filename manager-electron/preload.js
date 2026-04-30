const { contextBridge } = require("electron");

// Expose minimal API to renderer if needed in future
contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  version:  process.versions.electron,
});
