/**
 * Preload bridge — the only renderer-facing surface (docs/desktop-spec.md).
 * Electron 45+: sandboxed preloads are plain scripts (no ESM). Use require('electron') only.
 * Named functions only; never expose ipcRenderer.
 */
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("eap", {
  chooseWorkspace: () => ipcRenderer.invoke("eap:chooseWorkspace"),
  getPlatformInfo: () => ipcRenderer.invoke("eap:getPlatformInfo"),
  openExternal: (url) => ipcRenderer.invoke("eap:openExternal", url),
  showNotification: (input) => ipcRenderer.invoke("eap:showNotification", input),
});
