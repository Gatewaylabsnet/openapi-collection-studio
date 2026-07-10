import { stringify as stringifyYaml } from "yaml";
import type {
  ApiRequest,
  AuthConfig,
  Collection,
  Folder,
  KeyValue,
  ResponseExample
} from "../../model/types";
import { findFolder, flattenRequests } from "../../model/traversal";

export type OpenApiExportFormat = "yaml" | "json";

export interface OpenApiExportOptions {
  format: OpenApiExportFormat;
  folderIds?: string[];
  useFolderNamesAsTags: boolean;
  includeRequestExamples: boolean;
  includeResponseExamples: boolean;
  includeBearerJwtSecurityScheme: boolean;
  includeAllComponents: boolean;
  /**
   * Drop component schemas that are not referenced by the exported paths.
   * Defaults to true so a folder-scoped export does not leak the full API's
   * data models to whoever receives the file.
   */
  pruneUnusedComponents?: boolean;
  /**
   * Emit parameter/header values as OpenAPI examples. Off by default because
   * those values often hold real secrets used while testing.
   */
  includeParameterExamples?: boolean;
}

export type ExportWarningKind = "secret" | "conflict" | "invalid-path" | "invalid-server";

export interface ExportWarning {
  kind: ExportWarningKind;
  message: string;
}

export interface OpenApiExportResult {
  content: string;
  document: AnyRecord;
  warnings: ExportWarning[];
}

interface RequestExportItem {
  request: ApiRequest;
  folderPath: Folder[];
}

type AnyRecord = Record<string, unknown>;

const VARIABLE_ONLY = /^\s*\{\{\s*[^}]+\s*\}\}\s*$/;

/**
 * Backwards-compatible entry point that returns only the serialized document.
 * Prefer {@link exportCollectionToOpenApiResult} to also receive warnings.
 */
export function exportCollectionToOpenApi(
  collection: Collection,
  options: OpenApiExportOptions
): string {
  return exportCollectionToOpenApiResult(collection, options).content;
}

export function exportCollectionToOpenApiResult(
  collection: Collection,
  options: OpenApiExportOptions
): OpenApiExportResult {
  const warnings: ExportWarning[] = [];
  const document = exportCollectionToOpenApiDocument(collection, options, warnings);
  const content =
    options.format === "json"
      ? JSON.stringify(document, null, 2)
      : stringifyYaml(document, { indent: 2 });
  return { content, document, warnings };
}

export function exportCollectionToOpenApiDocument(
  collection: Collection,
  options: OpenApiExportOptions,
  warnings: ExportWarning[] = []
): AnyRecord {
  const selectedRequests = selectRequests(collection, options.folderIds);
  const components = buildInitialComponents(collection, options);
  const paths: AnyRecord = {};
  const tagNames = new Set<string>();
  const seenOperations = new Set<string>();

  for (const item of selectedRequests) {
    const path = pathFromRequest(item.request);
    const method = item.request.method.toLowerCase();
    if (path.includes("{{")) {
      warnings.push({
        kind: "invalid-path",
        message: `Request "${item.request.name}" maps to path "${path}", which still contains a {{variable}}. OpenAPI paths use {param} templating, so this file may fail validation.`
      });
    }

    const operationKey = `${method} ${path}`;
    if (seenOperations.has(operationKey)) {
      warnings.push({
        kind: "conflict",
        message: `Multiple requests map to ${method.toUpperCase()} ${path}. Only the last one is exported; the others are dropped.`
      });
    }
    seenOperations.add(operationKey);

    collectRequestSecretWarnings(item.request, options, warnings);

    const tags = tagsForRequest(collection, item, options);
    tags.forEach((tag) => tagNames.add(tag));
    const authSecurity = securityForAuth(item.request.auth, components, options);

    const pathItem = (paths[path] ?? {}) as AnyRecord;
    pathItem[method] = {
      summary: item.request.name,
      description: item.request.description,
      operationId: item.request.openApi?.operationId,
      tags,
      parameters: parametersForRequest(item.request, options),
      requestBody: requestBodyForRequest(item.request, options),
      responses: responsesForRequest(item.request, options),
      security: authSecurity.length > 0 ? authSecurity : undefined
    };
    paths[path] = stripUndefined(pathItem);
  }

  const finalComponents =
    options.pruneUnusedComponents === false
      ? components
      : pruneUnusedComponents(paths, components);

  const document: AnyRecord = {
    openapi: openApiVersion(collection),
    info: {
      title: collection.name,
      version: collection.version ?? "0.1.0",
      description: collection.description
    },
    servers: serverList(collection, warnings),
    tags: [...tagNames].sort().map((name) => ({ name })),
    paths,
    components: Object.keys(finalComponents).length > 0 ? finalComponents : undefined
  };

  return stripUndefined(document);
}

