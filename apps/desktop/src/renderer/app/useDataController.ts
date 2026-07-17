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
import type { TreeActions } from "../components/CollectionTree";
import { firstRequestId, slug } from "./helpers";
import { DEFAULT_SETTINGS } from "./types";
import type { StudioState } from "./useStudioState";
import type { WorkspaceController } from "./useWorkspaceController";

export function useDataController(state: StudioState, workspaceController: WorkspaceController) {
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
    activeRequest, activeEnvironment, exportResult, exportContent, mutateWorkspace, saveWorkspaceNow,
    saveTimer, secureStorageAvailable, setSecureStorageAvailable } = state;
  const {
    selectCollection, renameCollection, deleteCollection, renameFolder, deleteFolder,
    duplicateFolder, renameRequest, deleteRequest, duplicateRequest, moveRequestTo, moveFolderTo
  } = workspaceController;
  const saveExport = async () => {
    if (!activeCollection || !exportContent) {
      return;
    }
    const extension =
      exportFormat === "openapi-yaml" ? "yaml" : exportFormat === "openapi-json" ? "json" : "collection.json";
    const result = await window.studio.saveExportFile(
      `${slug(activeCollection.name)}.${extension}`,
      exportContent
    );
    setSavedExportPath(result.canceled ? "" : result.filePath ?? "");
  };

  const copyExportToClipboard = async () => {
    if (!exportContent) {
      return;
    }
    try {
      await navigator.clipboard.writeText(exportContent);
      setNotice("Copied export content to the clipboard.");
    } catch {
      setNotice("Export content could not be copied to the clipboard.");
    }
  };

  const exportFullBackup = async () => {
    const confirmed = window.confirm(
      "Export all collections, environments, settings, and secret values? Secret values will be readable in the backup file. Store it somewhere secure."
    );
    if (!confirmed) {
      return;
    }
    try {
      const result = await window.studio.exportBackup(workspace);
      setSavedBackupPath(result.canceled ? "" : result.filePath ?? "");
      if (!result.canceled && result.filePath) {
        setNotice(`Complete backup saved to ${result.filePath}`);
      }
    } catch (error) {
      setNotice(`Backup could not be saved: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const restoreFullBackup = async () => {
    if (!window.confirm(
      "Restore a complete backup? Your current workspace and settings will be replaced after a safety backup is created."
    )) {
      return;
    }
    window.clearTimeout(saveTimer.current);
    const result = await window.studio.restoreBackup();
    setSecureStorageAvailable(result.secureStorageAvailable);
    if (result.canceled) return;
    if (!result.restored || !result.workspace || !result.settings) {
      setNotice(`Backup could not be restored: ${result.error ?? "Unknown restore error"}`);
      return;
    }
    const firstCollection = result.workspace.collections[0];
    setWorkspace(result.workspace);
    setSettings(result.settings);
    setActiveCollectionId(firstCollection?.id);
    setSelectedFolderId(undefined);
    setSelectedRequestId(firstCollection ? firstRequestId(firstCollection) : undefined);
    setResponse(undefined);
    setResponseHistory({});
    setSavedBackupPath("");
    setSaveStatus("saved");
    setScreen("editor");
    setNotice(result.safetyBackupPath
      ? `Backup restored. Previous workspace safety copy: ${result.safetyBackupPath}`
      : "Backup restored successfully.");
  };

  const deleteAllData = async () => {
    if (
      !window.confirm(
        "Permanently delete every collection, request, environment, secret, setting, and local backup? Export a complete backup first if you may need this data later."
      )
    ) {
      return;
    }
    const answer = window.prompt('Type "DELETE ALL" to confirm permanent deletion.');
    if (answer !== "DELETE ALL") {
      setNotice("Deletion canceled. The confirmation text did not match.");
      return;
    }

    window.clearTimeout(saveTimer.current);
    try {
      await window.studio.deleteAllData();
    } catch (error) {
      setNotice(`Local data could not be deleted: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const nextWorkspace = createEmptyWorkspace();
    setWorkspace(nextWorkspace);
    setSettings(DEFAULT_SETTINGS);
    setActiveCollectionId(undefined);
    setSelectedFolderId(undefined);
    setSelectedRequestId(undefined);
    setResponse(undefined);
    setResponseHistory({});
    setImportText("");
    setImportUrl("");
    setPostmanFolderSource(undefined);
    setPostmanFolderPath("");
    setSavedExportPath("");
    setSavedBackupPath("");
    setSaveStatus("dirty");
    setScreen("editor");
    setNotice("All local data was deleted. A fresh Specfold environment was created.");
  };

  const treeActions: TreeActions = {
    onSelectCollection: (collectionId) => {
      selectCollection(collectionId);
      setScreen("editor");
    },
    onSelectFolder: (folderId) => {
      setSelectedFolderId(folderId);
      setSelectedRequestId(undefined);
      setResponse(undefined);
      setScreen("editor");
    },
    onSelectRequest: (requestId) => {
      setSelectedRequestId(requestId);
      setResponse(undefined);
      setScreen("editor");
    },
    onRenameCollection: renameCollection,
    onDeleteCollection: deleteCollection,
    onRenameFolder: renameFolder,
    onDeleteFolder: deleteFolder,
    onDuplicateFolder: duplicateFolder,
    onRenameRequest: renameRequest,
    onDeleteRequest: deleteRequest,
    onDuplicateRequest: duplicateRequest,
    onMoveRequestTo: moveRequestTo,
    onMoveFolderTo: moveFolderTo
  };

  return {
    saveExport,
    copyExportToClipboard,
    exportFullBackup,
    restoreFullBackup,
    deleteAllData,
    treeActions
  };
}
