import React from "react";
import ReactDOM from "react-dom/client";
import { createCollection, createEmptyWorkspace, createKeyValue, createRequest } from "@openapi-collection-studio/core";
import { App } from "./App";
import { applyFontSizePreference, applyThemePreference } from "./app/theme";
import "./styles/global.css";

// Dev-only fallback: when the renderer is opened in a plain browser (no
// Electron preload), install an in-memory mock of window.studio so the UI can
// be developed and reviewed without launching Electron. In the packaged app
// the preload always defines window.studio first, so this never runs there.
const browserPreview = import.meta.env.DEV || new URLSearchParams(window.location.search).has("browser-preview");
if (browserPreview && typeof window.studio === "undefined") {
  let workspace = createEmptyWorkspace("Browser Preview");
  workspace.environments[0].variables.push({
    id: "envvar-preview-base-url",
    name: "baseUrl",
    value: "https://api.example.test",
    enabled: true,
    secret: false
  });
  const previewCollection = createCollection("Store API");
  previewCollection.baseUrl = "https://api.example.test";
  const previewRequest = createRequest({ name: "List products", method: "GET", url: "{{baseUrl}}/products" });
  previewRequest.queryParams.push(createKeyValue("limit", "20"));
  previewRequest.headers.push(createKeyValue("Accept", "application/json"));
  previewCollection.requests.push(previewRequest);
  workspace.collections.push(previewCollection);
  window.studio = {
    loadWorkspace: async () => ({ workspace, recovered: false, secureStorageAvailable: true }),
    saveWorkspace: async (next) => {
      workspace = next;
    },
    loadSettings: async () => ({
      requestTimeoutMs: 30_000,
      maxResponseBytes: 10 * 1024 * 1024,
      allowInsecureTls: false,
      theme: "system",
      fontSize: "compact"
    }),
    saveSettings: async (settings) => settings,
    sendRequest: async (request) => {
      // Canned success so the editor/response/history flow is reviewable in a
      // browser without a real network stack. Never used in the packaged app.
      const payload = {
        ok: true,
        method: request.method,
        access_token: `demo-token-${Math.floor(Math.random() * 1e6)}`,
        receivedAt: new Date().toISOString()
      };
      const rawBody = JSON.stringify(payload);
      return {
        status: 200,
        statusText: "OK",
        durationMs: 12 + Math.floor(Math.random() * 40),
        sizeBytes: rawBody.length,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload, null, 2),
        rawBody
      };
    },
    saveExportFile: async () => ({ canceled: true }),
    openImportFile: async () => ({ canceled: true }),
    openUploadFile: async () => ({
      canceled: false,
      error: "Choosing upload files requires the desktop app."
    }),
    releaseUploadFile: async () => undefined,
    openPostmanFolder: async () => ({ canceled: true }),
    exportBackup: async () => ({ canceled: true }),
    restoreBackup: async () => ({
      canceled: true,
      restored: false,
      secureStorageAvailable: true
    }),
    deleteAllData: async () => {
      workspace = createEmptyWorkspace("Browser Preview");
    },
    fetchImportUrl: async () => ({
      ok: false,
      error: "Fetching URLs requires the desktop app (browser preview mode)."
    })
  };
}

async function bootstrap(): Promise<void> {
  const settings = await window.studio.loadSettings();
  applyThemePreference(settings.theme);
  applyFontSizePreference(settings.fontSize);
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
