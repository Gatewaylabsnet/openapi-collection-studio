import { importOpenApiDocument } from "./openapi/importOpenApi";
import { importSwagger2Document } from "./swagger2/importSwagger2";
import {
  asRecord,
  asString,
  asStringArray,
  countOperations,
  getRecord,
  HTTP_METHODS,
  parseApiText
} from "./shared";
import type {
  ImportOperationSummary,
  ImportOptions,
  ImportPreview,
  ImportResult
} from "./types";

export * from "./types";
export * from "./shared";
export * from "./openapi/importOpenApi";
export * from "./swagger2/importSwagger2";
export * from "./reimport";

export function previewApiDocument(text: string): ImportPreview {
  const parsed = parseApiText(text);
  const counts = countOperations(parsed.document);
  return {
    title: parsed.title ?? "Imported API",
    version:
      typeof parsed.document.info === "object" && parsed.document.info !== null
        ? String((parsed.document.info as Record<string, unknown>).version ?? "")
        : undefined,
    kind: parsed.kind,
    format: parsed.format,
    ...counts
  };
}

export function importApiDocument(text: string, options: ImportOptions): ImportResult {
  const parsed = parseApiText(text);
  if (parsed.kind === "openapi3") {
    return importOpenApiDocument(parsed.document, parsed, options);
  }
  return importSwagger2Document(parsed.document, parsed, options);
}

/** Selection key shared by listOperations and the importers' filters. */
export function operationKey(method: string, path: string): string {
  return `${method.toLowerCase()} ${path}`;
}

/**
 * List every operation in an OpenAPI/Swagger text so the UI can offer
 * per-operation selection before importing.
 */
export function listOperations(text: string): ImportOperationSummary[] {
  const parsed = parseApiText(text);
  const paths = getRecord(parsed.document, "paths");
  const operations: ImportOperationSummary[] = [];

  for (const [path, pathItemInput] of Object.entries(paths)) {
    const pathItem = asRecord(pathItemInput);
    for (const method of HTTP_METHODS) {
      const operation = asRecord(pathItem[method]);
      if (Object.keys(operation).length === 0) {
        continue;
      }
      operations.push({
        key: operationKey(method, path),
        method: method.toUpperCase(),
        path,
        summary: asString(operation.summary) ?? asString(operation.operationId),
        tags: asStringArray(operation.tags)
      });
    }
  }
  return operations;
}
