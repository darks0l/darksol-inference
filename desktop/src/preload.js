import { contextBridge, ipcRenderer } from "electron";

const desktopBridge = {
  getAppMeta: () => ipcRenderer.invoke("desktop:get-app-meta"),
  getBackendHealth: () => ipcRenderer.invoke("desktop:get-backend-health")
};

contextBridge.exposeInMainWorld("darksolDesktop", desktopBridge);
