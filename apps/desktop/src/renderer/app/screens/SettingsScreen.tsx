import type { AppSettings } from "../types";
import { Download, Plus, Upload } from "lucide-react";

export function SettingsScreen({
  settings,
  onChange,
  workspaceName,
  onWorkspaceNameChange,
  onNewWorkspace,
  onExportBackup,
  onRestoreBackup,
  onDeleteAllData,
  savedBackupPath
}: {
  settings: AppSettings;
  onChange(patch: Partial<AppSettings>): void;
  workspaceName: string;
  onWorkspaceNameChange(name: string): void;
  onNewWorkspace(): void;
  onExportBackup(): void;
  onRestoreBackup(): void;
  onDeleteAllData(): void;
  savedBackupPath: string;
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
        <h3>Appearance</h3>
        <label className="field">
          <span>Color theme</span>
          <select
            aria-label="Color theme"
            onChange={(event) => onChange({ theme: event.target.value as AppSettings["theme"] })}
            value={settings.theme}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="field">
          <span>Text size</span>
          <select
            aria-label="Text size"
            onChange={(event) => onChange({ fontSize: event.target.value as AppSettings["fontSize"] })}
            value={settings.fontSize}
          >
            <option value="compact">Compact</option>
            <option value="default">Default</option>
            <option value="large">Large</option>
          </select>
        </label>
        <p>Appearance choices are saved in this local workspace profile. Compact is the default for a denser editor.</p>
        <h3>Data management</h3>
        <p>Backups include collections, environments, settings, and secret values. Store exported files securely.</p>
        <div className="settings-actions">
          <button className="secondary-button" onClick={onExportBackup} type="button">
            <Download size={16} />
            Export backup
          </button>
          <button className="secondary-button" onClick={onRestoreBackup} type="button">
            <Upload size={16} />
            Restore backup
          </button>
          <button className="danger-button" onClick={onDeleteAllData} type="button">
            Delete all data
          </button>
        </div>
        {savedBackupPath && <div className="status-box">Saved to {savedBackupPath}</div>}
        <div className="status-box status-box--warning">
          Restoring replaces the current workspace after creating a local safety copy. Deleting data is permanent.
        </div>
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
