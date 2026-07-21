import {
  cloneFolder, cloneRequest, countFolderRequests, createApinizerJwtRequest, createCollection,
  createEmptyWorkspace, createEnvironment, createFolder, createId, createJwtRequest,
  createKeyValue, createRequest, checkOpenApiDocument, exportCollectionToOpenApiResult,
  looksLikeCurl, parseCurlCommand, requestToCurl, findFolder, findRequest, flattenRequests,
  applySafeReimport, importDocument, importPostmanV3Folder, listOperations, previewImportDocument, previewSafeReimport,
  previewPostmanV3Folder, relocateFolder, relocateRequest, removeFolder, removeRequest,
  serializeCollectionJson,
  type ApiRequest, type Collection, type Environment, type ExportWarning, type GroupingStrategy,
  type ImportOperationSummary, type OpenApiCheckResult, type PostmanV3FolderSource, type Workspace
} from "@openapi-collection-studio/core";
import { applyEnvironmentBaseUrlToCollection, firstRequestId } from "./helpers";
import type { StudioState } from "./useStudioState";
import type { WorkspaceController } from "./useWorkspaceController";

export function useImportController(state: StudioState, workspaceController: WorkspaceController) {
  const { workspace, setWorkspace, loaded, setLoaded, screen, setScreen,
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
    activeRequest, activeEnvironment, exportResult, exportContent, mutateWorkspace, saveWorkspaceNow } = state;
  const { mutateCollection } = workspaceController;
  const openImportFile = async () => {
    const result = await window.studio.openImportFile();
    if (result.canceled) {
      return;
    }
    if (result.error) {
      setImportSummary("");
      setImportError(result.error);
      setImportWarnings([]);
      setImportDiff(undefined);
      return;
    }
    if (result.content !== undefined) {
      setPostmanFolderSource(undefined);
      setPostmanFolderPath("");
      setImportText(result.content);
      setImportError("");
      setImportWarnings([]);
      setImportDiff(undefined);
      setImportSummary(result.filePath ? `Loaded ${result.filePath}` : "File loaded.");
    }
  };

  const openPostmanFolder = async () => {
    const result = await window.studio.openPostmanFolder();
    if (result.canceled) {
      return;
    }
    if (result.error || !result.source) {
      setImportSummary("");
      setImportError(result.error ?? "The selected folder could not be loaded.");
      setImportWarnings([]);
      setImportDiff(undefined);
      return;
    }
    try {
      const preview = previewPostmanV3Folder(result.source);
      setImportText("");
      setPostmanFolderSource(result.source);
      setPostmanFolderPath(result.folderPath ?? result.source.rootName);
      setImportError("");
      setImportWarnings([]);
      setImportDiff(undefined);
      setImportSummary(
        `${preview.label} ${preview.version ?? ""} - ${preview.requestCount} requests in ${preview.containerCount} folders`
      );
    } catch (error) {
      setImportSummary("");
      setImportError(error instanceof Error ? error.message : String(error));
      setImportWarnings([]);
      setImportDiff(undefined);
    }
  };

  const fetchImportUrl = async () => {
    const url = importUrl.trim();
    if (!url) {
      return;
    }
    setIsFetchingImport(true);
    setImportError("");
    setImportWarnings([]);
    setImportDiff(undefined);
    const result = await window.studio.fetchImportUrl(url);
    setIsFetchingImport(false);
    if (result.ok && result.content !== undefined) {
      setPostmanFolderSource(undefined);
      setPostmanFolderPath("");
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
    if (postmanFolderSource) {
      try {
        const preview = previewPostmanV3Folder(postmanFolderSource);
        const analyzed = importPostmanV3Folder(postmanFolderSource, { grouping });
        setImportWarnings(analyzed.warnings);
        setImportDiffFor(analyzed.collections[0]);
        setImportSummary(
          `${preview.label} ${preview.version ?? ""} - ${preview.requestCount} requests in ${preview.containerCount} folders`
        );
      } catch (error) {
        setImportSummary("");
        setImportError(error instanceof Error ? error.message : String(error));
        setImportWarnings([]);
        setImportDiff(undefined);
      }
      return;
    }
    if (looksLikeCurl(importText)) {
      try {
        const request = parseCurlCommand(importText);
        setImportWarnings([]);
        setImportDiff(undefined);
        setImportSummary(`cURL command: ${request.method} ${request.url}`);
      } catch (error) {
        setImportSummary("");
        setImportError(error instanceof Error ? error.message : String(error));
        setImportWarnings([]);
        setImportDiff(undefined);
      }
      return;
    }
    try {
      const preview = previewImportDocument(importText);
      const analyzed = importDocument(importText, { grouping });
      setImportWarnings(analyzed.warnings);
      setImportDiffFor(analyzed.collections[0]);
      const version = preview.version ? ` ${preview.version}` : "";
      setImportSummary(
        `${preview.label}${version} ${preview.format.toUpperCase()} - ${preview.requestCount} requests in ${preview.containerCount} ${preview.containerLabel}`
      );
    } catch (error) {
      setImportSummary("");
      setImportError(error instanceof Error ? error.message : String(error));
      setImportWarnings([]);
      setImportDiff(undefined);
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
      if (!activeEnvironment) {
        setImportError("Create or select an environment before importing collections and folders.");
        return;
      }
      if (!postmanFolderSource && looksLikeCurl(importText)) {
        importCurl();
        return;
      }
      if (importOperations.length > 0 && selectedImportKeys.size === 0) {
        setImportError("Select at least one operation to import.");
        return;
      }

      const imported = postmanFolderSource
        ? importPostmanV3Folder(postmanFolderSource, { grouping })
        : importDocument(importText, {
            grouping,
            operationKeys:
              importOperations.length > 0 && selectedImportKeys.size < importOperations.length
                ? [...selectedImportKeys]
                : undefined
          });
      const collection = imported.collections[0];
      if (!collection) {
        throw new Error("The document did not contain an importable collection.");
      }

      const target = importTargetCollectionId
        ? workspace.collections.find((candidate) => candidate.id === importTargetCollectionId)
        : undefined;
      const canUpdate = Boolean(target && imported.collections.length === 1);
      const diff = canUpdate ? previewSafeReimport(target!, collection) : undefined;
      mutateWorkspace((draft) => {
        if (canUpdate) {
          const draftTarget = draft.collections.find((candidate) => candidate.id === target!.id);
          if (draftTarget) applySafeReimport(draftTarget, collection);
          return;
        }
        draft.collections.push(...imported.collections);
        draft.environments.push(...imported.environments);
        if (imported.environments[0]) {
          draft.activeEnvironmentId = imported.environments[0].id;
        }
      });
      setActiveCollectionId(canUpdate ? target!.id : collection.id);
      setSelectedFolderId(undefined);
      setSelectedRequestId(firstRequestId(collection));
      setImportSummary(canUpdate && diff
        ? `Updated ${target!.name}: ${diff.matched} matched, ${diff.added} added; ${diff.retained} existing request(s) left untouched.`
        : imported.collections.length === 1
          ? `Imported ${collection.name}`
          : `Imported ${imported.collections.length} collections`
      );
      if (imported.warnings.length > 0) {
        setImportWarnings(imported.warnings);
        const visibleWarnings = imported.warnings.slice(0, 3).join(" ");
        const remainder = imported.warnings.length - 3;
        setNotice(`${visibleWarnings}${remainder > 0 ? ` (+${remainder} more)` : ""}`);
      }
      setScreen("editor");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

  const setImportDiffFor = (incoming: Collection | undefined) => {
    const target = importTargetCollectionId
      ? workspace.collections.find((collection) => collection.id === importTargetCollectionId)
      : undefined;
    setImportDiff(target && incoming ? previewSafeReimport(target, incoming) : undefined);
  };

  return {
    openImportFile, openPostmanFolder, fetchImportUrl, toggleImportOperation,
    handlePreviewImport, importCurl, handleImport,
    setImportTargetCollectionId: (collectionId: string) => {
      setImportTargetCollectionId(collectionId);
      setImportDiff(undefined);
    }
  };
}
