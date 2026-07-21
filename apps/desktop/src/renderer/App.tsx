import { findFolder, flattenFolders } from "@openapi-collection-studio/core";
import { BrandMark } from "./app/BrandMark";
import { environmentBaseUrl, saveStatusLabel } from "./app/helpers";
import { CollectionsSidebar, WelcomeMain } from "./app/screens/CollectionsSidebar";
import { EnvironmentScreen } from "./app/screens/EnvironmentScreen";
import { ExportScreen } from "./app/screens/ExportScreen";
import { ImportScreen } from "./app/screens/ImportScreen";
import { RequestWorkspace } from "./app/screens/RequestEditor";
import { SettingsScreen } from "./app/screens/SettingsScreen";
import { useStudioController } from "./app/useStudioController";

export function App() {
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
    activeRequest, activeEnvironment, exportResult, exportContent, mutateWorkspace, saveWorkspaceNow,
    secureStorageAvailable,
    createNewWorkspace, addCollection, addFolder, addRequest, updateActiveRequest, moveActiveRequest,
    mutateCollection, openImportFile, openPostmanFolder, fetchImportUrl,
    toggleImportOperation, handlePreviewImport, handleImport, copyActiveRequestAsCurl,
    sendActiveRequest, updateEnvironment, updateEnvironmentBaseUrl, createNewEnvironment,
    updateSettings, assignResponseValue, saveResponseAsExample, saveExport, copyExportToClipboard, exportFullBackup,
    restoreFullBackup, deleteAllData, treeActions
  } = useStudioController();
  const activeFolder =
    activeRequestLocation?.folder ??
    (activeCollection && selectedFolderId
      ? findFolder(activeCollection, selectedFolderId)
      : undefined);
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

      {!secureStorageAvailable && (
        <div className="notice-banner notice-banner--security" role="alert">
          Secure storage is unavailable. Secret values remain usable for this session but are never saved to disk.
        </div>
      )}

      <div className="workspace">
        <CollectionsSidebar
          activeCollection={activeCollection}
          onAddApinizerJwtRequest={() => addRequest("apinizer-jwt")}
          onAddOAuthClientRequest={() => addRequest("oauth-client")}
          onAddOAuthPasswordRequest={() => addRequest("oauth-password")}
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
            importWarnings={importWarnings}
            importTargetCollectionId={importTargetCollectionId}
            importDiff={importDiff}
            collections={workspace.collections}
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
            onImportTargetChange={setImportTargetCollectionId}
            onOpenFile={openImportFile}
            onOpenPostmanFolder={openPostmanFolder}
            onPreview={handlePreviewImport}
            onTextChange={(value) => {
              setPostmanFolderSource(undefined);
              setPostmanFolderPath("");
              setImportWarnings([]);
              setImportDiff(undefined);
              setImportText(value);
            }}
            postmanFolderPath={postmanFolderPath}
          />
        )}
        {screen === "editor" &&
          (workspace.collections.length === 0 ? (
            <WelcomeMain onImport={() => setScreen("import")} onNewCollection={addCollection} />
          ) : (
            <RequestWorkspace
              activeCollection={activeCollection}
              activeFolder={activeFolder}
              activeRequest={activeRequest}
              activeEnvironmentBaseUrl={activeEnvironment ? environmentBaseUrl(activeEnvironment) : undefined}
              activeEnvironment={activeEnvironment}
              activeEnvironmentName={activeEnvironment?.name}
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
              onUpdateFolder={(recipe) =>
                activeCollection && activeFolder && mutateCollection(activeCollection.id, (collection) => {
                  const folder = findFolder(collection, activeFolder.id);
                  if (folder) {
                    recipe(folder);
                  }
                })
              }
              onUpdateRequest={updateActiveRequest}
              onAssignResponseValue={assignResponseValue}
              onSaveResponseExample={saveResponseAsExample}
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
            onExportBackup={exportFullBackup}
            onRestoreBackup={restoreFullBackup}
            onDeleteAllData={deleteAllData}
            savedBackupPath={savedBackupPath}
          />
        )}
        {screen === "environments" && (
          <EnvironmentScreen
            activeEnvironmentId={workspace.activeEnvironmentId}
            environments={workspace.environments}
            onCreateEnvironment={createNewEnvironment}
            onDeleteEnvironment={(environmentId) => {
              if (workspace.environments.length <= 1) {
                setNotice("At least one environment is required. Rename this environment instead.");
                return;
              }
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
            onCopy={copyExportToClipboard}
            onSave={saveExport}
            savedExportPath={savedExportPath}
          />
        )}
        </main>
      </div>
    </div>
  );
}
