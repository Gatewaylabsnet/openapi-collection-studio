import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  Download,
  FileJson,
  FilePlus2,
  FolderPlus,
  Import,
  Play,
  Plus,
  Save,
  Send,
  Settings,
  Terminal,
  Wand2
} from "lucide-react";
import {
  cloneFolder,
  cloneRequest,
  countFolderRequests,
  createApinizerJwtRequest,
  createCollection,
  createEmptyWorkspace,
  createEnvironment,
  createFolder,
  createId,
  createJwtRequest,
  createKeyValue,
  createRequest,
  checkOpenApiDocument,
  exportCollectionToOpenApiResult,
  looksLikeCurl,
  parseCurlCommand,
  requestToCurl,
  findFolder,
  findRequest,
  flattenFolders,
  flattenRequests,
  importApiDocument,
  listOperations,
  parseCollectionJson,
  previewApiDocument,
  relocateFolder,
  relocateRequest,
  removeFolder,
  removeRequest,
  serializeCollectionJson,
  type ApiRequest,
  type AuthConfig,
  type Collection,
  type Environment,
  type EnvironmentVariable,
  type ExportWarning,
  type GroupingStrategy,
  type ImportOperationSummary,
  type OpenApiCheckResult,
  type HttpMethod,
  type KeyValue,
  type Workspace
} from "@openapi-collection-studio/core";
import { CollectionTree, type DropTarget, type TreeActions } from "./components/CollectionTree";
import { KeyValueEditor } from "./components/KeyValueEditor";

type Screen = "editor" | "import" | "environments" | "export" | "settings";
type RequestTab = "params" | "auth" | "headers" | "body";
type ResponseTab = "body" | "headers" | "raw";
type ExportFormat = "openapi-yaml" | "openapi-json" | "collection-json";
type SaveStatus = "saved" | "dirty" | "saving" | "error";

interface AppSettings {
  requestTimeoutMs: number;
  maxResponseBytes: number;
  allowInsecureTls: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  requestTimeoutMs: 30_000,
  maxResponseBytes: 10 * 1024 * 1024,
  allowInsecureTls: false
};

interface ResponseState {
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: Record<string, string>;
  body: string;
  rawBody: string;
  truncated?: boolean;
  error?: string;
}

interface ResponseHistoryEntry {
  at: string;
  response: ResponseState;
}

const MAX_HISTORY_PER_REQUEST = 10;

const methods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

