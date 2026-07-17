import {
  cloneFolder, cloneRequest, countFolderRequests, createApinizerJwtRequest, createCollection,
  createEmptyWorkspace, createEnvironment, createFolder, createId, createJwtRequest,
  deriveApinizerBaseUrl,
  createKeyValue, createRequest, checkOpenApiDocument, exportCollectionToOpenApiResult,
  looksLikeCurl, parseCurlCommand, requestToCurl, findFolder, findRequest, flattenRequests,
  importDocument, importPostmanV3Folder, listOperations, previewImportDocument,
  previewPostmanV3Folder, relocateFolder, relocateRequest, removeFolder, removeRequest,
  serializeCollectionJson,
  type ApiRequest, type Collection, type Environment, type ExportWarning, type GroupingStrategy,
  type ImportOperationSummary, type OpenApiCheckResult, type PostmanV3FolderSource, type Workspace
} from "@openapi-collection-studio/core";
import { flattenFolders } from "@openapi-collection-studio/core";
import type { DropTarget, TreeActions } from "../components/CollectionTree";
import { activeRequestFolderId, applyEnvironmentBaseUrlToCollection, environmentBaseUrl, firstRequestId } from "./helpers";
import type { StudioState } from "./useStudioState";

export function useWorkspaceController(state: StudioState) {
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
  const createNewWorkspace = () => {
    if (
      (workspace.collections.length > 0 || workspace.environments.length > 0) &&
      !window.confirm(
        "Start a new workspace? The current collections and environments will be replaced. A backup of the saved file is kept in the backups folder."
      )
    ) {
      return;
    }
    const nextWorkspace = createEmptyWorkspace("New Workspace");
    setSaveStatus("dirty");
    setWorkspace(nextWorkspace);
    setActiveCollectionId(undefined);
    setSelectedFolderId(undefined);
    setSelectedRequestId(undefined);
    setResponse(undefined);
    setSavedExportPath("");
    setSavedBackupPath("");
    setPostmanFolderSource(undefined);
    setPostmanFolderPath("");
    setScreen("editor");
  };

  const selectCollection = (collectionId: string) => {
    const collection = workspace.collections.find((candidate) => candidate.id === collectionId);
    setActiveCollectionId(collectionId);
    setSelectedFolderId(undefined);
    setSelectedRequestId(collection ? firstRequestId(collection) : undefined);
    setResponse(undefined);
  };

  const addCollection = () => {
    const collection = createCollection("New Collection");
    applyEnvironmentBaseUrlToCollection(collection, activeEnvironment);
    mutateWorkspace((draft) => {
      draft.collections.push(collection);
    });
    setActiveCollectionId(collection.id);
    setSelectedFolderId(undefined);
    setSelectedRequestId(undefined);
    setScreen("editor");
  };

  const addFolder = () => {
    if (!activeEnvironment) {
      setNotice("Create or select an environment before adding folders.");
      setScreen("environments");
      return;
    }
    if (!activeCollection) {
      return;
    }
    const folder = createFolder("New Folder");
    mutateWorkspace((draft) => {
      const collection = draft.collections.find((candidate) => candidate.id === activeCollection.id);
      if (!collection) {
        return;
      }
      const parent = selectedFolderId ? findFolder(collection, selectedFolderId) : undefined;
      if (parent) {
        parent.folders.push(folder);
      } else {
        collection.folders.push(folder);
      }
    });
    setSelectedFolderId(folder.id);
  };

  const addRequest = (kind: "blank" | "jwt" | "apinizer-jwt") => {
    if (!activeCollection) {
      return;
    }
    const isAuthTemplate = kind === "jwt" || kind === "apinizer-jwt";
    if (isAuthTemplate && !activeEnvironment) {
      setNotice("Create or select an environment before adding an Auth folder.");
      setScreen("environments");
      return;
    }
    const request =
      kind === "jwt"
        ? createJwtRequest()
        : kind === "apinizer-jwt"
          ? createApinizerJwtRequest()
          : createRequest({ name: "New Request" });
    const authFolderName = kind === "apinizer-jwt" ? "Apinizer Auth" : "Auth";
    const existingAuthFolder = activeCollection.folders.find(
      (folder) => folder.name.toLowerCase() === authFolderName.toLowerCase()
    );
    const apinizerBaseUrl = kind === "apinizer-jwt"
      ? deriveApinizerBaseUrl(
          activeCollection.baseUrl ?? (activeEnvironment ? environmentBaseUrl(activeEnvironment) : undefined)
        )
      : undefined;
    // Prefer the folder the user has selected — a new request/token goes into
    // it. Only fall back to a dedicated auth folder for token templates when
    // no folder is selected.
    const useAuthFallback = isAuthTemplate && !selectedFolderId;
    // Pre-generate the new Auth folder id so the updater stays pure: it builds
    // a fresh folder object each run (React StrictMode invokes it twice in dev)
    // but always with this stable id, instead of mutating a shared object.
    const newAuthFolderId = useAuthFallback && !existingAuthFolder ? createId("folder") : undefined;
    const targetFolderId =
      selectedFolderId ?? (useAuthFallback ? existingAuthFolder?.id ?? newAuthFolderId : undefined);
    mutateWorkspace((draft) => {
      const collection = draft.collections.find((candidate) => candidate.id === activeCollection.id);
      if (!collection) {
        return;
      }
      let folder = targetFolderId ? findFolder(collection, targetFolderId) : undefined;
      if (useAuthFallback && !folder) {
        folder = {
          ...createFolder(authFolderName),
          id: newAuthFolderId ?? createId("folder"),
          baseUrl: apinizerBaseUrl
        };
        collection.folders.push(folder);
      }
      if (folder) {
        if (kind === "apinizer-jwt" && !folder.baseUrl?.trim() && apinizerBaseUrl) {
          folder.baseUrl = apinizerBaseUrl;
        }
        folder.requests.push(request);
      } else {
        collection.requests.push(request);
      }
    });
    setSelectedFolderId(targetFolderId);
    setSelectedRequestId(request.id);
    setRequestTab(isAuthTemplate ? "body" : "params");
    setScreen("editor");
  };

  const updateActiveRequest = (recipe: (request: ApiRequest) => void) => {
    if (!activeCollection || !selectedRequestId) {
      return;
    }
    mutateWorkspace((draft) => {
      const collection = draft.collections.find((candidate) => candidate.id === activeCollection.id);
      const location = collection ? findRequest(collection, selectedRequestId) : undefined;
      if (location) {
        recipe(location.request);
      }
    });
  };

  const moveActiveRequest = (targetFolderId: string) => {
    if (!activeCollection || !selectedRequestId) {
      return;
    }
    mutateWorkspace((draft) => {
      const collection = draft.collections.find((candidate) => candidate.id === activeCollection.id);
      if (!collection) {
        return;
      }
      const request = removeRequest(collection, selectedRequestId);
      if (!request) {
        return;
      }
      const folder = targetFolderId ? findFolder(collection, targetFolderId) : undefined;
      if (folder) {
        folder.requests.push(request);
      } else {
        collection.requests.push(request);
      }
    });
    setSelectedFolderId(targetFolderId || undefined);
  };

  const mutateCollection = (collectionId: string, recipe: (collection: Collection) => void) => {
    mutateWorkspace((draft) => {
      const collection = draft.collections.find((candidate) => candidate.id === collectionId);
      if (collection) {
        recipe(collection);
      }
    });
  };

  const renameCollection = (collectionId: string, name: string) => {
    mutateCollection(collectionId, (collection) => {
      collection.name = name;
    });
  };

  const deleteCollection = (collectionId: string) => {
    const collection = workspace.collections.find((candidate) => candidate.id === collectionId);
    if (!collection) {
      return;
    }
    const requestCount = flattenRequests(collection).length;
    if (
      !window.confirm(
        `Delete collection "${collection.name}"${requestCount > 0 ? ` and its ${requestCount} request(s)` : ""}? This cannot be undone.`
      )
    ) {
      return;
    }
    mutateWorkspace((draft) => {
      draft.collections = draft.collections.filter((candidate) => candidate.id !== collectionId);
    });
    if (activeCollectionId === collectionId) {
      const remaining = workspace.collections.filter((candidate) => candidate.id !== collectionId);
      setActiveCollectionId(remaining[0]?.id);
      setSelectedFolderId(undefined);
      setSelectedRequestId(remaining[0] ? firstRequestId(remaining[0]) : undefined);
      setResponse(undefined);
    }
  };

  const renameFolder = (folderId: string, name: string) => {
    if (!activeCollection) {
      return;
    }
    mutateCollection(activeCollection.id, (collection) => {
      const folder = findFolder(collection, folderId);
      if (folder) {
        folder.name = name;
      }
    });
  };

  const deleteFolder = (folderId: string) => {
    if (!activeCollection) {
      return;
    }
    const folder = findFolder(activeCollection, folderId);
    if (!folder) {
      return;
    }
    const requestCount = countFolderRequests(folder);
    if (
      !window.confirm(
        `Delete folder "${folder.name}"${requestCount > 0 ? ` and its ${requestCount} request(s)` : ""}? This cannot be undone.`
      )
    ) {
      return;
    }
    const selectedLocation = selectedRequestId
      ? findRequest(activeCollection, selectedRequestId)
      : undefined;
    const selectionInFolder =
      selectedLocation?.folderPath.some((candidate) => candidate.id === folderId) ?? false;
    const selectedFolderInSubtree =
      selectedFolderId !== undefined &&
      (selectedFolderId === folderId || Boolean(findFolder({ ...activeCollection, folders: [folder], requests: [] }, selectedFolderId)));

    mutateCollection(activeCollection.id, (collection) => {
      removeFolder(collection, folderId);
    });
    if (selectedFolderInSubtree) {
      setSelectedFolderId(undefined);
    }
    if (selectionInFolder) {
      setSelectedRequestId(undefined);
      setResponse(undefined);
    }
  };

  const duplicateFolder = (folderId: string) => {
    if (!activeCollection) {
      return;
    }
    mutateCollection(activeCollection.id, (collection) => {
      const source = findFolder(collection, folderId);
      if (!source) {
        return;
      }
      const copy = cloneFolder(source);
      const rootIndex = collection.folders.findIndex((candidate) => candidate.id === folderId);
      if (rootIndex >= 0) {
        collection.folders.splice(rootIndex + 1, 0, copy);
        return;
      }
      for (const { folder } of flattenFolders(collection)) {
        const index = folder.folders.findIndex((candidate) => candidate.id === folderId);
        if (index >= 0) {
          folder.folders.splice(index + 1, 0, copy);
          return;
        }
      }
    });
  };

  const renameRequest = (requestId: string, name: string) => {
    if (!activeCollection) {
      return;
    }
    mutateCollection(activeCollection.id, (collection) => {
      const location = findRequest(collection, requestId);
      if (location) {
        location.request.name = name;
      }
    });
  };

  const deleteRequest = (requestId: string) => {
    if (!activeCollection) {
      return;
    }
    const location = findRequest(activeCollection, requestId);
    if (!location) {
      return;
    }
    if (!window.confirm(`Delete request "${location.request.name}"? This cannot be undone.`)) {
      return;
    }
    mutateCollection(activeCollection.id, (collection) => {
      removeRequest(collection, requestId);
    });
    if (selectedRequestId === requestId) {
      setSelectedRequestId(undefined);
      setResponse(undefined);
    }
  };

  const duplicateRequest = (requestId: string) => {
    if (!activeCollection) {
      return;
    }
    // Clone outside the state updater: React defers updater execution, so an
    // id captured inside the recipe would not be available here yet.
    const source = findRequest(activeCollection, requestId);
    if (!source) {
      return;
    }
    const copy = cloneRequest(source.request);
    mutateCollection(activeCollection.id, (collection) => {
      const location = findRequest(collection, requestId);
      if (!location) {
        return;
      }
      const container = location.folder ? location.folder.requests : collection.requests;
      const index = container.findIndex((candidate) => candidate.id === requestId);
      container.splice(index + 1, 0, copy);
    });
    setSelectedRequestId(copy.id);
    setResponse(undefined);
  };

  const moveRequestTo = (requestId: string, target: DropTarget) => {
    mutateWorkspace((draft) => {
      const sourceCollection = draft.collections.find((collection) => findRequest(collection, requestId));
      const targetCollection = draft.collections.find((collection) => collection.id === target.collectionId);
      if (!sourceCollection || !targetCollection) {
        return;
      }
      if (sourceCollection.id === targetCollection.id) {
        relocateRequest(
          targetCollection,
          requestId,
          target.folderId ?? null,
          target.position === "before" ? target.requestId ?? null : null
        );
        return;
      }

      const targetContainer = target.folderId
        ? findFolder(targetCollection, target.folderId)?.requests
        : targetCollection.requests;
      if (!targetContainer) {
        return;
      }
      const request = removeRequest(sourceCollection, requestId);
      if (!request) {
        return;
      }
      const beforeIndex =
        target.position === "before" && target.requestId
          ? targetContainer.findIndex((candidate) => candidate.id === target.requestId)
          : -1;
      if (beforeIndex >= 0) {
        targetContainer.splice(beforeIndex, 0, request);
      } else {
        targetContainer.push(request);
      }
    });
    setActiveCollectionId(target.collectionId);
    setSelectedFolderId(target.folderId);
    setSelectedRequestId(requestId);
    setResponse(undefined);
    setScreen("editor");
  };

  const moveFolderTo = (folderId: string, target: DropTarget) => {
    mutateWorkspace((draft) => {
      const sourceCollection = draft.collections.find((collection) => findFolder(collection, folderId));
      const targetCollection = draft.collections.find((collection) => collection.id === target.collectionId);
      if (!sourceCollection || !targetCollection) {
        return;
      }
      if (sourceCollection.id === targetCollection.id) {
        relocateFolder(targetCollection, folderId, target.folderId ?? null, null);
        return;
      }

      const targetContainer = target.folderId
        ? findFolder(targetCollection, target.folderId)?.folders
        : targetCollection.folders;
      if (!targetContainer) {
        return;
      }
      const folder = removeFolder(sourceCollection, folderId);
      if (folder) {
        targetContainer.push(folder);
      }
    });
    setActiveCollectionId(target.collectionId);
    setSelectedFolderId(folderId);
    setSelectedRequestId(undefined);
    setResponse(undefined);
    setScreen("editor");
  };

  return {
    createNewWorkspace, selectCollection, addCollection, addFolder, addRequest,
    updateActiveRequest, moveActiveRequest, mutateCollection, renameCollection,
    deleteCollection, renameFolder, deleteFolder, duplicateFolder, renameRequest,
    deleteRequest, duplicateRequest, moveRequestTo, moveFolderTo
  };
}

export type WorkspaceController = ReturnType<typeof useWorkspaceController>;
