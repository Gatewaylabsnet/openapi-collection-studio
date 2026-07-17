import type { ApiRequest, Collection, Folder } from "./types";

export interface RequestWithLocation {
  request: ApiRequest;
  collection: Collection;
  folder?: Folder;
  folderPath: Folder[];
}

export interface FolderWithPath {
  folder: Folder;
  path: Folder[];
}

export function visitFolders(
  folders: Folder[],
  visitor: (folder: Folder, path: Folder[]) => void,
  parentPath: Folder[] = []
): void {
  for (const folder of folders) {
    const path = [...parentPath, folder];
    visitor(folder, path);
    visitFolders(folder.folders, visitor, path);
  }
}

export function flattenFolders(collection: Collection): FolderWithPath[] {
  const result: FolderWithPath[] = [];
  visitFolders(collection.folders, (folder, path) => result.push({ folder, path }));
  return result;
}

export function flattenRequests(collection: Collection): RequestWithLocation[] {
  const result: RequestWithLocation[] = collection.requests.map((request) => ({
    request,
    collection,
    folderPath: []
  }));

  visitFolders(collection.folders, (folder, folderPath) => {
    for (const request of folder.requests) {
      result.push({ request, collection, folder, folderPath });
    }
  });

  return result;
}

export function findFolder(collection: Collection, folderId: string): Folder | undefined {
  let found: Folder | undefined;
  visitFolders(collection.folders, (folder) => {
    if (folder.id === folderId) {
      found = folder;
    }
  });
  return found;
}

export function findRequest(collection: Collection, requestId: string): RequestWithLocation | undefined {
  return flattenRequests(collection).find(({ request }) => request.id === requestId);
}

/** Return the nearest non-empty base URL in a folder path. */
export function folderBaseUrl(
  folderPath: readonly Pick<Folder, "baseUrl">[]
): string | undefined {
  for (let index = folderPath.length - 1; index >= 0; index -= 1) {
    const value = folderPath[index].baseUrl?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function removeFolder(collection: Collection, folderId: string): Folder | undefined {
  const rootIndex = collection.folders.findIndex((folder) => folder.id === folderId);
  if (rootIndex >= 0) {
    return collection.folders.splice(rootIndex, 1)[0];
  }

  let removed: Folder | undefined;
  visitFolders(collection.folders, (folder) => {
    if (removed) {
      return;
    }
    const index = folder.folders.findIndex((child) => child.id === folderId);
    if (index >= 0) {
      removed = folder.folders.splice(index, 1)[0];
    }
  });
  return removed;
}

/** True when `folderId` is `root` itself or lives anywhere in its subtree. */
export function folderSubtreeContains(root: Folder, folderId: string): boolean {
  if (root.id === folderId) {
    return true;
  }
  let found = false;
  visitFolders(root.folders, (folder) => {
    if (folder.id === folderId) {
      found = true;
    }
  });
  return found;
}

/**
 * Move a request into `targetFolderId` (or the collection root when null),
 * placing it immediately before `beforeRequestId`, or at the end when that is
 * null/unknown. Returns false if the request or target could not be found.
 */
export function relocateRequest(
  collection: Collection,
  requestId: string,
  targetFolderId: string | null,
  beforeRequestId: string | null
): boolean {
  const container = targetFolderId
    ? findFolder(collection, targetFolderId)?.requests
    : collection.requests;
  if (!container) {
    return false;
  }
  const request = removeRequest(collection, requestId);
  if (!request) {
    return false;
  }
  const beforeIndex = beforeRequestId
    ? container.findIndex((item) => item.id === beforeRequestId)
    : -1;
  if (beforeIndex >= 0) {
    container.splice(beforeIndex, 0, request);
  } else {
    container.push(request);
  }
  return true;
}

/**
 * Move a folder under `targetParentId` (or the collection root when null),
 * before `beforeFolderId` or at the end. Refuses to move a folder into itself
 * or one of its own descendants. Returns false when the move is invalid.
 */
export function relocateFolder(
  collection: Collection,
  folderId: string,
  targetParentId: string | null,
  beforeFolderId: string | null
): boolean {
  if (folderId === targetParentId || folderId === beforeFolderId) {
    return false;
  }
  const source = findFolder(collection, folderId);
  if (!source) {
    return false;
  }
  if (targetParentId && folderSubtreeContains(source, targetParentId)) {
    return false;
  }
  const container = targetParentId
    ? findFolder(collection, targetParentId)?.folders
    : collection.folders;
  if (!container) {
    return false;
  }
  const removed = removeFolder(collection, folderId);
  if (!removed) {
    return false;
  }
  const beforeIndex = beforeFolderId
    ? container.findIndex((item) => item.id === beforeFolderId)
    : -1;
  if (beforeIndex >= 0) {
    container.splice(beforeIndex, 0, removed);
  } else {
    container.push(removed);
  }
  return true;
}

/** Count every request in a folder subtree, used for delete confirmations. */
export function countFolderRequests(folder: Folder): number {
  let count = folder.requests.length;
  visitFolders(folder.folders, (child) => {
    count += child.requests.length;
  });
  return count;
}

export function removeRequest(collection: Collection, requestId: string): ApiRequest | undefined {
  const rootIndex = collection.requests.findIndex((request) => request.id === requestId);
  if (rootIndex >= 0) {
    return collection.requests.splice(rootIndex, 1)[0];
  }

  let removed: ApiRequest | undefined;
  visitFolders(collection.folders, (folder) => {
    if (removed) {
      return;
    }
    const index = folder.requests.findIndex((request) => request.id === requestId);
    if (index >= 0) {
      removed = folder.requests.splice(index, 1)[0];
    }
  });

  return removed;
}
