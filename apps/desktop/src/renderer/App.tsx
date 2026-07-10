import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileJson,
  FolderPlus,
  Import,
  Play,
  Plus,
  Save,
  Send,
  Settings,
  Wand2
} from "lucide-react";
import {
  createCollection,
  createEmptyWorkspace,
  createEnvironment,
  createFolder,
  createId,
  createJwtRequest,
  createKeyValue,
  createRequest,
  exportCollectionToOpenApiResult,
  findFolder,
  findRequest,
  flattenFolders,
  flattenRequests,
  importApiDocument,
  parseCollectionJson,
  previewApiDocument,
  removeRequest,
  serializeCollectionJson,
  type ApiRequest,
  type AuthConfig,
  type Collection,
  type Environment,
  type EnvironmentVariable,
  type ExportWarning,
  type GroupingStrategy,
  type HttpMethod,
  type KeyValue,
  type Workspace
} from "@openapi-collection-studio/core";
import { CollectionTree } from "./components/CollectionTree";
import { KeyValueEditor } from "./components/KeyValueEditor";

type Screen = "home" | "import" | "editor" | "environments" | "export" | "settings";
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

const methods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

export function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => createEmptyWorkspace());
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [activeCollectionId, setActiveCollectionId] = useState<string>();
  const [selectedFolderId, setSelectedFolderId] = useState<string>();
  const [selectedRequestId, setSelectedRequestId] = useState<string>();
  const [requestTab, setRequestTab] = useState<RequestTab>("params");
  const [response, setResponse] = useState<ResponseState>();
  const [isSending, setIsSending] = useState(false);
  const [importText, setImportText] = useState("");
  const [grouping, setGrouping] = useState<GroupingStrategy>("tags");
  const [importError, setImportError] = useState("");
  const [importSummary, setImportSummary] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("openapi-yaml");
  const [exportFolderIds, setExportFolderIds] = useState<string[]>([]);
  const [includeAllComponents, setIncludeAllComponents] = useState(true);
  const [includeExamples, setIncludeExamples] = useState(false);
  const [pruneUnusedComponents, setPruneUnusedComponents] = useState(true);
  const [savedExportPath, setSavedExportPath] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState<string>();
  const saveTimer = useRef<number>();

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

  const exportResult = useMemo<{ content: string; warnings: ExportWarning[] }>(() => {
    if (!activeCollection) {
      return { content: "", warnings: [] };
    }
    if (exportFormat === "collection-json") {
      return { content: serializeCollectionJson(activeCollection), warnings: [] };
    }
    return exportCollectionToOpenApiResult(activeCollection, {
      format: exportFormat === "openapi-json" ? "json" : "yaml",
      folderIds: exportFolderIds,
      useFolderNamesAsTags: true,
      includeRequestExamples: includeExamples,
      includeParameterExamples: includeExamples,
      includeResponseExamples: true,
      includeBearerJwtSecurityScheme: true,
      includeAllComponents,
      pruneUnusedComponents
    });
  }, [
    activeCollection,
    exportFolderIds,
    exportFormat,
    includeAllComponents,
    includeExamples,
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
    setScreen("home");
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

  const addRequest = (kind: "blank" | "jwt") => {
    if (!activeCollection) {
      return;
    }
    const request = kind === "jwt" ? createJwtRequest() : createRequest({ name: "New Request" });
    const existingAuthFolder = activeCollection.folders.find((folder) => folder.name === "Auth");
    const newAuthFolder = kind === "jwt" && !existingAuthFolder ? createFolder("Auth") : undefined;
    const targetFolderId =
      kind === "jwt" ? existingAuthFolder?.id ?? newAuthFolder?.id : selectedFolderId;
    mutateWorkspace((draft) => {
      const collection = draft.collections.find((candidate) => candidate.id === activeCollection.id);
      if (!collection) {
        return;
      }
      let folder = targetFolderId ? findFolder(collection, targetFolderId) : undefined;
      if (newAuthFolder && !folder) {
        collection.folders.push(newAuthFolder);
        folder = newAuthFolder;
      }
      if (folder) {
        folder.requests.push(request);
      } else {
        collection.requests.push(request);
      }
    });
    setSelectedFolderId(targetFolderId);
    setSelectedRequestId(request.id);
    setRequestTab(kind === "jwt" ? "body" : "params");
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

  const handlePreviewImport = () => {
    setImportError("");
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

  const handleImport = () => {
    setImportError("");
    try {
      let collection: Collection;
      try {
        collection = parseCollectionJson(importText);
      } catch {
        collection = importApiDocument(importText, { grouping }).collection;
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

  const sendActiveRequest = async () => {
    if (!activeRequest) {
      return;
    }
    setIsSending(true);
    setResponse(undefined);
    const result = await window.studio.sendRequest(activeRequest, activeEnvironment);
    setResponse(result);
    setIsSending(false);
  };

  const updateEnvironment = (environmentId: string, recipe: (environment: Environment) => void) => {
    mutateWorkspace((draft) => {
      const environment = draft.environments.find((candidate) => candidate.id === environmentId);
      if (environment) {
        recipe(environment);
      }
    });
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

  if (!loaded) {
    return <div className="loading">Loading workspace...</div>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>OpenAPI Collection Studio</h1>
          <p>{workspace.collections.length} collections | {workspace.environments.length} environments</p>
        </div>
        <div className="topbar__actions">
          <span className={`save-status save-status--${saveStatus}`}>{saveStatusLabel(saveStatus)}</span>
          <button className="secondary-button" onClick={() => void saveWorkspaceNow()} type="button">
            <Save size={16} />
            Save
          </button>
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
        </div>
      </header>

      <nav className="screen-tabs">
        <TabButton active={screen === "home"} icon={<FileJson size={17} />} onClick={() => setScreen("home")}>
          Home
        </TabButton>
        <TabButton active={screen === "import"} icon={<Import size={17} />} onClick={() => setScreen("import")}>
          Import
        </TabButton>
        <TabButton active={screen === "editor"} icon={<Send size={17} />} onClick={() => setScreen("editor")}>
          Editor
        </TabButton>
        <TabButton active={screen === "environments"} icon={<Settings size={17} />} onClick={() => setScreen("environments")}>
          Environments
        </TabButton>
        <TabButton active={screen === "export"} icon={<Download size={17} />} onClick={() => setScreen("export")}>
          Export
        </TabButton>
        <TabButton active={screen === "settings"} icon={<Settings size={17} />} onClick={() => setScreen("settings")}>
          Settings
        </TabButton>
      </nav>

      {notice && (
        <div className="notice-banner">
          <span>{notice}</span>
          <button className="icon-button" onClick={() => setNotice(undefined)} type="button">
            x
          </button>
        </div>
      )}

      <main className="content">
        {screen === "home" && (
          <HomeScreen
            activeCollection={activeCollection}
            onAddCollection={addCollection}
            onAddJwtRequest={() => addRequest("jwt")}
            onGoEditor={() => setScreen("editor")}
            onGoImport={() => setScreen("import")}
            onNewWorkspace={createNewWorkspace}
            onWorkspaceNameChange={(name) =>
              mutateWorkspace((draft) => {
                draft.name = name;
              })
            }
            workspace={workspace}
          />
        )}
        {screen === "import" && (
          <ImportScreen
            grouping={grouping}
            importError={importError}
            importSummary={importSummary}
            importText={importText}
            onGroupingChange={setGrouping}
            onImport={handleImport}
            onPreview={handlePreviewImport}
            onTextChange={setImportText}
          />
        )}
        {screen === "editor" && (
          <EditorScreen
            activeCollection={activeCollection}
            activeRequest={activeRequest}
            folderOptions={activeCollection ? flattenFolders(activeCollection) : []}
            isSending={isSending}
            onAddCollection={addCollection}
            onAddFolder={addFolder}
            onAddJwtRequest={() => addRequest("jwt")}
            onAddRequest={() => addRequest("blank")}
            onMoveRequest={moveActiveRequest}
            onRequestTabChange={setRequestTab}
            onSelectCollection={selectCollection}
            onSelectFolder={(folderId) => setSelectedFolderId(folderId)}
            onSelectRequest={(requestId) => {
              setSelectedRequestId(requestId);
              setResponse(undefined);
            }}
            onSend={sendActiveRequest}
            onUpdateRequest={updateActiveRequest}
            onAssignResponseValue={assignResponseValue}
            environmentVariableNames={activeEnvironment?.variables.map((variable) => variable.name) ?? []}
            requestTab={requestTab}
            response={response}
            selectedFolderId={selectedFolderId}
            selectedRequestId={selectedRequestId}
            workspace={workspace}
          />
        )}
        {screen === "settings" && (
          <SettingsScreen settings={settings} onChange={updateSettings} />
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
            onUpdateEnvironment={updateEnvironment}
          />
        )}
        {screen === "export" && (
          <ExportScreen
            activeCollection={activeCollection}
            exportContent={exportContent}
            exportWarnings={exportResult.warnings}
            exportFolderIds={exportFolderIds}
            exportFormat={exportFormat}
            includeAllComponents={includeAllComponents}
            includeExamples={includeExamples}
            pruneUnusedComponents={pruneUnusedComponents}
            onExportFolderIdsChange={setExportFolderIds}
            onExportFormatChange={setExportFormat}
            onIncludeAllComponentsChange={setIncludeAllComponents}
            onIncludeExamplesChange={setIncludeExamples}
            onPruneUnusedComponentsChange={setPruneUnusedComponents}
            onSave={saveExport}
            savedExportPath={savedExportPath}
          />
        )}
      </main>
    </div>
  );
}

function HomeScreen({
  workspace,
  activeCollection,
  onGoImport,
  onGoEditor,
  onAddCollection,
  onAddJwtRequest,
  onNewWorkspace,
  onWorkspaceNameChange
}: {
  workspace: Workspace;
  activeCollection?: Collection;
  onGoImport(): void;
  onGoEditor(): void;
  onAddCollection(): void;
  onAddJwtRequest(): void;
  onNewWorkspace(): void;
  onWorkspaceNameChange(name: string): void;
}) {
  const requestCount = workspace.collections.reduce(
    (total, collection) => total + flattenRequests(collection).length,
    0
  );

  return (
    <section className="home-grid">
      <div className="workspace-header">
        <label className="field">
          <span>Workspace</span>
          <input
            onChange={(event) => onWorkspaceNameChange(event.target.value)}
            value={workspace.name}
          />
        </label>
        <button className="secondary-button" onClick={onNewWorkspace} type="button">
          <Plus size={17} />
          New workspace
        </button>
      </div>
      <div className="summary-band">
        <div>
          <span className="metric">{workspace.collections.length}</span>
          <span>Collections</span>
        </div>
        <div>
          <span className="metric">{requestCount}</span>
          <span>Requests</span>
        </div>
        <div>
          <span className="metric">{workspace.environments.length}</span>
          <span>Environments</span>
        </div>
      </div>
      <div className="action-strip">
        <button className="primary-button" onClick={onGoImport} type="button">
          <Import size={17} />
          Import OpenAPI
        </button>
        <button className="secondary-button" onClick={onAddCollection} type="button">
          <Plus size={17} />
          New collection
        </button>
        <button className="secondary-button" disabled={!activeCollection} onClick={onAddJwtRequest} type="button">
          <Wand2 size={17} />
          JWT request
        </button>
        <button className="secondary-button" disabled={!activeCollection} onClick={onGoEditor} type="button">
          <Send size={17} />
          Open editor
        </button>
      </div>
      <div className="workspace-table">
        <div className="workspace-table__head">
          <span>Collection</span>
          <span>Version</span>
          <span>Requests</span>
        </div>
        {workspace.collections.map((collection) => (
          <div className="workspace-table__row" key={collection.id}>
            <span>{collection.name}</span>
            <span>{collection.version ?? "0.1.0"}</span>
            <span>{flattenRequests(collection).length}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ImportScreen({
  importText,
  grouping,
  importSummary,
  importError,
  onTextChange,
  onGroupingChange,
  onPreview,
  onImport
}: {
  importText: string;
  grouping: GroupingStrategy;
  importSummary: string;
  importError: string;
  onTextChange(value: string): void;
  onGroupingChange(value: GroupingStrategy): void;
  onPreview(): void;
  onImport(): void;
}) {
  return (
    <section className="import-layout">
      <div className="pane">
        <div className="pane__header">
          <h2>Import</h2>
          <div className="button-row">
            <button className="secondary-button" onClick={onPreview} type="button">
              <Play size={16} />
              Preview
            </button>
            <button className="primary-button" disabled={!importText.trim()} onClick={onImport} type="button">
              <Import size={16} />
              Import
            </button>
          </div>
        </div>
        <textarea
          className="source-textarea"
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Paste OpenAPI 3.x, Swagger 2.0, or Collection JSON"
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
        <div className={importError ? "status-box status-box--error" : "status-box"}>
          {importError || importSummary || "Preview results appear here."}
        </div>
      </aside>
    </section>
  );
}

function EditorScreen({
  workspace,
  activeCollection,
  activeRequest,
  selectedFolderId,
  selectedRequestId,
  requestTab,
  response,
  folderOptions,
  isSending,
  onSelectCollection,
  onSelectFolder,
  onSelectRequest,
  onAddCollection,
  onAddFolder,
  onAddRequest,
  onAddJwtRequest,
  onUpdateRequest,
  onMoveRequest,
  onRequestTabChange,
  onSend,
  onAssignResponseValue,
  environmentVariableNames
}: {
  workspace: Workspace;
  activeCollection?: Collection;
  activeRequest?: ApiRequest;
  selectedFolderId?: string;
  selectedRequestId?: string;
  requestTab: RequestTab;
  response?: ResponseState;
  folderOptions: ReturnType<typeof flattenFolders>;
  isSending: boolean;
  onSelectCollection(collectionId: string): void;
  onSelectFolder(folderId: string): void;
  onSelectRequest(requestId: string): void;
  onAddCollection(): void;
  onAddFolder(): void;
  onAddRequest(): void;
  onAddJwtRequest(): void;
  onUpdateRequest(recipe: (request: ApiRequest) => void): void;
  onMoveRequest(folderId: string): void;
  onRequestTabChange(tab: RequestTab): void;
  onSend(): void;
  onAssignResponseValue(path: string, variableName: string): void;
  environmentVariableNames: string[];
}) {
  return (
    <section className="editor-layout">
      <aside className="sidebar">
        <div className="sidebar__toolbar">
          <button className="icon-button" onClick={onAddCollection} title="New collection" type="button">
            <Plus size={16} />
          </button>
          <button className="icon-button" disabled={!activeCollection} onClick={onAddFolder} title="New folder" type="button">
            <FolderPlus size={16} />
          </button>
          <button className="icon-button" disabled={!activeCollection} onClick={onAddRequest} title="New request" type="button">
            <Send size={16} />
          </button>
          <button className="icon-button" disabled={!activeCollection} onClick={onAddJwtRequest} title="JWT token request" type="button">
            <Wand2 size={16} />
          </button>
          <select
            aria-label="New Request From Template"
            className="toolbar-menu"
            disabled={!activeCollection}
            onChange={(event) => {
              if (event.target.value === "jwt") {
                onAddJwtRequest();
              }
              event.target.value = "";
            }}
            value=""
          >
            <option value="">Templates</option>
            <option value="jwt">JWT Token Request</option>
          </select>
        </div>
        <CollectionTree
          activeCollectionId={activeCollection?.id}
          collections={workspace.collections}
          onSelectCollection={onSelectCollection}
          onSelectFolder={onSelectFolder}
          onSelectRequest={onSelectRequest}
          selectedFolderId={selectedFolderId}
          selectedRequestId={selectedRequestId}
        />
      </aside>
      <div className="request-panel">
        {activeRequest ? (
          <>
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
            </div>
            <div className="request-tabs">
              {(["params", "auth", "headers", "body"] as RequestTab[]).map((tab) => (
                <button
                  className={requestTab === tab ? "tab is-active" : "tab"}
                  key={tab}
                  onClick={() => onRequestTabChange(tab)}
                  type="button"
                >
                  {tab}
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
        {(["none", "json", "raw"] as const).map((mode) => (
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
              })
            }
            type="button"
          >
            {mode}
          </button>
        ))}
      </div>
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
  onAssignResponseValue,
  environmentVariableNames
}: {
  response?: ResponseState;
  onAssignResponseValue(path: string, variableName: string): void;
  environmentVariableNames: string[];
}) {
  const [responseTab, setResponseTab] = useState<ResponseTab>("body");
  const [assignPath, setAssignPath] = useState("access_token");
  const [assignVariable, setAssignVariable] = useState("accessToken");

  useEffect(() => {
    setResponseTab("body");
  }, [response?.status, response?.body, response?.rawBody]);

  const isJsonResponse = Boolean(response && !response.error && looksLikeJson(response.rawBody));

  return (
    <aside className="response-panel">
      <div className="response-panel__head">
        <h2>Response</h2>
        {response && !response.error && (
          <span className="status-pill">
            {response.status} | {response.durationMs} ms | {formatBytes(response.sizeBytes)}
          </span>
        )}
      </div>
      {response?.error && <div className="status-box status-box--error">{response.error}</div>}
      {response?.truncated && (
        <div className="status-box status-box--warning">
          Response was larger than the size limit and has been truncated. Increase the limit in Settings if needed.
        </div>
      )}
      {response && !response.error ? (
        <>
          <div className="response-tabs">
            {(["body", "headers", "raw"] as ResponseTab[]).map((tab) => (
              <button
                className={responseTab === tab ? "tab is-active" : "tab"}
                key={tab}
                onClick={() => setResponseTab(tab)}
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>
          <pre>
            {responseTab === "headers"
              ? JSON.stringify(response.headers, null, 2)
              : responseTab === "raw"
                ? response.rawBody
                : response.body}
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
  onUpdateEnvironment
}: {
  environments: Environment[];
  activeEnvironmentId?: string;
  onSelectEnvironment(environmentId: string): void;
  onCreateEnvironment(): void;
  onDeleteEnvironment(environmentId: string): void;
  onUpdateEnvironment(environmentId: string, recipe: (environment: Environment) => void): void;
}) {
  const active = environments.find((environment) => environment.id === activeEnvironmentId) ?? environments[0];

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
            <EnvironmentVariableEditor
              variables={active.variables}
              onChange={(variables) =>
                onUpdateEnvironment(active.id, (environment) => {
                  environment.variables = variables;
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
  includeAllComponents,
  includeExamples,
  pruneUnusedComponents,
  savedExportPath,
  onExportFormatChange,
  onExportFolderIdsChange,
  onIncludeAllComponentsChange,
  onIncludeExamplesChange,
  onPruneUnusedComponentsChange,
  onSave
}: {
  activeCollection?: Collection;
  exportFormat: ExportFormat;
  exportFolderIds: string[];
  exportContent: string;
  exportWarnings: ExportWarning[];
  includeAllComponents: boolean;
  includeExamples: boolean;
  pruneUnusedComponents: boolean;
  savedExportPath: string;
  onExportFormatChange(format: ExportFormat): void;
  onExportFolderIdsChange(folderIds: string[]): void;
  onIncludeAllComponentsChange(value: boolean): void;
  onIncludeExamplesChange(value: boolean): void;
  onPruneUnusedComponentsChange(value: boolean): void;
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
        <button className="primary-button" disabled={!activeCollection} onClick={onSave} type="button">
          <Save size={16} />
          Save file
        </button>
        {savedExportPath && <div className="status-box">Saved to {savedExportPath}</div>}
      </aside>
      <div className="pane">
        <div className="pane__header">
          <h2>Preview</h2>
          <span>{activeCollection?.name ?? "No collection selected"}</span>
        </div>
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
  onChange
}: {
  settings: AppSettings;
  onChange(patch: Partial<AppSettings>): void;
}) {
  return (
    <section className="settings-layout">
      <div className="pane">
        <div className="pane__header">
          <h2>Settings</h2>
        </div>
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

function TabButton({
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
    <button className={active ? "screen-tab is-active" : "screen-tab"} onClick={onClick} type="button">
      {icon}
      {children}
    </button>
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
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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
