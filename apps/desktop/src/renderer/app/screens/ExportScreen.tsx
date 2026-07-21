import { Copy, Save } from "lucide-react";
import { flattenFolders } from "@openapi-collection-studio/core";
import type { Collection, ExportWarning, OpenApiCheckResult } from "@openapi-collection-studio/core";
import type { ExportFormat } from "../types";

export function ExportScreen({
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
  onCopy,
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
  onCopy(): void;
  onSave(): void;
}) {
  const folders = activeCollection ? flattenFolders(activeCollection) : [];
  const isOpenApi = exportFormat === "openapi-yaml" || exportFormat === "openapi-json";
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
            <option value="postman-json">Postman Collection v2.1</option>
            <option value="http-file">HTTP file (.http)</option>
          </select>
        </label>
        {isOpenApi ? (
          <>
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
          </>
        ) : (
          <div className="status-box">This portable export always contains the entire active collection.</div>
        )}
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
            <button
              className="secondary-button"
              disabled={!exportContent}
              onClick={onCopy}
              type="button"
            >
              <Copy size={15} />
              Copy to clipboard
            </button>
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
