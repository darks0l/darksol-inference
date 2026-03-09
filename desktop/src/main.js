import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import packageJson from "../../package.json" with { type: "json" };
import { pollBackendHealth, probeBackendHealth, spawnBackendProcess } from "./backend.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const preloadPath = path.resolve(__dirname, "preload.js");

let mainWindow;
let backendChildProcess = null;
let backendOwnedByDesktop = false;
let desktopConfig;

async function loadConfig() {
  const configPath = path.resolve(__dirname, "../config/desktop.config.json");
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw);
}

function emitChildProcessLogs(childProcess) {
  childProcess.stdout?.on("data", (chunk) => {
    process.stdout.write(`[darksol-backend] ${chunk}`);
  });
  childProcess.stderr?.on("data", (chunk) => {
    process.stderr.write(`[darksol-backend] ${chunk}`);
  });
}

async function ensureBackendOnline(config) {
  const initialHealth = await probeBackendHealth(config.apiBaseUrl).catch(() => ({ ok: false }));
  if (initialHealth.ok) {
    return;
  }

  backendChildProcess = spawnBackendProcess();
  backendOwnedByDesktop = true;
  emitChildProcessLogs(backendChildProcess);

  backendChildProcess.once("error", async (error) => {
    await dialog.showMessageBox({
      type: "error",
      title: "DARKSOL Backend Failed",
      message: "Failed to start local DARKSOL backend.",
      detail: error.message
    });
  });

  const result = await pollBackendHealth(config.apiBaseUrl);
  if (result.ok) {
    return;
  }

  const healthUrl = `${config.apiBaseUrl.replace(/\/+$/, "")}/health`;
  const reason = result.lastError?.message || "unknown startup error";
  await dialog.showMessageBox({
    type: "error",
    title: "DARKSOL Backend Timeout",
    message: "Desktop app could not reach local DARKSOL backend.",
    detail: `Timed out after ${result.timeoutMs}ms while waiting for ${healthUrl}.\nReason: ${reason}`
  });

  if (backendOwnedByDesktop && backendChildProcess && !backendChildProcess.killed) {
    backendChildProcess.kill();
  }

  throw new Error(`backend startup timeout: ${reason}`);
}

function createWindow(config) {
  mainWindow = new BrowserWindow({
    width: config.window.defaultWidth,
    height: config.window.defaultHeight,
    minWidth: config.window.minWidth,
    minHeight: config.window.minHeight,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(config.shellMirrorUrl);
}

function registerIpcHandlers(config) {
  ipcMain.handle("desktop:get-app-meta", async () => ({
    appName: config.appName,
    appId: config.appId,
    channel: config.channel,
    version: packageJson.version,
    shellMirrorUrl: config.shellMirrorUrl,
    apiBaseUrl: config.apiBaseUrl
  }));

  ipcMain.handle("desktop:get-backend-health", async () =>
    probeBackendHealth(config.apiBaseUrl).catch((error) => ({
      ok: false,
      error: error.message
    }))
  );
}

async function bootstrap() {
  desktopConfig = await loadConfig();
  app.setName(desktopConfig.appName);
  await app.whenReady();
  registerIpcHandlers(desktopConfig);
  await ensureBackendOnline(desktopConfig);
  createWindow(desktopConfig);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(desktopConfig);
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (backendOwnedByDesktop && backendChildProcess && !backendChildProcess.killed) {
    backendChildProcess.kill();
  }
});

bootstrap().catch(async (error) => {
  await dialog.showMessageBox({
    type: "error",
    title: "Desktop Bootstrap Failed",
    message: "Failed to start DARKSOL desktop app.",
    detail: error.message
  });
  app.exit(1);
});
