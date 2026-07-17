import { session } from "electron";
import { MissingVariablesError, prepareHttpRequest } from "@openapi-collection-studio/core";
import { fetchWithProxy, ProxyAgentCache } from "./proxy";
import { MAX_IMPORT_BYTES } from "./constants";
import { loadSettings } from "./storage";
import type { SendRequestPayload, SendRequestResult } from "../shared/contracts";

const proxyAgents = new ProxyAgentCache();

export async function sendHttpRequest(payload: SendRequestPayload): Promise<SendRequestResult> {
  const settings = await loadSettings();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.requestTimeoutMs);
  const previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (settings.allowInsecureTls) {
    // Opt-in escape hatch for internal CAs / self-signed gateways.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  try {
    const prepared = prepareHttpRequest(
      payload.request,
      payload.environment,
      payload.collection,
      payload.folderPath
    );
    const startedAt = performance.now();
    const response = await fetchWithProxy(
      prepared.url,
      {
        method: prepared.method,
        headers: prepared.headers,
        body: prepared.body,
        signal: controller.signal
      },
      (url) => session.defaultSession.resolveProxy(url),
      proxyAgents
    );

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

export async function readCappedBody(
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

export async function fetchImportUrl(
  url: string
): Promise<{ ok: boolean; content?: string; error?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http(s) URLs are supported." };
  }

  const settings = await loadSettings();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.requestTimeoutMs);
  try {
    const response = await fetchWithProxy(
      url,
      {
        signal: controller.signal,
        headers: { Accept: "application/json, application/yaml, text/yaml, text/plain, */*" }
      },
      (targetUrl) => session.defaultSession.resolveProxy(targetUrl),
      proxyAgents
    );
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} ${response.statusText}` };
    }
    const { bytes, truncated } = await readCappedBody(response, MAX_IMPORT_BYTES);
    if (truncated) {
      return {
        ok: false,
        error: `Document is larger than ${Math.round(MAX_IMPORT_BYTES / (1024 * 1024))} MB and cannot be imported.`
      };
    }
    return { ok: true, content: new TextDecoder().decode(bytes) };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "The request timed out." };
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

export function emptyError(statusText: string, message: string): SendRequestResult {
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

export function formatBody(body: string, contentType: string | null): string {
  if (contentType?.includes("application/json")) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}


export async function closeHttpAgents(): Promise<void> {
  await proxyAgents.closeAll();
}
