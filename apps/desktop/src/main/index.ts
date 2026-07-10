import { app, BrowserWindow, dialog, ipcMain, safeStorage, session } from "electron";
import { copyFile, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  createEmptyWorkspace,
  MissingVariablesError,
  prepareHttpRequest,
  type ApiRequest,
  type Environment,
  type Workspace
} from "@openapi-collection-studio/core";

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

interface SendRequestPayload {
  request: ApiRequest;
  environment?: Environment;
}

interface SendRequestResult {
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

interface WorkspaceLoadResult {
  workspace: Workspace;
  recovered: boolean;
  message?: string;
}

const ENCRYPTED_PREFIX = "enc:v1:";
const MAX_BACKUPS = 5;

const workspacePath = () => join(app.getPath("userData"), "workspace.json");
const backupsDir = () => join(app.getPath("userData"), "backups");
const settingsPath = () => join(app.getPath("userData"), "app-settings.json");

/**
 * Write a file without ever leaving a half-written target behind: write to a
 * temp file in the same directory, then atomically rename over the target.
 */
async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, path);
}

async function rotateBackup(): Promise<void> {
  const source = workspacePath();
  try {
    await readFile(source, "utf8");
  } catch {
    return; // Nothing valid to back up yet.
  }
  const dir = backupsDir();
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await copyFile(source, join(dir, `workspace-${stamp}.json`));

  const entries = (await readdir(dir))
    .filter((name) => name.startsWith("workspace-") && name.endsWith(".json"))
    .sort();
  const excess = entries.length - MAX_BACKUPS;
  for (let index = 0; index < excess; index += 1) {
    await unlink(join(dir, entries[index])).catch(() => undefined);
  }
}

async function quarantineCorruptFile(): Promise<string | undefined> {
  const source = workspacePath();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = join(app.getPath("userData"), `workspace.corrupt-${stamp}.json`);
  try {
    await rename(source, target);
    return target;
  } catch {
    return undefined;
  }
}

function encryptSecrets(workspace: Workspace): Workspace {
  if (!safeStorage.isEncryptionAvailable()) {
    return workspace;
  }
  return {
    ...workspace,
    environments: workspace.environments.map((environment) => ({
      ...environment,
      variables: environment.variables.map((variable) => {
        if (!variable.secret || !variable.value || variable.value.startsWith(ENCRYPTED_PREFIX)) {
          return variable;
        }
        const encrypted = safeStorage.encryptString(variable.value).toString("base64");
        return { ...variable, value: `${ENCRYPTED_PREFIX}${encrypted}` };
      })
    }))
  };
}

function decryptSecrets(workspace: Workspace): Workspace {
  return {
    ...workspace,
    environments: (workspace.environments ?? []).map((environment) => ({
      ...environment,
      variables: (environment.variables ?? []).map((variable) => {
        if (!variable.value?.startsWith(ENCRYPTED_PREFIX)) {
          return variable;
        }
        if (!safeStorage.isEncryptionAvailable()) {
          return { ...variable, value: "" };
        }
        try {
          const decrypted = safeStorage.decryptString(
            Buffer.from(variable.value.slice(ENCRYPTED_PREFIX.length), "base64")
          );
          return { ...variable, value: decrypted };
        } catch {
          return { ...variable, value: "" };
        }
      })
    }))
  };
}

async function loadWorkspace(): Promise<WorkspaceLoadResult> {
  let raw: string;
  try {
    raw = await readFile(workspacePath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { workspace: createEmptyWorkspace(), recovered: false };
    }
    // The file exists but could not be read (locked, permissions). Do NOT
    // overwrite it with an empty workspace — surface the problem instead.
    return {
      workspace: createEmptyWorkspace(),
      recovered: true,
      message: `Could not read the saved workspace (${(error as Error).message}). A new empty workspace was opened; your file was left untouched.`
    };
  }

  try {
    const parsed = JSON.parse(raw) as Workspace;
    if (parsed.schemaVersion !== 1) {
      const target = await quarantineCorruptFile();
      return {
        workspace: createEmptyWorkspace(),
        recovered: true,
        message: `The saved workspace uses an unsupported schema version. It was moved to ${target ?? "a backup file"} so it will not be overwritten.`
      };
    }
    return { workspace: decryptSecrets(parsed), recovered: false };
  } catch {
    const target = await quarantineCorruptFile();
    return {
      workspace: createEmptyWorkspace(),
      recovered: true,
      message: `The saved workspace file was corrupt and could not be parsed. It was moved to ${target ?? "a backup file"}. Recent backups are in the "backups" folder.`
    };
  }
}