function openApiVersion(collection: Collection): string {
  const source = collection.openApi?.documentVersion;
  // Preserve a 3.x source version (3.0.x / 3.1.x) so 3.1-only constructs stay
  // valid; anything else (e.g. Swagger "2.0") is normalized to 3.0.3.
  if (typeof source === "string" && /^3\.\d/.test(source)) {
    return source;
  }
  return "3.0.3";
}

function selectRequests(collection: Collection, folderIds?: string[]): RequestExportItem[] {
  if (!folderIds || folderIds.length === 0) {
    return flattenRequests(collection).map(({ request, folderPath }) => ({
      request,
      folderPath
    }));
  }

  const selected = new Map<string, RequestExportItem>();
  for (const folderId of folderIds) {
    const folder = findFolder(collection, folderId);
    if (!folder) {
      continue;
    }
    collectFolderRequests(folder, [folder], (request, folderPath) => {
      selected.set(request.id, { request, folderPath });
    });
  }
  return [...selected.values()];
}

function collectFolderRequests(
  folder: Folder,
  path: Folder[],
  visitor: (request: ApiRequest, folderPath: Folder[]) => void
): void {
  folder.requests.forEach((request) => visitor(request, path));
  for (const child of folder.folders) {
    collectFolderRequests(child, [...path, child], visitor);
  }
}

function buildInitialComponents(
  collection: Collection,
  options: OpenApiExportOptions
): AnyRecord {
  const components: AnyRecord = {};
  if (options.includeAllComponents) {
    const importedComponents = asRecord(collection.openApi?.components);
    for (const [key, value] of Object.entries(importedComponents)) {
      if (key === "definitions") {
        components.schemas = value;
      } else {
        components[key] = value;
      }
    }
  }
  return components;
}

function serverList(
  collection: Collection,
  warnings: ExportWarning[]
): Array<{ url: string }> | undefined {
  const servers = collection.openApi?.servers?.filter(Boolean) ?? [];
  const valid = servers.filter((url) => !url.includes("{{"));
  if (valid.length !== servers.length) {
    warnings.push({
      kind: "invalid-server",
      message:
        "Some server URLs contained {{variables}} and were omitted so the exported document stays valid OpenAPI."
    });
  }
  if (valid.length > 0) {
    return valid.map((url) => ({ url }));
  }
  // Returning undefined omits `servers` entirely, which is valid OpenAPI.
  // A `{{baseUrl}}` placeholder here would produce an invalid document.
  return undefined;
}

function pathFromRequest(request: ApiRequest): string {
  if (request.openApi?.path) {
    return request.openApi.path;
  }

  let url = request.url.trim().replace(/^\{\{\s*baseUrl\s*\}\}/, "");
  if (!url) {
    return "/";
  }

  if (/^https?:\/\//i.test(url)) {
    const parsed = new URL(url);
    url = parsed.pathname;
  } else {
    url = url.split("?")[0] ?? url;
  }

  return url.startsWith("/") ? url : `/${url}`;
}

function tagsForRequest(
  collection: Collection,
  item: RequestExportItem,
  options: OpenApiExportOptions
): string[] {
  if (options.useFolderNamesAsTags && item.folderPath.length > 0) {
    return [item.folderPath[item.folderPath.length - 1].name];
  }
  if (item.request.openApi?.tags && item.request.openApi.tags.length > 0) {
    return item.request.openApi.tags;
  }
  return [item.folderPath[item.folderPath.length - 1]?.name ?? collection.name];
}

