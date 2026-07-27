const { app, BrowserWindow, ipcMain, safeStorage, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

let mainWindow;
const defaultBaseUrl = () => (process.env.MOGCIA_DESKTOP_BASE_URL || process.env.NEXT_PUBLIC_MOGCIA_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const configFile = () => path.join(app.getPath("userData"), "config.json");

async function readConfig() {
  try {
    const raw = JSON.parse(await fs.readFile(configFile(), "utf8"));
    return {
      baseUrl: String(raw.baseUrl || defaultBaseUrl()).replace(/\/$/, ""),
      encryptedToken: raw.encryptedToken || "",
      alwaysOnTop: raw.alwaysOnTop !== false,
      launchAtLogin: Boolean(raw.launchAtLogin)
    };
  } catch {
    return { baseUrl: defaultBaseUrl(), encryptedToken: "", alwaysOnTop: true, launchAtLogin: false };
  }
}

async function writeConfig(config) {
  await fs.mkdir(path.dirname(configFile()), { recursive: true });
  await fs.writeFile(configFile(), JSON.stringify(config, null, 2), "utf8");
}

function applyLaunchAtLogin(launchAtLogin) {
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(launchAtLogin) });
    return { ok: true, launchAtLogin: Boolean(launchAtLogin) };
  } catch (error) {
    console.warn("Unable to update login item settings:", error);
    return { ok: false, launchAtLogin: false, message: "ログイン時起動の設定に失敗しました" };
  }
}

function encryptToken(token) {
  if (!token) return "";
  if (safeStorage.isEncryptionAvailable()) return safeStorage.encryptString(token).toString("base64");
  return Buffer.from(token, "utf8").toString("base64");
}

function decryptToken(encryptedToken) {
  if (!encryptedToken) return "";
  const data = Buffer.from(encryptedToken, "base64");
  if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(data);
  return data.toString("utf8");
}

async function createWindow() {
  const config = await readConfig();
  if (config.launchAtLogin) applyLaunchAtLogin(true);
  mainWindow = new BrowserWindow({
    width: 380,
    height: 470,
    minWidth: 320,
    minHeight: 420,
    frame: false,
    transparent: true,
    show: false,
    alwaysOnTop: config.alwaysOnTop,
    title: "MOGCIA Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("settings:get", async () => {
  const config = await readConfig();
  return {
    baseUrl: config.baseUrl,
    hasToken: Boolean(config.encryptedToken),
    alwaysOnTop: config.alwaysOnTop,
    launchAtLogin: config.launchAtLogin
  };
});

ipcMain.handle("settings:save", async (_event, input) => {
  const current = await readConfig();
  const shouldReplaceToken = Object.prototype.hasOwnProperty.call(input, "token") && String(input.token || "").length > 0;
  const shouldClearToken = Boolean(input.clearToken);
  const next = {
    baseUrl: String(input.baseUrl || current.baseUrl || defaultBaseUrl()).replace(/\/$/, ""),
    encryptedToken: shouldClearToken ? "" : shouldReplaceToken ? encryptToken(String(input.token)) : current.encryptedToken,
    alwaysOnTop: input.alwaysOnTop !== false,
    launchAtLogin: Boolean(input.launchAtLogin)
  };
  await writeConfig(next);
  if (mainWindow) mainWindow.setAlwaysOnTop(next.alwaysOnTop);
  const loginItemResult = applyLaunchAtLogin(next.launchAtLogin);
  if (!loginItemResult.ok) {
    next.launchAtLogin = false;
    await writeConfig(next);
  }
  return { ok: true };
});

ipcMain.handle("window:close", () => app.quit());

ipcMain.handle("window:minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle("window:pin", async (_event, alwaysOnTop) => {
  const current = await readConfig();
  const next = { ...current, alwaysOnTop: Boolean(alwaysOnTop) };
  await writeConfig(next);
  if (mainWindow) mainWindow.setAlwaysOnTop(next.alwaysOnTop);
  return { alwaysOnTop: next.alwaysOnTop };
});

ipcMain.handle("window:launch-at-login", async (_event, launchAtLogin) => {
  const current = await readConfig();
  const next = { ...current, launchAtLogin: Boolean(launchAtLogin) };
  const loginItemResult = applyLaunchAtLogin(next.launchAtLogin);
  next.launchAtLogin = loginItemResult.ok ? next.launchAtLogin : false;
  await writeConfig(next);
  return { launchAtLogin: next.launchAtLogin, error: loginItemResult.ok ? null : loginItemResult.message };
});

ipcMain.handle("web:open", async (_event, webPath) => {
  const config = await readConfig();
  await shell.openExternal(`${config.baseUrl.replace(/\/$/, "")}${webPath || "/home"}`);
});

ipcMain.handle("api:request", async (_event, input) => {
  const config = await readConfig();
  const token = decryptToken(config.encryptedToken);
  if (!token) return { success: false, error: { message: "アクセストークンが未設定です" } };

  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}${input.path}`, {
    method: input.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: input.body ? JSON.stringify(input.body) : undefined
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: { message: `APIの応答を読めませんでした (${response.status})` } };
  }
});