async function saveWorkspace(workspace: Workspace): Promise<void> {
  await rotateBackup();
  const persisted = encryptSecrets({ ...workspace, updatedAt: new Date().toISOString() });
  await atomicWrite(workspacePath(), JSON.stringify(persisted, null, 2));
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  await atomicWrite(settingsPath(), JSON.stringify(merged, null, 2));
  return merged;
}

async function sendHttpRequest(payload: SendRequestPayload): Promise<SendRequestResult> {
  const settings = await loadSettings();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.requestTimeoutMs);
  const previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (settings.allowInsecureTls) {
    // Opt-in escape hatch for internal CAs / self-signed gateways.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  try {
    const prepared = prepareHttpRequest(payload.request, payload.environment);
    const startedAt = performance.now();
    const response = await fetch(prepared.url, {
      method: prepared.method,
      headers: prepared.headers,
      body: prepared.body,
      signal: controller.signal
    });

    const { bytes, truncated } = await readCappedBody(response, settings.maxResponseBytes);
    const rawBody = new TextDecoder().decode(bytes);
    const body = formatBody(rawBody, response.headers.get("content-type"));
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      durationMs: Math.round(performance.now() - startedAt),
      sizeBytes: bytes.byteLength,
      headers,
      body,
      rawBody,
      truncated
    };
  } catch (error) {
    if (error instanceof MissingVariablesError) {
      return emptyError("Missing variables", error.message);
    }
    if (error instanceof Error && error.name === "AbortError") {
      return emptyError(
        "Request timed out",
        `The request exceeded the ${settings.requestTimeoutMs} ms timeout and was aborted.`
      );
    }
    return emptyError("Request failed", error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
    if (settings.allowInsecureTls) {
      if (previousTlsSetting === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsSetting;
      }
    }
  }
}

async function readCappedBody(
  response: Response,
  maxBytes: number
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    return { bytes: buffer.slice(0, maxBytes), truncated: buffer.byteLength > maxBytes };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        chunks.push(value.slice(0, value.byteLength - (total - maxBytes)));
        truncated = true;
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
}

function emptyError(statusText: string, message: string): SendRequestResult {
  return {
    status: 0,
    statusText,
    durationMs: 0,
    sizeBytes: 0,
    headers: {},
    body: "",
    rawBody: "",
    error: message
  };
}

function formatBody(body: string, contentType: string | null): string {
  if (contentType?.includes("application/json")) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: "OpenAPI Collection Studio",
    backgroundColor: "#f6f7f9",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // NOTE: sandbox stays false because the preload is shipped as an ESM
      // module (index.mjs); Electron only loads sandboxed preloads as CommonJS.
      // contextIsolation + nodeIntegration:false keep the renderer boundary.
      sandbox: false
    }
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function applyContentSecurityPolicy(): void {
  // Only enforce CSP for packaged loads (file://). The dev server needs the
  // Vite websocket/eval for HMR, so we leave dev untouched.
  if (process.env.ELECTRON_RENDERER_URL) {
    return;
  }
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'"
        ]
      }
    });
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [existing] = BrowserWindow.getAllWindows();
    if (existing) {
      if (existing.isMinimized()) {
        existing.restore();
      }
      existing.focus();
    }
  });

  app.whenReady().then(() => {
    applyContentSecurityPolicy();

    ipcMain.handle("workspace:load", () => loadWorkspace());
    ipcMain.handle("workspace:save", (_event, workspace: Workspace) => saveWorkspace(workspace));
    ipcMain.handle("settings:load", () => loadSettings());
    ipcMain.handle("settings:save", (_event, settings: AppSettings) => saveSettings(settings));
    ipcMain.handle("http:send", (_event, payload: SendRequestPayload) => sendHttpRequest(payload));
    ipcMain.handle(
      "file:saveExport",
      async (_event, payload: { defaultPath: string; content: string }) => {
        const result = await dialog.showSaveDialog({
          title: "Save export",
          defaultPath: payload.defaultPath,
          filters: [
            { name: "OpenAPI YAML", extensions: ["yaml", "yml"] },
            { name: "OpenAPI JSON", extensions: ["json"] },
            { name: "All files", extensions: ["*"] }
          ]
        });

        if (result.canceled || !result.filePath) {
          return { canceled: true };
        }

        await atomicWrite(result.filePath, payload.content);
        return { canceled: false, filePath: result.filePath };
      }
    );

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
