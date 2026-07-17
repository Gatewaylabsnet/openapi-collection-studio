import type { ApiRequest, Collection, Environment, Folder, KeyValue } from "../model/types";
import {
  environmentToMap,
  resolveRequestVariables,
  resolveVariablesInText
} from "../variables/resolveVariables";

export interface PreparedHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export class MissingVariablesError extends Error {
  readonly variables: string[];

  constructor(variables: string[]) {
    super(`Missing environment variables: ${variables.join(", ")}`);
    this.name = "MissingVariablesError";
    this.variables = variables;
  }
}

export function prepareHttpRequest(
  request: ApiRequest,
  environment?: Environment,
  collection?: Pick<Collection, "baseUrl">,
  folderPath: readonly Pick<Folder, "baseUrl">[] = []
): PreparedHttpRequest {
  const resolved = resolveRequestVariables(request, environment, collection, folderPath);
  if (resolved.missing.length > 0) {
    throw new MissingVariablesError(resolved.missing);
  }

  const requestWithPathParams = replacePathParams(resolved.request);
  const url = appendQueryParams(
    resolveRelativeUrl(requestWithPathParams.url, environment, collection, folderPath),
    requestWithPathParams.queryParams
  );
  const headers = keyValuesToHeaders(requestWithPathParams.headers);

  if (requestWithPathParams.auth.type === "bearer" && requestWithPathParams.auth.token) {
    headers.Authorization = `Bearer ${requestWithPathParams.auth.token}`;
  }
  if (requestWithPathParams.auth.type === "basic") {
    const token = encodeBase64(
      `${requestWithPathParams.auth.username}:${requestWithPathParams.auth.password}`
    );
    headers.Authorization = `Basic ${token}`;
  }
  if (requestWithPathParams.auth.type === "apiKey" && requestWithPathParams.auth.in === "header") {
    headers[requestWithPathParams.auth.key] = requestWithPathParams.auth.value;
  }

  let body = requestWithPathParams.body.raw;
  if (requestWithPathParams.body.mode === "form") {
    const pairs = (requestWithPathParams.body.form ?? []).filter((item) => item.enabled && item.key);
    body = pairs
      .map((item) => `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value)}`)
      .join("&");
    headers["Content-Type"] =
      headers["Content-Type"] ??
      requestWithPathParams.body.contentType ??
      "application/x-www-form-urlencoded";
  }
  if (requestWithPathParams.body.mode === "none" || requestWithPathParams.method === "GET") {
    body = undefined;
  }
  if (requestWithPathParams.body.mode === "json" && requestWithPathParams.body.contentType) {
    headers["Content-Type"] = headers["Content-Type"] ?? requestWithPathParams.body.contentType;
  }

  return {
    url: appendApiKeyQuery(url, requestWithPathParams),
    method: requestWithPathParams.method,
    headers,
    body
  };
}

function resolveRelativeUrl(
  requestUrl: string,
  environment?: Environment,
  collection?: Pick<Collection, "baseUrl">,
  folderPath: readonly Pick<Folder, "baseUrl">[] = []
): string {
  if (/^https?:\/\//i.test(requestUrl) || !requestUrl.trim()) {
    return requestUrl;
  }
  const variables = environmentToMap(environment, collection, folderPath);
  const baseUrlInput = variables.baseUrl?.trim();
  if (!baseUrlInput) {
    return requestUrl;
  }
  const baseUrl = resolveVariablesInText(baseUrlInput, variables);
  if (baseUrl.missing.length > 0) {
    throw new MissingVariablesError(baseUrl.missing);
  }
  if (!/^https?:\/\//i.test(baseUrl.value)) {
    return requestUrl;
  }
  const normalizedBase = `${baseUrl.value.replace(/\/+$/, "")}/`;
  const normalizedRequest = requestUrl.replace(/^\/+/, "");
  return new URL(normalizedRequest, normalizedBase).toString();
}

function replacePathParams(request: ApiRequest): ApiRequest {
  let url = request.url;
  for (const param of request.pathParams.filter((item) => item.enabled)) {
    if (!param.key) {
      continue;
    }
    url = url
      .replaceAll(`{${param.key}}`, encodeURIComponent(param.value))
      .replaceAll(`:${param.key}`, encodeURIComponent(param.value));
  }
  return { ...request, url };
}

function appendQueryParams(urlInput: string, queryParams: KeyValue[]): string {
  const enabled = queryParams.filter((item) => item.enabled && item.key);
  if (enabled.length === 0) {
    return urlInput;
  }

  const url = createUrl(urlInput);
  for (const param of enabled) {
    url.searchParams.set(param.key, param.value);
  }
  return normalizeUrl(urlInput, url);
}

function appendApiKeyQuery(urlInput: string, request: ApiRequest): string {
  if (request.auth.type !== "apiKey" || request.auth.in !== "query") {
    return urlInput;
  }
  const url = createUrl(urlInput);
  url.searchParams.set(request.auth.key, request.auth.value);
  return normalizeUrl(urlInput, url);
}

function createUrl(urlInput: string): URL {
  if (/^https?:\/\//i.test(urlInput)) {
    return new URL(urlInput);
  }
  return new URL(urlInput.startsWith("/") ? `http://localhost${urlInput}` : `http://localhost/${urlInput}`);
}

function normalizeUrl(original: string, url: URL): string {
  if (/^https?:\/\//i.test(original)) {
    return url.toString();
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function keyValuesToHeaders(values: KeyValue[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const item of values) {
    if (item.enabled && item.key) {
      headers[item.key] = item.value;
    }
  }
  return headers;
}

function encodeBase64(value: string): string {
  // Basic auth credentials may contain non-Latin1 characters (e.g. Turkish
  // ş/ğ/ı). Encode as UTF-8 first per RFC 7617 so btoa does not throw.
  const maybeBuffer = (globalThis as unknown as {
    Buffer?: { from(input: string, encoding: string): { toString(encoding: string): string } };
  }).Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(value, "utf8").toString("base64");
  }
  if (typeof btoa === "function" && typeof TextEncoder === "function") {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  throw new Error("Base64 encoding is not available in this runtime.");
}