function parametersForRequest(request: ApiRequest, options: OpenApiExportOptions): AnyRecord[] {
  const params: AnyRecord[] = [];
  for (const item of request.pathParams.filter(isEnabledKeyValue)) {
    params.push(parameterObject(item, "path", true, options));
  }
  for (const item of request.queryParams.filter(isEnabledKeyValue)) {
    params.push(parameterObject(item, "query", false, options));
  }
  for (const item of request.headers.filter(isEnabledKeyValue)) {
    if (item.key.toLowerCase() === "content-type" || item.key.toLowerCase() === "authorization") {
      continue;
    }
    params.push(parameterObject(item, "header", false, options));
  }
  return params;
}

function parameterObject(
  item: KeyValue,
  location: string,
  required: boolean,
  options: OpenApiExportOptions
): AnyRecord {
  const emitExample =
    options.includeParameterExamples === true &&
    Boolean(item.value) &&
    !VARIABLE_ONLY.test(item.value);
  return {
    name: item.key,
    in: location,
    required,
    description: item.description,
    schema: { type: inferPrimitiveType(item.value) },
    example: emitExample ? item.value : undefined
  };
}

function requestBodyForRequest(
  request: ApiRequest,
  options: OpenApiExportOptions
): AnyRecord | undefined {
  if (request.body.mode === "none") {
    return undefined;
  }

  const contentType = request.body.contentType ?? "application/json";
  const media: AnyRecord = {
    schema: request.body.schema ?? { type: "object" }
  };
  if (options.includeRequestExamples && request.body.raw) {
    media.example = parseJsonOrString(request.body.raw);
  }

  return {
    required: true,
    content: {
      [contentType]: media
    }
  };
}

function responsesForRequest(
  request: ApiRequest,
  options: OpenApiExportOptions
): AnyRecord {
  if (!options.includeResponseExamples || request.responseExamples.length === 0) {
    return {
      "200": {
        description: "Successful response"
      }
    };
  }

  const responses: AnyRecord = {};
  for (const example of request.responseExamples) {
    const contentType = example.contentType ?? "application/json";
    responses[String(example.status)] = {
      description: example.name,
      headers: headersForResponse(example),
      content: {
        [contentType]: {
          example: parseJsonOrString(example.body ?? "")
        }
      }
    };
  }
  return responses;
}

function headersForResponse(example: ResponseExample): AnyRecord | undefined {
  const headers: AnyRecord = {};
  for (const header of example.headers.filter(isEnabledKeyValue)) {
    if (header.key.toLowerCase() === "content-type") {
      continue;
    }
    headers[header.key] = {
      schema: { type: inferPrimitiveType(header.value) },
      example: header.value
    };
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function securityForAuth(
  auth: AuthConfig,
  components: AnyRecord,
  options: OpenApiExportOptions
): AnyRecord[] {
  if (auth.type === "none") {
    return [];
  }

  const securitySchemes = ensureSecuritySchemes(components);
  if (auth.type === "bearer" && options.includeBearerJwtSecurityScheme) {
    securitySchemes.BearerAuth = {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT"
    };
    return [{ BearerAuth: [] }];
  }

  if (auth.type === "basic") {
    securitySchemes.BasicAuth = {
      type: "http",
      scheme: "basic"
    };
    return [{ BasicAuth: [] }];
  }

  if (auth.type === "apiKey") {
    const name = auth.key || "ApiKey";
    securitySchemes.ApiKeyAuth = {
      type: "apiKey",
      in: auth.in,
      name
    };
    return [{ ApiKeyAuth: [] }];
  }

  return [];
}

function ensureSecuritySchemes(components: AnyRecord): AnyRecord {
  const existing = asRecord(components.securitySchemes);
  components.securitySchemes = existing;
  return existing;
}

/**
 * Keep only the component schemas that the exported paths (transitively)
 * reference. Prevents a folder-scoped export from shipping the entire API's
 * data models. Other component sections and securitySchemes are left intact.
 */
function pruneUnusedComponents(paths: AnyRecord, components: AnyRecord): AnyRecord {
  const schemas = asRecord(components.schemas);
  if (Object.keys(schemas).length === 0) {
    return components;
  }

  const reachable = new Set<string>();
  const queue = collectSchemaRefNames(paths);
  while (queue.length > 0) {
    const name = queue.pop() as string;
    if (reachable.has(name) || !(name in schemas)) {
      continue;
    }
    reachable.add(name);
    for (const next of collectSchemaRefNames(schemas[name])) {
      if (!reachable.has(next)) {
        queue.push(next);
      }
    }
  }

  const prunedSchemas: AnyRecord = {};
  for (const name of reachable) {
    prunedSchemas[name] = schemas[name];
  }

  const next = { ...components };
  if (Object.keys(prunedSchemas).length > 0) {
    next.schemas = prunedSchemas;
  } else {
    delete next.schemas;
  }
  return next;
}

function collectSchemaRefNames(value: unknown): string[] {
  const names = new Set<string>();
  const pattern = /#\/(?:components\/schemas|definitions)\/([^"/]+)/g;
  const serialized = JSON.stringify(value) ?? "";
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(serialized)) !== null) {
    names.add(decodeRefToken(match[1]));
  }
  return [...names];
}

function decodeRefToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function collectRequestSecretWarnings(
  request: ApiRequest,
  options: OpenApiExportOptions,
  warnings: ExportWarning[]
): void {
  const flag = (where: string, key: string) => {
    warnings.push({
      kind: "secret",
      message: `Request "${request.name}" has a literal value in ${where} "${key}" that looks like a secret. Use a {{variable}} so it is not written into the exported file.`
    });
  };

  if (options.includeParameterExamples) {
    for (const item of [...request.headers, ...request.queryParams, ...request.pathParams]) {
      if (item.enabled && looksSecret(item.key, item.value)) {
        flag("parameter", item.key);
      }
    }
  }

  if (options.includeRequestExamples && request.body.raw && bodyLooksSecret(request.body.raw)) {
    warnings.push({
      kind: "secret",
      message: `Request "${request.name}" has a request body example that looks like it contains a secret (token/password/key). Consider disabling example values or replacing secrets with {{variables}}.`
    });
  }
}

function looksSecret(key: string, value: string): boolean {
  if (!value || VARIABLE_ONLY.test(value)) {
    return false;
  }
  const keyName = key.toLowerCase();
  const nameSuggestsSecret = /authorization|token|secret|password|passwd|api[-_]?key|cookie|bearer/.test(
    keyName
  );
  return nameSuggestsSecret || valueLooksSecret(value);
}

function bodyLooksSecret(raw: string): boolean {
  if (/"\s*(password|passwd|secret|client_secret|token|access_token|api[-_]?key)\s*"\s*:\s*"[^"]+"/i.test(raw)) {
    // A concrete string value assigned to a secret-ish key (not a {{variable}}).
    return !/"\s*(password|passwd|secret|client_secret|token|access_token|api[-_]?key)\s*"\s*:\s*"\s*\{\{/i.test(
      raw
    );
  }
  return valueLooksSecret(raw);
}

function valueLooksSecret(value: string): boolean {
  const trimmed = value.trim();
  // JWT shape: header.payload.signature
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) {
    return true;
  }
  // Long high-entropy-ish opaque token.
  if (/^[A-Za-z0-9_\-+/=]{24,}$/.test(trimmed) && !trimmed.includes(" ")) {
    return true;
  }
  return false;
}

function isEnabledKeyValue(item: KeyValue): boolean {
  return item.enabled && Boolean(item.key.trim());
}

function inferPrimitiveType(value: string): "boolean" | "number" | "string" {
  if (value === "true" || value === "false") {
    return "boolean";
  }
  if (value.trim() !== "" && Number.isFinite(Number(value))) {
    return "number";
  }
  return "string";
}

function parseJsonOrString(value: string): unknown {
  if (!value.trim()) {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)).filter((item) => item !== undefined) as T;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const result: AnyRecord = {};
  for (const [key, child] of Object.entries(value as AnyRecord)) {
    if (child !== undefined) {
      result[key] = stripUndefined(child);
    }
  }
  return result as T;
}

function asRecord(value: unknown): AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}
