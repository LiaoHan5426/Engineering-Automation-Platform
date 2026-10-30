/**
 * Electron main process scaffold (Electron 45+).
 * Hosts OS dialogs / notifications only — no task, Agent, or domain rules.
 * First release expects a separately started local Java service (docs/running-context.md).
 *
 * Security posture (desktop-spec.md):
 * - contextIsolation / nodeIntegration:false / sandbox:true
 * - Preload must be CJS (.cjs): sandboxed preloads cannot use ESM imports (Electron 45).
 */
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DEV_URL = process.env.EAP_DESKTOP_URL || "http://127.0.0.1:5173/";

function isLocalDevUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    webPreferences: {
      // Electron 45: sandbox preload must be CJS (preload.cjs), not ESM.
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Electron 45: child windows inherit sandbox; we deny popups entirely.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!isLocalDevUrl(url)) event.preventDefault();
  });

  void win.loadURL(WEB_DEV_URL);
}

ipcMain.handle("eap:chooseWorkspace", async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose local workspace",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle("eap:getPlatformInfo", async () => ({
  shell: "electron",
  scaffold: true,
  electronMajor: Number.parseInt(process.versions.electron?.split(".")[0] ?? "0", 10),
  platform: process.platform,
  arch: process.arch,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
}));

ipcMain.handle("eap:openExternal", async (_event, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return { ok: false, denial: "URL_REJECTED" };
  }
  // Prefer WHATWG URL over removed Node url shim patterns in sandboxed contexts.
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, denial: "URL_REJECTED" };
    }
  } catch {
    return { ok: false, denial: "URL_REJECTED" };
  }
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle("eap:showNotification", async (_event, input) => {
  const title = typeof input?.title === "string" ? input.title.slice(0, 120) : "EAP";
  const body = typeof input?.body === "string" ? input.body.slice(0, 400) : "";
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
