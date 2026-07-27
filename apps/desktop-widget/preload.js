const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mogciaDesktop", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (input) => ipcRenderer.invoke("settings:save", input),
  apiRequest: (input) => ipcRenderer.invoke("api:request", input),
  openWeb: (path) => ipcRenderer.invoke("web:open", path),
  close: () => ipcRenderer.invoke("window:close"),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  pin: (alwaysOnTop) => ipcRenderer.invoke("window:pin", alwaysOnTop),
  setLaunchAtLogin: (launchAtLogin) => ipcRenderer.invoke("window:launch-at-login", launchAtLogin)
});
