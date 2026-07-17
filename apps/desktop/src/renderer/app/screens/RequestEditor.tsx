import { useEffect, useState } from "react";
import { FilePlus2, Play, Plus, Send, Terminal, Wand2 } from "lucide-react";
import { flattenFolders, folderBaseUrl, type ApiRequest, type AuthConfig, type Collection, type Folder, type HttpMethod, type KeyValue } from "@openapi-collection-studio/core";
import { KeyValueEditor } from "../../components/KeyValueEditor";
import { methods } from "../types";
import { activeRequestFolderId, authForType, tabLabel } from "../helpers";
import type { RequestTab, ResponseHistoryEntry, ResponseState } from "../types";
import { ResponsePanel } from "./ResponsePanel";

export function RequestWorkspace({
  activeCollection,
  activeFolder,
  activeRequest,
  requestTab,
  response,
  folderOptions,
  isSending,
  onAddRequest,
  onAddJwtRequest,
  onUpdateRequest,
  onUpdateCollection,
  onUpdateFolder,
  onMoveRequest,
  onRequestTabChange,
  onSend,
  onCopyCurl,
  onAssignResponseValue,
  environmentVariableNames,
  responseHistory
}: {
  activeCollection?: Collection;
  activeFolder?: Folder;
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
  onUpdateFolder(recipe: (folder: Folder) => void): void;
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
        {activeCollection && (
          <div className="base-url-fields">
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
                placeholder="https://api.example.com/service"
                value={activeCollection.baseUrl ?? ""}
              />
            </label>
            {activeFolder && (
              <label className="field collection-base-url">
                <span>Folder base URL</span>
                <input
                  aria-label="Folder base URL"
                  onChange={(event) =>
                    onUpdateFolder((folder) => {
                      const value = event.target.value.trim();
                      folder.baseUrl = value || undefined;
                    })
                  }
                  placeholder={inheritedBaseUrl(activeCollection, activeFolder, folderOptions)}
                  value={activeFolder.baseUrl ?? ""}
                />
                <small>Overrides the collection for this folder and its children. Leave empty to inherit.</small>
              </label>
            )}
          </div>
        )}
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
              <RequestNameInput
                key={activeRequest.id}
                name={activeRequest.name}
                onCommit={(name) =>
                  onUpdateRequest((request) => {
                    request.name = name;
                  })
                }
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

function inheritedBaseUrl(
  collection: Collection,
  folder: Folder,
  folderOptions: ReturnType<typeof flattenFolders>
): string {
  const path = folderOptions.find((item) => item.folder.id === folder.id)?.path ?? [];
  const inherited = folderBaseUrl(path.slice(0, -1)) ?? collection.baseUrl;
  return inherited ? `Inherited: ${inherited}` : "https://api.example.com/proxy";
}

function RequestNameInput({ name, onCommit }: { name: string; onCommit(name: string): void }) {
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  const commit = () => {
    if (draft !== name) {
      onCommit(draft);
    }
  };

  return (
    <input
      aria-label="Request name"
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      value={draft}
    />
  );
}

export function RequestTabPanel({
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

export function AuthFields({
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
