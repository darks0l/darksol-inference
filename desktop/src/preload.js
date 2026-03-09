import { contextBridge, ipcRenderer } from "electron";

const desktopBridge = {
  getAppMeta: () => ipcRenderer.invoke("desktop:get-app-meta"),
  getBackendHealth: () => ipcRenderer.invoke("desktop:get-backend-health"),
  getRuntimeStatus: () => ipcRenderer.invoke("desktop:get-runtime-status"),
  startRuntime: () => ipcRenderer.invoke("desktop:start-runtime"),
  stopRuntime: () => ipcRenderer.invoke("desktop:stop-runtime"),
  restartRuntime: () => ipcRenderer.invoke("desktop:restart-runtime"),
  getKeepWarmConfig: () => ipcRenderer.invoke("desktop:get-keepwarm"),
  updateKeepWarmConfig: (payload) => ipcRenderer.invoke("desktop:update-keepwarm", payload)
};

contextBridge.exposeInMainWorld("darksolDesktop", desktopBridge);
