import { useEffect, useMemo, useRef, useState } from "react";
import {
  cloneFolder, cloneRequest, collectCollectionSecretWarnings, countFolderRequests, createApinizerJwtRequest, createCollection,
  createEmptyWorkspace, createEnvironment, createFolder, createId, createJwtRequest,
  createKeyValue, createRequest, checkOpenApiDocument, exportCollectionToOpenApiResult,
  looksLikeCurl, parseCurlCommand, requestToCurl, findFolder, findRequest, flattenRequests,
  importDocument, importPostmanV3Folder, listOperations, previewImportDocument,
  previewPostmanV3Folder, relocateFolder, relocateRequest, removeFolder, removeRequest,
  serializeCollectionJson, exportCollectionToHttpFile, exportCollectionToPostman,
  type ApiRequest, type Collection, type Environment, type ExportWarning, type GroupingStrategy,
  type ImportOperationSummary, type OpenApiCheckResult, type PostmanV3FolderSource, type ReimportDiff, type Workspace
} from "@openapi-collection-studio/core";
import { firstRequestId } from "./helpers";
import { DEFAULT_SETTINGS } from "./types";
import { applyThemePreference, observeThemePreference } from "./theme";
import type { AppSettings, ExportFormat, RequestTab, ResponseHistoryEntry, ResponseState, SaveStatus, Screen } from "./types";

export function useStudioState() {
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
  const [postmanFolderSource, setPostmanFolderSource] = useState<PostmanV3FolderSource>();
  const [postmanFolderPath, setPostmanFolderPath] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [isFetchingImport, setIsFetchingImport] = useState(false);
  const [importOperations, setImportOperations] = useState<ImportOperationSummary[]>([]);
  const [selectedImportKeys, setSelectedImportKeys] = useState<Set<string>>(new Set());
  // Anchor index for Shift-click range selection in the import operations list.
  const lastImportIndexRef = useRef<number | null>(null);
  const [grouping, setGrouping] = useState<GroupingStrategy>("tags");
  const [importError, setImportError] = useState("");
  const [importSummary, setImportSummary] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importTargetCollectionId, setImportTargetCollectionId] = useState("");
  const [importDiff, setImportDiff] = useState<ReimportDiff>();
  const [exportFormat, setExportFormat] = useState<ExportFormat>("openapi-yaml");
  const [exportFolderIds, setExportFolderIds] = useState<string[]>([]);
  const [includeAllComponents, setIncludeAllComponents] = useState(true);
  const [includeExamples, setIncludeExamples] = useState(false);
  const [pruneUnusedComponents, setPruneUnusedComponents] = useState(true);
  const [preferSourceOperation, setPreferSourceOperation] = useState(true);
  const [savedExportPath, setSavedExportPath] = useState("");
  const [savedBackupPath, setSavedBackupPath] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState<string>();
  const [secureStorageAvailable, setSecureStorageAvailable] = useState(true);
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
      setSecureStorageAvailable(result.secureStorageAvailable);
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
    applyThemePreference(settings.theme);
    return observeThemePreference(settings.theme);
  }, [settings.theme]);

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
      if (postmanFolderSource || !importText.trim() || looksLikeCurl(importText)) {
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
  }, [importText, postmanFolderSource]);

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
    if (screen !== "export" || !activeCollection) {
      return { content: "", warnings: [] };
    }
    if (exportFormat === "collection-json") {
      return {
        content: serializeCollectionJson(activeCollection),
        warnings: collectCollectionSecretWarnings(activeCollection)
      };
    }
    if (exportFormat === "postman-json" || exportFormat === "http-file") {
      return {
        content: exportFormat === "postman-json" ? exportCollectionToPostman(activeCollection) : exportCollectionToHttpFile(activeCollection),
        warnings: collectCollectionSecretWarnings(activeCollection)
      };
    }
    const result = exportCollectionToOpenApiResult(activeCollection, {
      format: exportFormat === "openapi-json" ? "json" : "yaml",
      folderIds: exportFolderIds,
      useFolderNamesAsTags: true,
      includeRequestExamples: includeExamples,
      includeParameterExamples: includeExamples,
      includeResponseExamples: includeExamples,
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
    pruneUnusedComponents,
    screen
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

  return { workspace, setWorkspace, loaded, setLoaded, screen, setScreen,
    activeCollectionId, setActiveCollectionId, selectedFolderId, setSelectedFolderId,
    selectedRequestId, setSelectedRequestId, requestTab, setRequestTab, response, setResponse,
    responseHistory, setResponseHistory, isSending, setIsSending, importText, setImportText,
    postmanFolderSource, setPostmanFolderSource, postmanFolderPath, setPostmanFolderPath,
    importUrl, setImportUrl, isFetchingImport, setIsFetchingImport, importOperations,
    setImportOperations, selectedImportKeys, setSelectedImportKeys, lastImportIndexRef,
    grouping, setGrouping, importError, setImportError, importSummary, setImportSummary, importWarnings, setImportWarnings,
    importTargetCollectionId, setImportTargetCollectionId, importDiff, setImportDiff,
    exportFormat, setExportFormat, exportFolderIds, setExportFolderIds, includeAllComponents,
    setIncludeAllComponents, includeExamples, setIncludeExamples, pruneUnusedComponents,
    setPruneUnusedComponents, preferSourceOperation, setPreferSourceOperation, savedExportPath,
    setSavedExportPath, savedBackupPath, setSavedBackupPath, saveStatus, setSaveStatus,
    settings, setSettings, notice, setNotice, activeCollection, activeRequestLocation,
    activeRequest, activeEnvironment, exportResult, exportContent, mutateWorkspace, saveWorkspaceNow,
    saveTimer, secureStorageAvailable, setSecureStorageAvailable };
}

export type StudioState = ReturnType<typeof useStudioState>;
