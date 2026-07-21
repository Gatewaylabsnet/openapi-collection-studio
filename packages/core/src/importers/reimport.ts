import { createFolder } from "../model/factory";
import { flattenRequests } from "../model/traversal";
import type { ApiRequest, Collection, Folder } from "../model/types";

export interface ReimportDiff {
  matched: number;
  added: number;
  retained: number;
}

/**
 * Compare imports using an OpenAPI operation identity when present, falling
 * back to method + URL for portable collections. This deliberately never
 * removes a user request.
 */
export function previewSafeReimport(target: Collection, incoming: Collection): ReimportDiff {
  const existing = new Set(flattenRequests(target).map(({ request }) => stableRequestKey(request)));
  const source = flattenRequests(incoming);
  const matched = source.filter(({ request }) => existing.has(stableRequestKey(request))).length;
  return {
    matched,
    added: source.length - matched,
    retained: Math.max(0, existing.size - matched)
  };
}

/**
 * Update matching imported operations and add new ones. IDs, auth, custom
 * bodies and saved examples stay with the user-owned request; no request is
 * deleted as a side effect of a re-import.
 */
export function applySafeReimport(target: Collection, incoming: Collection): ReimportDiff {
  const diff = previewSafeReimport(target, incoming);
  const existing = new Map(
    flattenRequests(target).map(({ request }) => [stableRequestKey(request), request])
  );

  for (const { request, folderPath } of flattenRequests(incoming)) {
    const current = existing.get(stableRequestKey(request));
    if (current) {
      const preserved = {
        id: current.id,
        auth: current.auth,
        body: current.body,
        responseExamples: current.responseExamples
      };
      Object.assign(current, structuredClone(request), preserved);
      continue;
    }

    const destination = ensureFolderPath(target, folderPath);
    destination.push(structuredClone(request));
  }
  return diff;
}

export function stableRequestKey(request: ApiRequest): string {
  const method = (request.openApi?.method ?? request.method).toUpperCase();
  const path = request.openApi?.path ?? request.url;
  return `${method} ${path.trim()}`;
}

function ensureFolderPath(target: Collection, sourcePath: Folder[]): ApiRequest[] {
  let folders = target.folders;
  let folder: Folder | undefined;
  for (const source of sourcePath) {
    folder = folders.find((candidate) => candidate.name === source.name);
    if (!folder) {
      folder = createFolder(source.name);
      folders.push(folder);
    }
    folders = folder.folders;
  }
  return folder ? folder.requests : target.requests;
}
