import type { ApiRequest, Environment, Workspace } from "@openapi-collection-studio/core";

export interface AppSettings {
  requestTimeoutMs: number;
  maxResponseBytes: number;
  allowInsecureTls: boolean;
}

export interface WorkspaceLoadResult {
  workspace: Workspace;
  recovered: boolean;
  message?: string;
}

export interface SendRequestResult {
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

export interface StudioApi {
  loadWorkspace(): Promise<WorkspaceLoadResult>;
  saveWorkspace(workspace: Workspace): Promise<void>;
  loadSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  sendRequest(request: ApiRequest, environment?: Environment): Promise<SendRequestResult>;
  saveExportFile(defaultPath: string, content: string): Promise<{
    canceled: boolean;
    filePath?: string;
  }>;
}

declare global {
  interface Window {
    studio: StudioApi;
  }
}
