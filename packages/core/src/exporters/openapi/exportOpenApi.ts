import { stringify as stringifyYaml } from "yaml";
import type { Collection } from "../../model/types";
import { folderBaseUrl } from "../../model/traversal";
import { buildInitialComponents, pruneUnusedComponents, serverList } from "./export/components";
import { operationForRequest, pathFromRequest, tagsForRequest } from "./export/operation";
import { openApiVersion, selectRequests } from "./export/selection";
import { stripUndefined } from "./export/shared";
import type { AnyRecord, ExportWarning, OpenApiExportOptions, OpenApiExportResult } from "./export/types";
import { collectRequestSecretWarnings } from "./export/warnings";

export type { ExportWarning, ExportWarningKind, OpenApiExportFormat, OpenApiExportOptions, OpenApiExportResult } from "./export/types";

/** Backwards-compatible entry point returning only serialized content. */
export function exportCollectionToOpenApi(collection: Collection, options: OpenApiExportOptions): string {
  return exportCollectionToOpenApiResult(collection, options).content;
}

export function exportCollectionToOpenApiResult(
  collection: Collection,
  options: OpenApiExportOptions
): OpenApiExportResult {
  const warnings: ExportWarning[] = [];
  const document = exportCollectionToOpenApiDocument(collection, options, warnings);
  const content = options.format === "json"
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
    const pathItem = (paths[path] ?? {}) as AnyRecord;
    const operation = operationForRequest(item.request, tags, collection, components, options);
    const scopedBaseUrl = folderBaseUrl(item.folderPath);
    if (scopedBaseUrl && scopedBaseUrl !== collection.baseUrl) {
      if (scopedBaseUrl.includes("{{")) {
        warnings.push({
          kind: "invalid-server",
          message: `Folder server URL for "${item.request.name}" contains {{variables}} and was omitted from the OpenAPI operation.`
        });
      } else {
        operation.servers = [{ url: scopedBaseUrl }];
      }
    }
    pathItem[method] = operation;
    paths[path] = stripUndefined(pathItem);
  }

  const finalComponents = options.pruneUnusedComponents === false
    ? components
    : pruneUnusedComponents(paths, components);
  return stripUndefined({
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
  });
}
