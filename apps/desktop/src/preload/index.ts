import { contextBridge, ipcRenderer } from "electron";
import type { ApiRequest, Environment, Workspace } from "@openapi-collection-studio/core";

contextBridge.exposeInMainWorld("studio", {
  loadWorkspace: () => ipcRenderer.invoke("workspace:load"),
  saveWorkspace: (workspace: Workspace) =>
    ipcRenderer.invoke("workspace:save", workspace) as Promise<void>,
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
  sendRequest: (request: ApiRequest, environment?: Environment) =>
    ipcRenderer.invoke("http:send", { request, environment }),
  saveExportFile: (defaultPath: string, content: string) =>
    ipcRenderer.invoke("file:saveExport", { defaultPath, content })
});