export function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => createEmptyWorkspace());
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>("editor");
  const [activeCollectionId, setActiveCollectionId] = useState<string>();
  const [selectedFolderId, setSelectedFolderId] = useState<string>();
  const [selectedRequestId, setSelectedRequestId] = useState<string>();
  const [requestTab, setRequestTab] = useState<RequestTab>("params");
  const [response, setResponse] = useState<ResponseState>();
  const [responseHistory, setResponseHistory] = useState<Record<string, ResponseHistoryEntry[]>>({});
  const [isSending, setIsSending] = useState(false);
  const [importText, setImportText] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [isFetchingImport, setIsFetchingImport] = useState(false);
  const [importOperations, setImportOperations] = useState<ImportOperationSummary[]>([]);
  const [selectedImportKeys, setSelectedImportKeys] = useState<Set<string>>(new Set());
  // Anchor index for Shift-click range selection in the import operations list.
  const lastImportIndexRef = useRef<number | null>(null);
  const [grouping, setGrouping] = useState<GroupingStrategy>("tags");
  const [importError, setImportError] = useState("");
  const [importSummary, setImportSummary] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("openapi-yaml");
  const [exportFolderIds, setExportFolderIds] = useState<string[]>([]);
  const [includeAllComponents, setIncludeAllComponents] = useState(true);
  const [includeExamples, setIncludeExamples] = useState(false);
  const [pruneUnusedComponents, setPruneUnusedComponents] = useState(true);
  const [preferSourceOperation, setPreferSourceOperation] = useState(true);
  const [savedExportPath, setSavedExportPath] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState<string>();
  const saveTimer = useRef<number>();

  // Auto-dismiss transient banners (copied cURL, saved variable, etc.) so they
  // do not linger. The user can also close them with the x button.
  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(undefined), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    window.studio.loadWorkspace().then((result) => {
      setWorkspace(result.workspace);
      if (result.recovered && result.message) {
        setNotice(result.message);
      }
      const firstCollection = result.workspace.collections[0];
      if (firstCollection) {
        setActiveCollectionId(firstCollection.id);
        setSelectedRequestId(firstRequestId(firstCollection));
      }
      setLoaded(true);
    });
    window.studio.loadSettings().then(setSettings);
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setSaveStatus("saving");
      void window.studio
        .saveWorkspace(workspace)
        .then(() => setSaveStatus("saved"))
        .catch(() => setSaveStatus("error"));
    }, 350);
    return () => window.clearTimeout(saveTimer.current);
  }, [loaded, workspace]);

  // Extract the operation list from the pasted document (debounced so large
  // documents are not re-parsed on every keystroke). All operations start
  // selected; the user can narrow the set before importing.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      lastImportIndexRef.current = null;
      if (!importText.trim() || looksLikeCurl(importText)) {
        setImportOperations([]);
        setSelectedImportKeys(new Set());
        return;
      }
      try {
        const operations = listOperations(importText);
        setImportOperations(operations);
        setSelectedImportKeys(new Set(operations.map((operation) => operation.key)));
      } catch {
        setImportOperations([]);
        setSelectedImportKeys(new Set());
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [importText]);

  const activeCollection = useMemo(
    () => workspace.collections.find((collection) => collection.id === activeCollectionId),
    [activeCollectionId, workspace.collections]
  );

  const activeRequestLocation = useMemo(
    () =>
      activeCollection && selectedRequestId
        ? findRequest(activeCollection, selectedRequestId)
        : undefined,
    [activeCollection, selectedRequestId]
  );

  const activeRequest = activeRequestLocation?.request;
  const activeEnvironment = workspace.environments.find(
    (environment) => environment.id === workspace.activeEnvironmentId
  );

  const exportResult = useMemo<{
    content: string;
    warnings: ExportWarning[];
    check?: OpenApiCheckResult;
  }>(() => {
    if (!activeCollection) {
      return { content: "", warnings: [] };
    }
    if (exportFormat === "collection-json") {
      return { content: serializeCollectionJson(activeCollection), warnings: [] };
    }
    const result = exportCollectionToOpenApiResult(activeCollection, {
      format: exportFormat === "openapi-json" ? "json" : "yaml",
      folderIds: exportFolderIds,
      useFolderNamesAsTags: true,
      includeRequestExamples: includeExamples,
      includeParameterExamples: includeExamples,
      includeResponseExamples: true,
      includeBearerJwtSecurityScheme: true,
      includeAllComponents,
      pruneUnusedComponents,
      preferSourceOperation
    });
    return {
      content: result.content,
      warnings: result.warnings,
      check: checkOpenApiDocument(result.document)
    };
  }, [
    activeCollection,
    exportFolderIds,
    exportFormat,
    includeAllComponents,
    includeExamples,
    preferSourceOperation,
    pruneUnusedComponents
  ]);

  const exportContent = exportResult.content;

  const mutateWorkspace = (recipe: (draft: Workspace) => void) => {
    setSaveStatus("dirty");
    setWorkspace((current) => {
      const draft = structuredClone(current) as Workspace;
      recipe(draft);
      draft.updatedAt = new Date().toISOString();
      return draft;
    });
  };

  const saveWorkspaceNow = async () => {
    window.clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    try {
      await window.studio.saveWorkspace(workspace);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  };

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
    const request =
      kind === "jwt"
        ? createJwtRequest()
        : kind === "apinizer-jwt"
          ? createApinizerJwtRequest()
          : createRequest({ name: "New Request" });
    const existingAuthFolder = activeCollection.folders.find((folder) => folder.name === "Auth");
    // Prefer the folder the user has selected — a new request/token goes into
    // it. Only fall back to a dedicated "Auth" folder for token templates when
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
        folder = { ...createFolder("Auth"), id: newAuthFolderId ?? createId("folder") };
        collection.folders.push(folder);
      }
      if (folder) {
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

  const openImportFile = async () => {
    const result = await window.studio.openImportFile();
    if (result.canceled) {
      return;
    }
    if (result.error) {
      setImportSummary("");
      setImportError(result.error);
      return;
    }
    if (result.content !== undefined) {
      setImportText(result.content);
      setImportError("");
      setImportSummary(result.filePath ? `Loaded ${result.filePath}` : "File loaded.");
    }
  };

  const fetchImportUrl = async () => {
    const url = importUrl.trim();
    if (!url) {
      return;
    }
    setIsFetchingImport(true);
    setImportError("");
    const result = await window.studio.fetchImportUrl(url);
    setIsFetchingImport(false);
    if (result.ok && result.content !== undefined) {
      setImportText(result.content);
      setImportSummary("Fetched document from URL. Review it, then press Import.");
    } else {
      setImportSummary("");
      setImportError(result.error ?? "Could not fetch the URL.");
    }
  };

  const toggleImportOperation = (key: string, index: number, shiftKey: boolean) => {
    // Capture the anchor before the state updater runs: React may defer the
    // updater, and we reassign the ref to `index` synchronously below, so the
    // updater must close over this snapshot rather than read the ref later.
    const anchor = lastImportIndexRef.current;
    lastImportIndexRef.current = index;
    setSelectedImportKeys((current) => {
      const next = new Set(current);
      // The clicked item's new state drives the whole range on Shift-click.
      const shouldSelect = !current.has(key);
      if (shiftKey && anchor !== null) {
        const [from, to] = anchor <= index ? [anchor, index] : [index, anchor];
        for (let i = from; i <= to; i += 1) {
          const rangeKey = importOperations[i]?.key;
          if (!rangeKey) {
            continue;
          }
          if (shouldSelect) {
            next.add(rangeKey);
          } else {
            next.delete(rangeKey);
          }
        }
      } else if (shouldSelect) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handlePreviewImport = () => {
    setImportError("");
    if (looksLikeCurl(importText)) {
      try {
        const request = parseCurlCommand(importText);
        setImportSummary(`cURL command: ${request.method} ${request.url}`);
      } catch (error) {
        setImportSummary("");
        setImportError(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    try {
      const collection = parseCollectionJson(importText);
      setImportSummary(`Collection JSON: ${collection.name}`);
      return;
    } catch {
      // Continue with OpenAPI/Swagger detection.
    }

    try {
      const preview = previewApiDocument(importText);
      setImportSummary(
        `${preview.kind.toUpperCase()} ${preview.version ?? ""} ${preview.format.toUpperCase()} - ${preview.operationCount} operations in ${preview.pathCount} paths`
      );
    } catch (error) {
      setImportSummary("");
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

  const importCurl = () => {
    const request = parseCurlCommand(importText);
    if (activeCollection) {
      mutateCollection(activeCollection.id, (collection) => {
        collection.requests.push(request);
      });
      setSelectedFolderId(undefined);
    } else {
      const collection = createCollection("Imported Requests");
      applyEnvironmentBaseUrlToCollection(collection, activeEnvironment);
      collection.requests.push(request);
      mutateWorkspace((draft) => {
        draft.collections.push(collection);
      });
      setActiveCollectionId(collection.id);
    }
    setSelectedRequestId(request.id);
    setImportSummary(`Imported cURL request: ${request.name}`);
    setScreen("editor");
  };

  const handleImport = () => {
    setImportError("");
    try {
      if (looksLikeCurl(importText)) {
        importCurl();
        return;
      }
      if (importOperations.length > 0 && selectedImportKeys.size === 0) {
        setImportError("Select at least one operation to import.");
        return;
      }

      let collection: Collection;
      try {
        collection = parseCollectionJson(importText);
      } catch {
        collection = importApiDocument(importText, {
          grouping,
          operationKeys:
            importOperations.length > 0 && selectedImportKeys.size < importOperations.length
              ? [...selectedImportKeys]
              : undefined
        }).collection;
      }

      mutateWorkspace((draft) => {
        draft.collections.push(collection);
      });
      setActiveCollectionId(collection.id);
      setSelectedFolderId(undefined);
      setSelectedRequestId(firstRequestId(collection));
      setImportSummary(`Imported ${collection.name}`);
      setScreen("editor");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

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
    const result = await window.studio.sendRequest(activeRequest, activeEnvironment, activeCollection);
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
    const environment = createEnvironment("Local");
    environment.variables = [
      createEnvironmentVariable("baseUrl", "https://api.example.com"),
      createEnvironmentVariable("accessToken", "")
    ];
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

  const treeActions: TreeActions = {
    onSelectCollection: (collectionId) => {
      selectCollection(collectionId);
      setScreen("editor");
    },
    onSelectFolder: (folderId) => setSelectedFolderId(folderId),
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

  if (!loaded) {
    return <div className="loading">Loading workspace...</div>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <div>
            <h1>Specfold</h1>
            <p>{workspace.collections.length} collections | {workspace.environments.length} environments</p>
          </div>
        </div>
        <div className="topbar__actions">
          <label className="topbar__environment">
            <span>Environment</span>
            <select
              onChange={(event) =>
                mutateWorkspace((draft) => {
                  draft.activeEnvironmentId = event.target.value || undefined;
                })
              }
              value={workspace.activeEnvironmentId ?? ""}
            >
              <option value="">No environment</option>
              {workspace.environments.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.name}
                </option>
              ))}
            </select>
          </label>
          <span className={`save-status save-status--${saveStatus}`}>{saveStatusLabel(saveStatus)}</span>
        </div>
      </header>

      {notice && (
        <div className="notice-banner">
          <span>{notice}</span>
          <button className="icon-button" onClick={() => setNotice(undefined)} type="button">
            x
          </button>
        </div>
      )}

      <div className="workspace">
        <CollectionsSidebar
          activeCollection={activeCollection}
          onAddApinizerJwtRequest={() => addRequest("apinizer-jwt")}
          onAddCollection={addCollection}
          onAddFolder={addFolder}
          onAddJwtRequest={() => addRequest("jwt")}
          onAddRequest={() => addRequest("blank")}
          selectedFolderId={selectedFolderId}
          selectedRequestId={selectedRequestId}
          screen={screen}
          onScreenChange={setScreen}
          treeActions={treeActions}
          workspace={workspace}
        />
        <main className="workspace-main">
        {screen === "import" && (
          <ImportScreen
            grouping={grouping}
            importError={importError}
            importSummary={importSummary}
            importText={importText}
            importUrl={importUrl}
            isFetchingUrl={isFetchingImport}
            operations={importOperations}
            selectedOperationKeys={selectedImportKeys}
            onToggleOperation={toggleImportOperation}
            onSelectAllOperations={(selectAll) =>
              setSelectedImportKeys(
                selectAll
                  ? new Set(importOperations.map((operation) => operation.key))
                  : new Set()
              )
            }
            onFetchUrl={fetchImportUrl}
            onGroupingChange={setGrouping}
            onImport={handleImport}
            onImportUrlChange={setImportUrl}
            onOpenFile={openImportFile}
            onPreview={handlePreviewImport}
            onTextChange={setImportText}
          />
        )}
        {screen === "editor" &&
          (workspace.collections.length === 0 ? (
            <WelcomeMain onImport={() => setScreen("import")} onNewCollection={addCollection} />
          ) : (
            <RequestWorkspace
              activeCollection={activeCollection}
              activeRequest={activeRequest}
              folderOptions={activeCollection ? flattenFolders(activeCollection) : []}
              isSending={isSending}
              onAddJwtRequest={() => addRequest("jwt")}
              onAddRequest={() => addRequest("blank")}
              onMoveRequest={moveActiveRequest}
              onRequestTabChange={setRequestTab}
              onSend={sendActiveRequest}
              onCopyCurl={copyActiveRequestAsCurl}
              onUpdateCollection={(recipe) =>
                activeCollection && mutateCollection(activeCollection.id, recipe)
              }
              onUpdateRequest={updateActiveRequest}
              onAssignResponseValue={assignResponseValue}
              environmentVariableNames={activeEnvironment?.variables.map((variable) => variable.name) ?? []}
              responseHistory={selectedRequestId ? responseHistory[selectedRequestId] ?? [] : []}
              requestTab={requestTab}
              response={response}
            />
          ))}
        {screen === "settings" && (
          <SettingsScreen
            settings={settings}
            onChange={updateSettings}
            workspaceName={workspace.name}
            onWorkspaceNameChange={(name) =>
              mutateWorkspace((draft) => {
                draft.name = name;
              })
            }
            onNewWorkspace={createNewWorkspace}
          />
        )}
        {screen === "environments" && (
          <EnvironmentScreen
            activeEnvironmentId={workspace.activeEnvironmentId}
            environments={workspace.environments}
            onCreateEnvironment={createNewEnvironment}
            onDeleteEnvironment={(environmentId) => {
              if (!window.confirm("Delete this environment and its variables? This cannot be undone.")) {
                return;
              }
              mutateWorkspace((draft) => {
                draft.environments = draft.environments.filter((environment) => environment.id !== environmentId);
                if (draft.activeEnvironmentId === environmentId) {
                  draft.activeEnvironmentId = draft.environments[0]?.id;
                }
              });
            }}
            onSelectEnvironment={(environmentId) =>
              mutateWorkspace((draft) => {
                draft.activeEnvironmentId = environmentId;
              })
            }
            onUpdateEnvironmentBaseUrl={updateEnvironmentBaseUrl}
            onUpdateEnvironment={updateEnvironment}
          />
        )}
        {screen === "export" && (
          <ExportScreen
            activeCollection={activeCollection}
            exportContent={exportContent}
            exportWarnings={exportResult.warnings}
            exportCheck={exportResult.check}
            exportFolderIds={exportFolderIds}
            exportFormat={exportFormat}
            includeAllComponents={includeAllComponents}
            includeExamples={includeExamples}
            pruneUnusedComponents={pruneUnusedComponents}
            preferSourceOperation={preferSourceOperation}
            onExportFolderIdsChange={setExportFolderIds}
            onExportFormatChange={setExportFormat}
            onIncludeAllComponentsChange={setIncludeAllComponents}
            onIncludeExamplesChange={setIncludeExamples}
            onPruneUnusedComponentsChange={setPruneUnusedComponents}
            onPreferSourceOperationChange={setPreferSourceOperation}
            onSave={saveExport}
            savedExportPath={savedExportPath}
          />
        )}
        </main>
      </div>
    </div>
  );
}

function CollectionsSidebar({
  workspace,
  activeCollection,
  selectedFolderId,
  selectedRequestId,
  screen,
  onScreenChange,
  treeActions,
  onAddRequest,
  onAddFolder,
  onAddCollection,
  onAddJwtRequest,
  onAddApinizerJwtRequest
}: {
  workspace: Workspace;
  activeCollection?: Collection;
  selectedFolderId?: string;
  selectedRequestId?: string;
  screen: Screen;
  onScreenChange(screen: Screen): void;
  treeActions: TreeActions;
  onAddRequest(): void;
  onAddFolder(): void;
  onAddCollection(): void;
  onAddJwtRequest(): void;
  onAddApinizerJwtRequest(): void;
}) {
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const selectedFolderPath =
    activeCollection && selectedFolderId
      ? flattenFolders(activeCollection)
          .find(({ folder }) => folder.id === selectedFolderId)
          ?.path.map((folder) => folder.name)
          .join(" / ")
      : "";
  const requestTarget = selectedFolderPath || (activeCollection ? `${activeCollection.name} root` : "Create a collection first");
  const runNewAction = (action: () => void) => {
    action();
    setIsNewMenuOpen(false);
  };

  return (
    <aside className="sidebar">
      <nav className="sidebar__nav" aria-label="Primary">
        <NavButton
          active={screen === "editor"}
          icon={<FileJson size={16} />}
          onClick={() => onScreenChange("editor")}
        >
          Editor
        </NavButton>
        <NavButton
          active={screen === "import"}
          icon={<Import size={16} />}
          onClick={() => onScreenChange(screen === "import" ? "editor" : "import")}
        >
          Import
        </NavButton>
        <NavButton
          active={screen === "environments"}
          icon={<Boxes size={16} />}
          onClick={() => onScreenChange(screen === "environments" ? "editor" : "environments")}
        >
          Environments
        </NavButton>
        <NavButton
          active={screen === "export"}
          icon={<Download size={16} />}
          onClick={() => onScreenChange(screen === "export" ? "editor" : "export")}
        >
          Export
        </NavButton>
        <NavButton
          active={screen === "settings"}
          icon={<Settings size={16} />}
          onClick={() => onScreenChange(screen === "settings" ? "editor" : "settings")}
        >
          Settings
        </NavButton>
      </nav>
      <div className="sidebar__toolbar">
        <div className="sidebar__new-menu" onKeyDown={(event) => event.key === "Escape" && setIsNewMenuOpen(false)}>
          <button
            aria-expanded={isNewMenuOpen}
            aria-haspopup="menu"
            className="primary-button sidebar__new-trigger"
            onClick={() => setIsNewMenuOpen((open) => !open)}
            type="button"
          >
            <Plus size={16} />
            New
          </button>
          {isNewMenuOpen && (
            <div className="sidebar__new-panel" role="menu">
              <button className="new-menu-item" onClick={() => runNewAction(onAddCollection)} role="menuitem" type="button">
                <Plus size={15} />
                Collection
              </button>
              <button
                className="new-menu-item"
                disabled={!activeCollection}
                onClick={() => runNewAction(onAddFolder)}
                role="menuitem"
                type="button"
              >
                <FolderPlus size={15} />
                Folder
              </button>
              <div className="new-menu-section">
                <div className="new-menu-section__title">
                  <FilePlus2 size={14} />
                  Request
                </div>
                <button
                  className="new-menu-item new-menu-item--nested"
                  disabled={!activeCollection}
                  onClick={() => runNewAction(onAddRequest)}
                  role="menuitem"
                  type="button"
                >
                  Standard request
                </button>
                <button
                  className="new-menu-item new-menu-item--nested"
                  disabled={!activeCollection}
                  onClick={() => runNewAction(onAddJwtRequest)}
                  role="menuitem"
                  type="button"
                >
                  JWT token request
                </button>
                <button
                  className="new-menu-item new-menu-item--nested"
                  disabled={!activeCollection}
                  onClick={() => runNewAction(onAddApinizerJwtRequest)}
                  role="menuitem"
                  type="button"
                >
                  Apinizer JWT request
                </button>
                <div className="new-menu-target" title={requestTarget}>
                  Target: {requestTarget}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <CollectionTree
        {...treeActions}
        activeCollectionId={activeCollection?.id}
        collections={workspace.collections}
        selectedFolderId={selectedFolderId}
        selectedRequestId={selectedRequestId}
      />
    </aside>
  );
}

function WelcomeMain({
  onImport,
  onNewCollection
}: {
  onImport(): void;
  onNewCollection(): void;
}) {
  return (
    <div className="welcome-main">
      <div className="home-empty">
        <FileJson size={32} />
        <h2>Welcome to Specfold</h2>
        <p>
          Import an OpenAPI/Swagger document to turn its endpoints into an editable
          request collection, or start a collection from scratch.
        </p>
        <div className="button-row">
          <button className="primary-button" onClick={onImport} type="button">
            <Import size={16} />
            Import OpenAPI
          </button>
          <button className="secondary-button" onClick={onNewCollection} type="button">
            <Plus size={16} />
            New collection
          </button>
        </div>
      </div>
    </div>
  );
}

function NavButton({
  children,
  active,
  icon,
  onClick
}: {
  children: string;
  active: boolean;
  icon: React.ReactNode;
  onClick(): void;
}) {
  return (
    <button
      aria-label={children}
      className={active ? "nav-btn is-active" : "nav-btn"}
      onClick={onClick}
      title={children}
      type="button"
    >
      {icon}
      <span className="nav-btn__label">{children}</span>
    </button>
  );
}

function ImportScreen({
  importText,
  importUrl,
  isFetchingUrl,
  grouping,
  importSummary,
  importError,
  operations,
  selectedOperationKeys,
  onToggleOperation,
  onSelectAllOperations,
  onTextChange,
  onImportUrlChange,
  onFetchUrl,
  onOpenFile,
  onGroupingChange,
  onPreview,
  onImport
}: {
  importText: string;
  importUrl: string;
  isFetchingUrl: boolean;
  grouping: GroupingStrategy;
  importSummary: string;
  importError: string;
  operations: ImportOperationSummary[];
  selectedOperationKeys: Set<string>;
  onToggleOperation(key: string, index: number, shiftKey: boolean): void;
  onSelectAllOperations(selectAll: boolean): void;
  onTextChange(value: string): void;
  onImportUrlChange(value: string): void;
  onFetchUrl(): void;
  onOpenFile(): void;
  onGroupingChange(value: GroupingStrategy): void;
  onPreview(): void;
  onImport(): void;
}) {
  const importDisabled =
    !importText.trim() || (operations.length > 0 && selectedOperationKeys.size === 0);

  return (
    <section className="import-layout">
      <div className="pane">
        <div className="pane__header">
          <h2>Import</h2>
          <div className="button-row">
            <button className="secondary-button" onClick={onOpenFile} type="button">
              <FolderPlus size={16} />
              Open file
            </button>
            <button className="secondary-button" onClick={onPreview} type="button">
              <Play size={16} />
              Preview
            </button>
            <button className="primary-button" disabled={importDisabled} onClick={onImport} type="button">
              <Import size={16} />
              Import
              {operations.length > 0 && ` (${selectedOperationKeys.size})`}
            </button>
          </div>
        </div>
        <div className="import-url-row">
          <input
            aria-label="Import from URL"
            onChange={(event) => onImportUrlChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && importUrl.trim() && !isFetchingUrl) {
                onFetchUrl();
              }
            }}
            placeholder="https://example.com/openapi.json — fetch a document by URL"
            value={importUrl}
          />
          <button
            className="secondary-button"
            disabled={!importUrl.trim() || isFetchingUrl}
            onClick={onFetchUrl}
            type="button"
          >
            <Download size={16} />
            {isFetchingUrl ? "Fetching..." : "Fetch"}
          </button>
        </div>
        <textarea
          className="source-textarea"
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Paste OpenAPI 3.x, Swagger 2.0, Collection JSON, or a curl command — or load it from a file or URL above"
          spellCheck={false}
          value={importText}
        />
      </div>
      <aside className="side-panel">
        <h3>Grouping</h3>
        <label className="radio-row">
          <input
            checked={grouping === "tags"}
            onChange={() => onGroupingChange("tags")}
            type="radio"
          />
          <span>Tags</span>
        </label>
        <label className="radio-row">
          <input
            checked={grouping === "firstPathSegment"}
            onChange={() => onGroupingChange("firstPathSegment")}
            type="radio"
          />
          <span>First path segment</span>
        </label>
        <label className="radio-row">
          <input
            checked={grouping === "singleFolder"}
            onChange={() => onGroupingChange("singleFolder")}
            type="radio"
          />
          <span>Single folder</span>
        </label>
        {operations.length > 0 && (
          <>
            <div className="ops-header">
              <h3>Operations</h3>
              <span className="ops-count">
                {selectedOperationKeys.size}/{operations.length} selected
              </span>
            </div>
            <div className="button-row ops-actions">
              <button
                className="secondary-button"
                disabled={selectedOperationKeys.size === operations.length}
                onClick={() => onSelectAllOperations(true)}
                type="button"
              >
                Select all
              </button>
              <button
                className="secondary-button"
                disabled={selectedOperationKeys.size === 0}
                onClick={() => onSelectAllOperations(false)}
                type="button"
              >
                Deselect all
              </button>
            </div>
            <p className="ops-hint">Tip: Shift-click to select a range.</p>
            <div className="ops-list">
              {operations.map((operation, index) => (
                <label
                  className="check-row ops-row"
                  key={operation.key}
                  title={operation.summary ?? operation.path}
                >
                  <input
                    checked={selectedOperationKeys.has(operation.key)}
                    onChange={() => {}}
                    onClick={(event) =>
                      onToggleOperation(operation.key, index, event.shiftKey)
                    }
                    type="checkbox"
                  />
                  <span className={`method method--${operation.method.toLowerCase()}`}>
                    {operation.method}
                  </span>
                  <span className="ops-path">{operation.path}</span>
                </label>
              ))}
            </div>
          </>
        )}
        <div className={importError ? "status-box status-box--error" : "status-box"}>
          {importError || importSummary || "Preview results appear here."}
        </div>
      </aside>
    </section>
  );
}

function RequestWorkspace({
  activeCollection,
  activeRequest,
  requestTab,
  response,
  folderOptions,
  isSending,
  onAddRequest,
  onAddJwtRequest,
  onUpdateRequest,
  onUpdateCollection,
  onMoveRequest,
  onRequestTabChange,
  onSend,
  onCopyCurl,
  onAssignResponseValue,
  environmentVariableNames,
  responseHistory
}: {
  activeCollection?: Collection;
  activeRequest?: ApiRequest;
  requestTab: RequestTab;
  response?: ResponseState;
  folderOptions: ReturnType<typeof flattenFolders>;
  isSending: boolean;
  responseHistory: ResponseHistoryEntry[];
  onAddRequest(): void;
  onAddJwtRequest(): void;
  onUpdateRequest(recipe: (request: ApiRequest) => void): void;
  onUpdateCollection(recipe: (collection: Collection) => void): void;
  onMoveRequest(folderId: string): void;
  onRequestTabChange(tab: RequestTab): void;
  onSend(): void;
  onCopyCurl(): void;
  onAssignResponseValue(path: string, variableName: string): void;
  environmentVariableNames: string[];
}) {
  return (
    <section className="editor-layout">
      <div className="request-panel">
        {activeRequest ? (
          <>
            {activeCollection && (
              <label className="field collection-base-url">
                <span>Collection base URL</span>
                <input
                  aria-label="Collection base URL"
                  onChange={(event) =>
                    onUpdateCollection((collection) => {
                      const value = event.target.value.trim();
                      collection.baseUrl = value || undefined;
                    })
                  }
                  placeholder="https://api.example.com"
                  value={activeCollection.baseUrl ?? ""}
                />
              </label>
            )}
            <div className="request-line">
              <select
                aria-label="Method"
                onChange={(event) =>
                  onUpdateRequest((request) => {
                    request.method = event.target.value as HttpMethod;
                  })
                }
                value={activeRequest.method}
              >
                {methods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
              <input
                aria-label="Request URL"
                onChange={(event) =>
                  onUpdateRequest((request) => {
                    request.url = event.target.value;
                  })
                }
                value={activeRequest.url}
              />
              <button className="primary-button" disabled={isSending} onClick={onSend} type="button">
                <Send size={16} />
                {isSending ? "Sending" : "Send"}
              </button>
            </div>
            <div className="request-meta">
              <input
                aria-label="Request name"
                onChange={(event) =>
                  onUpdateRequest((request) => {
                    request.name = event.target.value;
                  })
                }
                value={activeRequest.name}
              />
              <select
                aria-label="Move request"
                onChange={(event) => onMoveRequest(event.target.value)}
                value={activeRequestFolderId(activeCollection, activeRequest.id) ?? ""}
              >
                <option value="">Collection root</option>
                {folderOptions.map(({ folder, path }) => (
                  <option key={folder.id} value={folder.id}>
                    {path.map((item) => item.name).join(" / ")}
                  </option>
                ))}
              </select>
              <button className="secondary-button" onClick={onCopyCurl} title="Copy as cURL" type="button">
                <Terminal size={16} />
                cURL
              </button>
            </div>
            <div className="request-tabs">
              {(["params", "auth", "headers", "body"] as RequestTab[]).map((tab) => (
                <button
                  className={requestTab === tab ? "tab is-active" : "tab"}
                  key={tab}
                  onClick={() => onRequestTabChange(tab)}
                  type="button"
                >
                  {tabLabel(tab)}
                </button>
              ))}
            </div>
            <RequestTabPanel
              activeRequest={activeRequest}
              onUpdateRequest={onUpdateRequest}
              tab={requestTab}
            />
          </>
        ) : (
          <div className="empty-state">
            <h2>No request selected</h2>
            <div className="button-row">
              <button className="primary-button" disabled={!activeCollection} onClick={onAddRequest} type="button">
                <Plus size={16} />
                New request
              </button>
              <button className="secondary-button" disabled={!activeCollection} onClick={onAddJwtRequest} type="button">
                <Wand2 size={16} />
                JWT request
              </button>
            </div>
          </div>
        )}
      </div>
      <ResponsePanel
        response={response}
        history={responseHistory}
        onAssignResponseValue={onAssignResponseValue}
        environmentVariableNames={environmentVariableNames}
      />
    </section>
  );
}

function RequestTabPanel({
  activeRequest,
  tab,
  onUpdateRequest
}: {
  activeRequest: ApiRequest;
  tab: RequestTab;
  onUpdateRequest(recipe: (request: ApiRequest) => void): void;
}) {
  if (tab === "params") {
    return (
      <div className="tab-panel">
        <h3>Query parameters</h3>
        <KeyValueEditor
          onChange={(values) =>
            onUpdateRequest((request) => {
              request.queryParams = values;
            })
          }
          values={activeRequest.queryParams}
        />
        <h3>Path parameters</h3>
        <KeyValueEditor
          onChange={(values) =>
            onUpdateRequest((request) => {
              request.pathParams = values;
            })
          }
          values={activeRequest.pathParams}
        />
      </div>
    );
  }

  if (tab === "headers") {
    return (
      <div className="tab-panel">
        <h3>Headers</h3>
        <KeyValueEditor
          onChange={(values) =>
            onUpdateRequest((request) => {
              request.headers = values;
            })
          }
          values={activeRequest.headers}
        />
      </div>
    );
  }

  if (tab === "auth") {
    return (
      <div className="tab-panel tab-panel--narrow">
        <label className="field">
          <span>Auth type</span>
          <select
            onChange={(event) =>
              onUpdateRequest((request) => {
                request.auth = authForType(event.target.value as AuthConfig["type"]);
              })
            }
            value={activeRequest.auth.type}
          >
            <option value="none">None</option>
            <option value="bearer">Bearer token</option>
            <option value="basic">Basic</option>
            <option value="apiKey">API key</option>
          </select>
        </label>
        <AuthFields
          auth={activeRequest.auth}
          onChange={(auth) =>
            onUpdateRequest((request) => {
              request.auth = auth;
            })
          }
        />
      </div>
    );
  }

  return (
    <div className="tab-panel">
      <div className="segmented">
        {(["none", "json", "raw", "form"] as const).map((mode) => (
          <button
            className={activeRequest.body.mode === mode ? "is-active" : ""}
            key={mode}
            onClick={() =>
              onUpdateRequest((request) => {
                request.body.mode = mode;
                if (mode === "json") {
                  request.body.contentType = request.body.contentType ?? "application/json";
                  request.body.raw = request.body.raw ?? "{}";
                }
                if (mode === "form") {
                  request.body.contentType = "application/x-www-form-urlencoded";
                  request.body.form = request.body.form ?? [];
                }
              })
            }
            type="button"
          >
            {mode === "form" ? "form-urlencoded" : mode}
          </button>
        ))}
      </div>
      {activeRequest.body.mode === "form" ? (
        <KeyValueEditor
          onChange={(values) =>
            onUpdateRequest((request) => {
              request.body.form = values;
            })
          }
          values={activeRequest.body.form ?? []}
        />
      ) : (
        <textarea
          className="body-editor"
          disabled={activeRequest.body.mode === "none"}
          onChange={(event) =>
            onUpdateRequest((request) => {
              request.body.raw = event.target.value;
            })
          }
          spellCheck={false}
          value={activeRequest.body.raw ?? ""}
        />
      )}
    </div>
  );
}

function AuthFields({
  auth,
  onChange
}: {
  auth: AuthConfig;
  onChange(auth: AuthConfig): void;
}) {
  if (auth.type === "none") {
    return null;
  }
  if (auth.type === "bearer") {
    return (
      <label className="field">
        <span>Token</span>
        <input
          onChange={(event) => onChange({ ...auth, token: event.target.value })}
          value={auth.token}
        />
      </label>
    );
  }
  if (auth.type === "basic") {
    return (
      <>
        <label className="field">
          <span>Username</span>
          <input
            onChange={(event) => onChange({ ...auth, username: event.target.value })}
            value={auth.username}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            onChange={(event) => onChange({ ...auth, password: event.target.value })}
            type="password"
            value={auth.password}
          />
        </label>
      </>
    );
  }
  return (
    <>
      <label className="field">
        <span>Location</span>
        <select
          onChange={(event) =>
            onChange({ ...auth, in: event.target.value === "query" ? "query" : "header" })
          }
          value={auth.in}
        >
          <option value="header">Header</option>
          <option value="query">Query</option>
        </select>
      </label>
      <label className="field">
        <span>Key</span>
        <input onChange={(event) => onChange({ ...auth, key: event.target.value })} value={auth.key} />
      </label>
      <label className="field">
        <span>Value</span>
        <input onChange={(event) => onChange({ ...auth, value: event.target.value })} value={auth.value} />
      </label>
    </>
  );
}

function ResponsePanel({
  response,
  history,
  onAssignResponseValue,
  environmentVariableNames
}: {
  response?: ResponseState;
  history: ResponseHistoryEntry[];
  onAssignResponseValue(path: string, variableName: string): void;
  environmentVariableNames: string[];
}) {
  const [responseTab, setResponseTab] = useState<ResponseTab>("body");
  const [assignPath, setAssignPath] = useState("access_token");
  const [assignVariable, setAssignVariable] = useState("accessToken");
  const [historyIndex, setHistoryIndex] = useState(0);

  useEffect(() => {
    setResponseTab("body");
    // A fresh send resets the view to the latest response.
    setHistoryIndex(0);
  }, [response?.status, response?.body, response?.rawBody]);

  // Show the selected history entry when browsing; otherwise the live response.
  const displayed = history[historyIndex]?.response ?? response;
  const isJsonResponse = Boolean(displayed && !displayed.error && looksLikeJson(displayed.rawBody));

  return (
    <aside className="response-panel">
      <div className="response-panel__head">
        <h2>Response</h2>
        {displayed && !displayed.error && (
          <span className="status-pill">
            {displayed.status} | {displayed.durationMs} ms | {formatBytes(displayed.sizeBytes)}
          </span>
        )}
      </div>
      {history.length > 1 && (
        <label className="history-row">
          <span>History</span>
          <select
            onChange={(event) => setHistoryIndex(Number(event.target.value))}
            value={historyIndex}
          >
            {history.map((entry, index) => (
              <option key={entry.at} value={index}>
                {index === 0 ? "Latest" : formatHistoryTime(entry.at)} — {entry.response.status} (
                {entry.response.durationMs} ms)
              </option>
            ))}
          </select>
        </label>
      )}
      {displayed?.error && <div className="status-box status-box--error">{displayed.error}</div>}
      {displayed?.truncated && (
        <div className="status-box status-box--warning">
          Response was larger than the size limit and has been truncated. Increase the limit in Settings if needed.
        </div>
      )}
      {displayed && !displayed.error ? (
        <>
          <div className="response-tabs">
            {(["body", "headers", "raw"] as ResponseTab[]).map((tab) => (
              <button
                className={responseTab === tab ? "tab is-active" : "tab"}
                key={tab}
                onClick={() => setResponseTab(tab)}
                type="button"
              >
                {tabLabel(tab)}
              </button>
            ))}
          </div>
          <pre>
            {responseTab === "headers"
              ? JSON.stringify(displayed.headers, null, 2)
              : responseTab === "raw"
                ? displayed.rawBody
                : displayed.body}
          </pre>
          {isJsonResponse && (
            <div className="assign-row">
              <span className="assign-row__label">Save field to variable</span>
              <div className="assign-row__controls">
                <input
                  aria-label="Response field path"
                  onChange={(event) => setAssignPath(event.target.value)}
                  placeholder="access_token"
                  value={assignPath}
                />
                <input
                  aria-label="Target variable name"
                  list="known-variable-names"
                  onChange={(event) => setAssignVariable(event.target.value)}
                  placeholder="accessToken"
                  value={assignVariable}
                />
                <datalist id="known-variable-names">
                  {environmentVariableNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <button
                  className="secondary-button"
                  disabled={!assignPath.trim() || !assignVariable.trim()}
                  onClick={() => onAssignResponseValue(assignPath, assignVariable)}
                  type="button"
                >
                  <Save size={16} />
                  Save
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="empty-response">Status, timing, size, headers, and body appear after Send.</div>
      )}
    </aside>
  );
}

function EnvironmentScreen({
  environments,
  activeEnvironmentId,
  onSelectEnvironment,
  onCreateEnvironment,
  onDeleteEnvironment,
  onUpdateEnvironmentBaseUrl,
  onUpdateEnvironment
}: {
  environments: Environment[];
  activeEnvironmentId?: string;
  onSelectEnvironment(environmentId: string): void;
  onCreateEnvironment(): void;
  onDeleteEnvironment(environmentId: string): void;
  onUpdateEnvironmentBaseUrl(environmentId: string, value: string): boolean;
  onUpdateEnvironment(environmentId: string, recipe: (environment: Environment) => void): void;
}) {
  const active = environments.find((environment) => environment.id === activeEnvironmentId) ?? environments[0];
  const currentBaseUrl = active ? environmentBaseUrl(active) : "";
  const [baseUrlDraft, setBaseUrlDraft] = useState(currentBaseUrl);
  const customVariables = active?.variables.filter((variable) => !isBaseUrlVariable(variable)) ?? [];
  useEffect(() => {
    setBaseUrlDraft(currentBaseUrl);
  }, [active?.id, currentBaseUrl]);

  const commitBaseUrl = () => {
    if (!active) {
      return;
    }
    if (baseUrlDraft.trim() === currentBaseUrl.trim()) {
      setBaseUrlDraft(currentBaseUrl);
      return;
    }
    const accepted = onUpdateEnvironmentBaseUrl(active.id, baseUrlDraft);
    if (!accepted) {
      setBaseUrlDraft(currentBaseUrl);
    }
  };

  return (
    <section className="environment-layout">
      <aside className="side-panel">
        <div className="pane__header">
          <h2>Environments</h2>
          <button className="icon-button" onClick={onCreateEnvironment} title="New environment" type="button">
            <Plus size={16} />
          </button>
        </div>
        {environments.map((environment) => (
          <button
            className={environment.id === active?.id ? "list-button is-active" : "list-button"}
            key={environment.id}
            onClick={() => onSelectEnvironment(environment.id)}
            type="button"
          >
            {environment.name}
          </button>
        ))}
      </aside>
      <div className="pane">
        {active ? (
          <>
            <div className="pane__header">
              <input
                aria-label="Environment name"
                className="title-input"
                onChange={(event) =>
                  onUpdateEnvironment(active.id, (environment) => {
                    environment.name = event.target.value;
                  })
                }
                value={active.name}
              />
              <button className="secondary-button" onClick={() => onDeleteEnvironment(active.id)} type="button">
                Delete
              </button>
            </div>
            <label className="field environment-base-url">
              <span>Environment base URL</span>
              <input
                aria-label="Environment base URL"
                onBlur={commitBaseUrl}
                onChange={(event) => setBaseUrlDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    setBaseUrlDraft(currentBaseUrl);
                  }
                }}
                placeholder="https://api.example.com"
                value={baseUrlDraft}
              />
            </label>
            <EnvironmentVariableEditor
              variables={customVariables}
              onChange={(variables) =>
                onUpdateEnvironment(active.id, (environment) => {
                  replaceEnvironmentCustomVariables(environment, variables);
                })
              }
            />
          </>
        ) : (
          <div className="empty-state">
            <h2>No environment yet</h2>
            <button className="primary-button" onClick={onCreateEnvironment} type="button">
              <Plus size={16} />
              Create environment
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function EnvironmentVariableEditor({
  variables,
  onChange
}: {
  variables: EnvironmentVariable[];
  onChange(variables: EnvironmentVariable[]): void;
}) {
  const update = (id: string, patch: Partial<EnvironmentVariable>) => {
    onChange(variables.map((variable) => (variable.id === id ? { ...variable, ...patch } : variable)));
  };

  return (
    <div className="env-table">
      <div className="env-table__head">
        <span>Enabled</span>
        <span>Name</span>
        <span>Value</span>
        <span>Secret</span>
        <span />
      </div>
      {variables.map((variable) => (
        <div className="env-table__row" key={variable.id}>
          <input
            checked={variable.enabled}
            onChange={(event) => update(variable.id, { enabled: event.target.checked })}
            type="checkbox"
          />
          <input
            onChange={(event) => update(variable.id, { name: event.target.value })}
            value={variable.name}
          />
          <input
            onChange={(event) => update(variable.id, { value: event.target.value })}
            type={variable.secret ? "password" : "text"}
            value={variable.value}
          />
          <input
            checked={Boolean(variable.secret)}
            onChange={(event) => update(variable.id, { secret: event.target.checked })}
            type="checkbox"
          />
          <button
            className="icon-button"
            onClick={() => onChange(variables.filter((candidate) => candidate.id !== variable.id))}
            title="Remove variable"
            type="button"
          >
            x
          </button>
        </div>
      ))}
      <button
        className="secondary-button"
        onClick={() => onChange([...variables, createEnvironmentVariable("", "")])}
        type="button"
      >
        <Plus size={16} />
        Add variable
      </button>
    </div>
  );
}

function ExportScreen({
  activeCollection,
  exportFormat,
  exportFolderIds,
  exportContent,
  exportWarnings,
  exportCheck,
  includeAllComponents,
  includeExamples,
  pruneUnusedComponents,
  preferSourceOperation,
  savedExportPath,
  onExportFormatChange,
  onExportFolderIdsChange,
  onIncludeAllComponentsChange,
  onIncludeExamplesChange,
  onPruneUnusedComponentsChange,
  onPreferSourceOperationChange,
  onSave
}: {
  activeCollection?: Collection;
  exportFormat: ExportFormat;
  exportFolderIds: string[];
  exportContent: string;
  exportWarnings: ExportWarning[];
  exportCheck?: OpenApiCheckResult;
  includeAllComponents: boolean;
  includeExamples: boolean;
  pruneUnusedComponents: boolean;
  preferSourceOperation: boolean;
  savedExportPath: string;
  onExportFormatChange(format: ExportFormat): void;
  onExportFolderIdsChange(folderIds: string[]): void;
  onIncludeAllComponentsChange(value: boolean): void;
  onIncludeExamplesChange(value: boolean): void;
  onPruneUnusedComponentsChange(value: boolean): void;
  onPreferSourceOperationChange(value: boolean): void;
  onSave(): void;
}) {
  const folders = activeCollection ? flattenFolders(activeCollection) : [];
  const isOpenApi = exportFormat !== "collection-json";
  const secretWarnings = exportWarnings.filter((warning) => warning.kind === "secret");
  const otherWarnings = exportWarnings.filter((warning) => warning.kind !== "secret");

  return (
    <section className="export-layout">
      <aside className="side-panel">
        <h2>Export</h2>
        <label className="field">
          <span>Format</span>
          <select onChange={(event) => onExportFormatChange(event.target.value as ExportFormat)} value={exportFormat}>
            <option value="openapi-yaml">OpenAPI YAML</option>
            <option value="openapi-json">OpenAPI JSON</option>
            <option value="collection-json">Collection JSON</option>
          </select>
        </label>
        <h3>Scope</h3>
        <label className="radio-row">
          <input
            checked={exportFolderIds.length === 0}
            onChange={() => onExportFolderIdsChange([])}
            type="radio"
          />
          <span>Entire collection</span>
        </label>
        <div className="folder-checks">
          {folders.map(({ folder, path }) => (
            <label className="check-row" key={folder.id}>
              <input
                checked={exportFolderIds.includes(folder.id)}
                onChange={(event) => {
                  if (event.target.checked) {
                    onExportFolderIdsChange([...exportFolderIds, folder.id]);
                  } else {
                    onExportFolderIdsChange(exportFolderIds.filter((id) => id !== folder.id));
                  }
                }}
                type="checkbox"
              />
              <span>{path.map((item) => item.name).join(" / ")}</span>
            </label>
          ))}
        </div>
        <h3>Options</h3>
        <label className="check-row">
          <input
            checked={includeAllComponents}
            disabled={!isOpenApi}
            onChange={(event) => onIncludeAllComponentsChange(event.target.checked)}
            type="checkbox"
          />
          <span>Include all components</span>
        </label>
        <label className="check-row">
          <input
            checked={pruneUnusedComponents}
            disabled={!isOpenApi || !includeAllComponents}
            onChange={(event) => onPruneUnusedComponentsChange(event.target.checked)}
            type="checkbox"
          />
          <span>Remove unused component schemas</span>
        </label>
        <label className="check-row">
          <input
            checked={includeExamples}
            disabled={!isOpenApi}
            onChange={(event) => onIncludeExamplesChange(event.target.checked)}
            type="checkbox"
          />
          <span>Include example values (may contain secrets)</span>
        </label>
        <label className="check-row">
          <input
            checked={preferSourceOperation}
            disabled={!isOpenApi}
            onChange={(event) => onPreferSourceOperationChange(event.target.checked)}
            type="checkbox"
          />
          <span>Preserve imported operation details (schemas, security, deprecated)</span>
        </label>
        <button className="primary-button" disabled={!activeCollection} onClick={onSave} type="button">
          <Save size={16} />
          Save file
        </button>
        {savedExportPath && <div className="status-box">Saved to {savedExportPath}</div>}
      </aside>
      <div className="pane">
        <div className="pane__header">
          <h2>Preview</h2>
          <div className="pane__header-meta">
            {exportCheck && (
              <span className={exportCheck.ok ? "valid-badge valid-badge--ok" : "valid-badge valid-badge--warn"}>
                {exportCheck.ok
                  ? "Valid OpenAPI structure"
                  : `${exportCheck.issues.length} structure issue${exportCheck.issues.length === 1 ? "" : "s"}`}
              </span>
            )}
            <span>{activeCollection?.name ?? "No collection selected"}</span>
          </div>
        </div>
        {exportCheck && !exportCheck.ok && (
          <div className="status-box status-box--warning">
            <strong>Structure check:</strong>
            <ul>
              {exportCheck.issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        {secretWarnings.length > 0 && (
          <div className="status-box status-box--error">
            <strong>Possible secret leak:</strong>
            <ul>
              {secretWarnings.map((warning, index) => (
                <li key={index}>{warning.message}</li>
              ))}
            </ul>
          </div>
        )}
        {otherWarnings.length > 0 && (
          <div className="status-box status-box--warning">
            <ul>
              {otherWarnings.map((warning, index) => (
                <li key={index}>{warning.message}</li>
              ))}
            </ul>
          </div>
        )}
        <pre className="export-preview">{exportContent}</pre>
      </div>
    </section>
  );
}

function SettingsScreen({
  settings,
  onChange,
  workspaceName,
  onWorkspaceNameChange,
  onNewWorkspace
}: {
  settings: AppSettings;
  onChange(patch: Partial<AppSettings>): void;
  workspaceName: string;
  onWorkspaceNameChange(name: string): void;
  onNewWorkspace(): void;
}) {
  return (
    <section className="settings-layout">
      <div className="pane">
        <div className="pane__header">
          <h2>Settings</h2>
        </div>
        <h3>Workspace</h3>
        <label className="field">
          <span>Workspace name</span>
          <input onChange={(event) => onWorkspaceNameChange(event.target.value)} value={workspaceName} />
        </label>
        <button className="secondary-button" onClick={onNewWorkspace} type="button">
          <Plus size={16} />
          New workspace
        </button>
        <h3>Requests</h3>
        <label className="field">
          <span>Request timeout (ms)</span>
          <input
            min={0}
            onChange={(event) =>
              onChange({ requestTimeoutMs: Math.max(0, Number(event.target.value) || 0) })
            }
            type="number"
            value={settings.requestTimeoutMs}
          />
        </label>
        <label className="field">
          <span>Max response size (MB)</span>
          <input
            min={1}
            onChange={(event) =>
              onChange({
                maxResponseBytes: Math.max(1, Number(event.target.value) || 1) * 1024 * 1024
              })
            }
            type="number"
            value={Math.round(settings.maxResponseBytes / (1024 * 1024))}
          />
        </label>
        <label className="check-row">
          <input
            checked={settings.allowInsecureTls}
            onChange={(event) => onChange({ allowInsecureTls: event.target.checked })}
            type="checkbox"
          />
          <span>Allow insecure TLS (self-signed / internal CA certificates)</span>
        </label>
        {settings.allowInsecureTls && (
          <div className="status-box status-box--warning">
            TLS certificate verification is disabled for outgoing requests. Only enable this on trusted internal networks.
          </div>
        )}
      </div>
    </section>
  );
}

function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 256 256" role="img" aria-label="Specfold">
      <defs>
        <linearGradient id="brand-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563EB" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="56" fill="url(#brand-badge)" />
      <g stroke="#ffffff" strokeWidth="13" strokeLinecap="round">
        <line x1="92" y1="96" x2="176" y2="104" />
        <line x1="176" y1="104" x2="120" y2="176" />
        <line x1="120" y1="176" x2="92" y2="96" />
      </g>
      <g fill="#ffffff">
        <circle cx="92" cy="96" r="19" />
        <circle cx="176" cy="104" r="19" />
        <circle cx="120" cy="176" r="19" />
      </g>
    </svg>
  );
}

function authForType(type: AuthConfig["type"]): AuthConfig {
  if (type === "bearer") {
    return { type, token: "{{accessToken}}" };
  }
  if (type === "basic") {
    return { type, username: "{{username}}", password: "{{password}}" };
  }
  if (type === "apiKey") {
    return { type, in: "header", key: "X-API-Key", value: "{{apiKey}}" };
  }
  return { type: "none" };
}

function activeRequestFolderId(collection: Collection | undefined, requestId: string): string | undefined {
  if (!collection) {
    return undefined;
  }
  return findRequest(collection, requestId)?.folder?.id;
}

function isBaseUrlVariable(variable: Pick<EnvironmentVariable, "name">): boolean {
  return variable.name.trim() === "baseUrl";
}

function environmentBaseUrl(environment: Environment): string {
  return environment.variables.find(isBaseUrlVariable)?.value ?? "";
}

function applyEnvironmentBaseUrlToCollection(
  collection: Collection,
  environment: Environment | undefined
): void {
  const baseUrl = environment ? environmentBaseUrl(environment).trim() : "";
  if (baseUrl) {
    collection.baseUrl = baseUrl;
  }
}

function upsertEnvironmentBaseUrl(environment: Environment, value: string): void {
  const nextValue = value.trim();
  const existing = environment.variables.find(isBaseUrlVariable);
  const customVariables = environment.variables.filter((variable) => !isBaseUrlVariable(variable));
  if (!nextValue) {
    environment.variables = customVariables;
    return;
  }
  const baseUrl = existing ?? createEnvironmentVariable("baseUrl", nextValue);
  baseUrl.name = "baseUrl";
  baseUrl.value = nextValue;
  baseUrl.enabled = true;
  baseUrl.secret = false;
  environment.variables = [baseUrl, ...customVariables];
}

function replaceEnvironmentCustomVariables(
  environment: Environment,
  variables: EnvironmentVariable[]
): void {
  const baseUrl = environment.variables.find(isBaseUrlVariable) ?? variables.find(isBaseUrlVariable);
  const customVariables = variables.filter((variable) => !isBaseUrlVariable(variable));
  environment.variables = baseUrl ? [baseUrl, ...customVariables] : customVariables;
}

function firstRequestId(collection: Collection): string | undefined {
  return flattenRequests(collection)[0]?.request.id;
}

function createEnvironmentVariable(name: string, value: string): EnvironmentVariable {
  return {
    id: createId("var"),
    name,
    value,
    enabled: true,
    secret: name.toLowerCase().includes("token") || name.toLowerCase().includes("password")
  };
}

function saveStatusLabel(status: SaveStatus): string {
  if (status === "dirty") {
    return "Unsaved";
  }
  if (status === "saving") {
    return "Saving";
  }
  if (status === "error") {
    return "Save failed";
  }
  return "Saved";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatHistoryTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString();
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function tabLabel(tab: string): string {
  if (tab === "raw") {
    return "Raw";
  }
  return tab.charAt(0).toUpperCase() + tab.slice(1);
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

/**
 * Read a dotted/bracketed path (e.g. "data.token", "items[0].id") out of a
 * JSON response body. Returns undefined when the body is not JSON or the path
 * does not resolve.
 */
function extractJsonPath(body: string, path: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }

  const segments = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

  let current: unknown = parsed;
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return current;
}
