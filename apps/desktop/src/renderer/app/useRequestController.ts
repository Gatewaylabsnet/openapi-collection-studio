import { useEffect, useRef } from "react";
import {
  cloneFolder, cloneRequest, countFolderRequests, createApinizerJwtRequest, createCollection,
  createEmptyWorkspace, createEnvironment, createFolder, createId, createJwtRequest,
  createKeyValue, createRequest, checkOpenApiDocument, exportCollectionToOpenApiResult,
  looksLikeCurl, parseCurlCommand, requestToCurl, findFolder, findRequest, flattenRequests,
  importDocument, importPostmanV3Folder, listOperations, previewImportDocument,
  previewPostmanV3Folder, relocateFolder, relocateRequest, removeFolder, removeRequest,
  serializeCollectionJson,
  type ApiRequest, type Collection, type Environment, type ExportWarning, type GroupingStrategy,
  type ImportOperationSummary, type OpenApiCheckResult, type PostmanV3FolderSource, type Workspace
} from "@openapi-collection-studio/core";
import { applyEnvironmentBaseUrlToCollection, createEnvironmentVariable, environmentBaseUrl, extractJsonPath, replaceEnvironmentCustomVariables, upsertEnvironmentBaseUrl } from "./helpers";
import { MAX_HISTORY_PER_REQUEST } from "./types";
import type { AppSettings } from "./types";
import type { StudioState } from "./useStudioState";
import type { WorkspaceController } from "./useWorkspaceController";

export function useRequestController(state: StudioState, workspaceController: WorkspaceController) {
  const { workspace, setWorkspace, loaded, setLoaded, screen, setScreen,
    activeCollectionId, setActiveCollectionId, selectedFolderId, setSelectedFolderId,
    selectedRequestId, setSelectedRequestId, requestTab, setRequestTab, response, setResponse,
    responseHistory, setResponseHistory, isSending, setIsSending, importText, setImportText,
    postmanFolderSource, setPostmanFolderSource, postmanFolderPath, setPostmanFolderPath,
    importUrl, setImportUrl, isFetchingImport, setIsFetchingImport, importOperations,
    setImportOperations, selectedImportKeys, setSelectedImportKeys, lastImportIndexRef,
    grouping, setGrouping, importError, setImportError, importSummary, setImportSummary,
    exportFormat, setExportFormat, exportFolderIds, setExportFolderIds, includeAllComponents,
    setIncludeAllComponents, includeExamples, setIncludeExamples, pruneUnusedComponents,
    setPruneUnusedComponents, preferSourceOperation, setPreferSourceOperation, savedExportPath,
    setSavedExportPath, savedBackupPath, setSavedBackupPath, saveStatus, setSaveStatus,
    settings, setSettings, notice, setNotice, activeCollection, activeRequestLocation,
    activeRequest, activeEnvironment, exportResult, exportContent, mutateWorkspace, saveWorkspaceNow } = state;
  const { updateActiveRequest } = workspaceController;
  const copyActiveRequestAsCurl = async () => {
    if (!activeRequest) {
      return;
    }
    const curl = requestToCurl(activeRequest);
    try {
      await navigator.clipboard.writeText(curl);
      setNotice("Copied request as cURL to the clipboard.");
    } catch {
      setNotice(curl);
    }
  };

  const sendActiveRequest = async () => {
    if (!activeRequest || isSending) {
      return;
    }
    const requestId = activeRequest.id;
    setIsSending(true);
    setResponse(undefined);
    const folderPath = activeRequestLocation?.folderPath.map(({ baseUrl }) => ({ baseUrl }));
    const result = await window.studio.sendRequest(
      activeRequest,
      activeEnvironment,
      activeCollection,
      folderPath
    );
    setResponse(result);
    if (!result.error) {
      setResponseHistory((current) => {
        const entries = current[requestId] ?? [];
        return {
          ...current,
          [requestId]: [{ at: new Date().toISOString(), response: result }, ...entries].slice(
            0,
            MAX_HISTORY_PER_REQUEST
          )
        };
      });
    }
    setIsSending(false);
  };

  // Keyboard shortcuts: Ctrl/Cmd+Enter sends the active request,
  // Ctrl/Cmd+S saves the workspace immediately.
  const shortcutHandlers = useRef({ send: sendActiveRequest, save: saveWorkspaceNow });
  shortcutHandlers.current = { send: sendActiveRequest, save: saveWorkspaceNow };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void shortcutHandlers.current.send();
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void shortcutHandlers.current.save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const updateEnvironment = (environmentId: string, recipe: (environment: Environment) => void) => {
    mutateWorkspace((draft) => {
      const environment = draft.environments.find((candidate) => candidate.id === environmentId);
      if (environment) {
        recipe(environment);
      }
    });
  };

  const updateEnvironmentBaseUrl = (environmentId: string, value: string): boolean => {
    const nextValue = value.trim();
    const collectionsToUpdate = workspace.collections.filter(
      (collection) => (collection.baseUrl ?? "") !== nextValue
    );
    if (collectionsToUpdate.length > 0) {
      const confirmed = window.confirm(
        nextValue
          ? `Collection base URL values override environment base URL. Update all ${workspace.collections.length} collection base URLs to "${nextValue}"?`
          : `Collection base URL values override environment base URL. Clear base URL from all ${workspace.collections.length} collections?`
      );
      if (!confirmed) {
        return false;
      }
    }

    mutateWorkspace((draft) => {
      const environment = draft.environments.find((candidate) => candidate.id === environmentId);
      if (environment) {
        upsertEnvironmentBaseUrl(environment, nextValue);
      }
      for (const collection of draft.collections) {
        collection.baseUrl = nextValue || undefined;
      }
    });
    return true;
  };

  const createNewEnvironment = () => {
    const environment = createEnvironment(`Environment ${workspace.environments.length + 1}`);
    environment.variables = [createEnvironmentVariable("baseUrl", "")];
    mutateWorkspace((draft) => {
      draft.environments.push(environment);
      draft.activeEnvironmentId = environment.id;
    });
  };

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void window.studio.saveSettings(next).then(setSettings);
      return next;
    });
  };

  const assignResponseValue = (path: string, variableName: string) => {
    if (!response || !variableName.trim()) {
      return;
    }
    const extracted = extractJsonPath(response.rawBody || response.body, path);
    if (extracted === undefined) {
      setNotice(`Could not find "${path}" in the response body.`);
      return;
    }
    const value = typeof extracted === "string" ? extracted : JSON.stringify(extracted);
    mutateWorkspace((draft) => {
      let environment = draft.environments.find(
        (candidate) => candidate.id === draft.activeEnvironmentId
      );
      if (!environment) {
        environment = createEnvironment("Local");
        draft.environments.push(environment);
        draft.activeEnvironmentId = environment.id;
      }
      const existing = environment.variables.find((variable) => variable.name === variableName);
      if (existing) {
        existing.value = value;
      } else {
        environment.variables.push(createEnvironmentVariable(variableName, value));
      }
    });
    setNotice(`Saved "${variableName}" to the ${activeEnvironment ? "active" : "new"} environment.`);
  };

  return {
    copyActiveRequestAsCurl, sendActiveRequest, updateEnvironment,
    updateEnvironmentBaseUrl, createNewEnvironment, updateSettings, assignResponseValue
  };
}
