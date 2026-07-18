import type { Collection } from "@openapi-collection-studio/core";

export type DragKind = "request" | "folder";

export interface DropTarget {
  position: "before" | "inside";
  collectionId: string;
  requestId?: string;
  folderId?: string;
}

export interface TreeActions {
  onSelectCollection(collectionId: string): void;
  onSelectFolder(folderId: string): void;
  onSelectRequest(requestId: string): void;
  onRenameCollection(collectionId: string, name: string): void;
  onDeleteCollection(collectionId: string): void;
  onRenameFolder(folderId: string, name: string): void;
  onDeleteFolder(folderId: string): void;
  onDuplicateFolder(folderId: string): void;
  onRenameRequest(requestId: string, name: string): void;
  onDeleteRequest(requestId: string): void;
  onDuplicateRequest(requestId: string): void;
  onMoveRequestTo(requestId: string, target: DropTarget): void;
  onMoveFolderTo(folderId: string, target: DropTarget): void;
}

export interface DragState { kind: DragKind; id: string; }

export interface CollectionTreeProps extends TreeActions {
  collections: Collection[];
  activeCollectionId?: string;
  selectedFolderId?: string;
  selectedRequestId?: string;
}

export interface TreeContext extends TreeActions {
  activeCollectionId?: string;
  selectedFolderId?: string;
  selectedRequestId?: string;
  query: string;
  expandedFolderIds: ReadonlySet<string>;
  toggleFolderExpanded(folderId: string): void;
  editingId?: string;
  setEditingId(id?: string): void;
  drag?: DragState;
  setDrag(drag?: DragState): void;
  dropHint?: string;
  setDropHint(id?: string): void;
}
