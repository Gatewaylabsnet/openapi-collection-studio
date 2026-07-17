import { contextBridge, ipcRenderer } from "electron";
import type { ApiRequest, Collection, Environment, Folder, Workspace } from "@openapi-collection-studio/core";
import type { StudioApi } from "../shared/contracts";

const studioApi: StudioApi = {
  loadWorkspace: () => ipcRenderer.invoke("workspace:load"),
  saveWorkspace: (workspace: Workspace) =>
    ipcRenderer.invoke("workspace:save", workspace) as Promise<void>,
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
  sendRequest: (
    request: ApiRequest,
    environment?: Environment,
    collection?: Pick<Collection, "baseUrl">,
    folderPath?: Array<Pick<Folder, "baseUrl">>
  ) => ipcRenderer.invoke("http:send", { request, environment, collection, folderPath }),
  saveExportFile: (defaultPath: string, content: string) =>
    ipcRenderer.invoke("file:saveExport", { defaultPath, content }),
  openImportFile: () => ipcRenderer.invoke("file:openImport"),
  openPostmanFolder: () => ipcRenderer.invoke("file:openPostmanFolder"),
  exportBackup: (workspace: Workspace) => ipcRenderer.invoke("file:exportBackup", workspace),
  restoreBackup: () => ipcRenderer.invoke("file:restoreBackup"),
  deleteAllData: () => ipcRenderer.invoke("data:deleteAll"),
  fetchImportUrl: (url: string) => ipcRenderer.invoke("import:fetchUrl", url)
};

contextBridge.exposeInMainWorld("studio", studioApi);
