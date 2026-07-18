import { FileText, Folder, Layers } from "lucide-react";
import type { ApiRequest, Collection, Folder as FolderType } from "@openapi-collection-studio/core";
import { folderMatchCount, requestMatches } from "./match";
import { TreeRow } from "./TreeRow";
import type { TreeContext } from "./types";

export function CollectionNode({
  collection,
  context,
  expanded,
  onToggleExpanded
}: {
  collection: Collection;
  context: TreeContext;
  expanded: boolean;
  onToggleExpanded(): void;
}) {
  const { query } = context;
  const visibleRootRequests = query
    ? collection.requests.filter((request) => requestMatches(request, query))
    : collection.requests;
  const visibleFolders = query
    ? collection.folders.filter(
        (folder) => folder.name.toLowerCase().includes(query) || folderMatchCount(folder, query) > 0
      )
    : collection.folders;

  if (query && visibleRootRequests.length === 0 && visibleFolders.length === 0) {
    return null;
  }

  const isActive = collection.id === context.activeCollectionId;
  const isRootDropTarget = context.dropHint === `collection:${collection.id}` && context.drag !== undefined;

  return (
    <div className="tree__collection">
      <TreeRow
        className={isActive ? "tree__item is-active" : "tree__item"}
        icon={
          <Layers size={16} />
        }
        id={collection.id}
        expanded={expanded}
        label={collection.name}
        context={context}
        dropClass={isRootDropTarget ? "is-drop-inside" : ""}
        onDragOver={() => {
          if (context.drag) {
            context.setDropHint(`collection:${collection.id}`);
          }
        }}
        onDrop={() => {
          if (context.drag?.kind === "request") {
            context.onMoveRequestTo(context.drag.id, { position: "inside", collectionId: collection.id });
          } else if (context.drag?.kind === "folder") {
            context.onMoveFolderTo(context.drag.id, { position: "inside", collectionId: collection.id });
          }
          context.setDrag(undefined);
          context.setDropHint(undefined);
        }}
        onSelect={() => {
          context.onSelectCollection(collection.id);
        }}
        onToggleExpanded={onToggleExpanded}
        onRename={(name) => context.onRenameCollection(collection.id, name)}
        onDelete={() => context.onDeleteCollection(collection.id)}
      />
      {expanded && (
        <div className="tree__children">
          {visibleRootRequests.map((request) => (
            <RequestNode collectionId={collection.id} context={context} key={request.id} request={request} />
          ))}
          {visibleFolders.map((folder) => (
            <FolderNode collectionId={collection.id} context={context} folder={folder} key={folder.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderNode({
  folder,
  collectionId,
  context,
  depth = 0
}: {
  folder: FolderType;
  collectionId: string;
  context: TreeContext;
  depth?: number;
}) {
  const { query } = context;
  const visibleRequests = query
    ? folder.requests.filter((request) => requestMatches(request, query))
    : folder.requests;
  const visibleFolders = query
    ? folder.folders.filter(
        (child) => child.name.toLowerCase().includes(query) || folderMatchCount(child, query) > 0
      )
    : folder.folders;

  const isDropTarget =
    context.dropHint === `folder:${folder.id}` &&
    context.drag !== undefined &&
    !(context.drag.kind === "folder" && context.drag.id === folder.id);
  const hasChildren = folder.requests.length > 0 || folder.folders.length > 0;
  const expanded = query.length > 0 || context.expandedFolderIds.has(folder.id);

  return (
    <div className="tree__folder">
      <TreeRow
        className={folder.id === context.selectedFolderId ? "tree__item is-selected" : "tree__item"}
        icon={
          <Folder size={16} />
        }
        id={folder.id}
        expanded={hasChildren ? expanded : undefined}
        indent={8 + depth * 14}
        label={folder.name}
        badge={query ? undefined : String(folder.requests.length || "")}
        context={context}
        draggable
        dropClass={isDropTarget ? "is-drop-inside" : ""}
        onDragStart={() => context.setDrag({ kind: "folder", id: folder.id })}
        onDragEnd={() => {
          context.setDrag(undefined);
          context.setDropHint(undefined);
        }}
        onDragOver={() => {
          if (context.drag && !(context.drag.kind === "folder" && context.drag.id === folder.id)) {
            context.setDropHint(`folder:${folder.id}`);
          }
        }}
        onDrop={() => {
          if (context.drag?.kind === "request") {
            context.onMoveRequestTo(context.drag.id, {
              position: "inside",
              collectionId,
              folderId: folder.id
            });
          } else if (context.drag?.kind === "folder" && context.drag.id !== folder.id) {
            context.onMoveFolderTo(context.drag.id, {
              position: "inside",
              collectionId,
              folderId: folder.id
            });
          }
          context.setDrag(undefined);
          context.setDropHint(undefined);
        }}
        onSelect={() => {
          context.onSelectFolder(folder.id);
        }}
        onToggleExpanded={hasChildren ? () => context.toggleFolderExpanded(folder.id) : undefined}
        onRename={(name) => context.onRenameFolder(folder.id, name)}
        onDelete={() => context.onDeleteFolder(folder.id)}
        onDuplicate={() => context.onDuplicateFolder(folder.id)}
      />
      {expanded && (
        <div className="tree__children">
          {visibleRequests.map((request) => (
            <RequestNode
              collectionId={collectionId}
              containerFolderId={folder.id}
              context={context}
              depth={depth + 1}
              key={request.id}
              request={request}
            />
          ))}
          {visibleFolders.map((child) => (
            <FolderNode collectionId={collectionId} context={context} depth={depth + 1} folder={child} key={child.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestNode({
  request,
  collectionId,
  context,
  containerFolderId,
  depth = 0
}: {
  request: ApiRequest;
  collectionId: string;
  context: TreeContext;
  containerFolderId?: string;
  depth?: number;
}) {
  const dropClass =
    context.dropHint === `req:${request.id}` && context.drag?.kind === "request"
      ? "is-drop-before"
      : "";

  return (
    <TreeRow
      className={
        request.id === context.selectedRequestId
          ? "tree__item tree__request is-selected"
          : "tree__item tree__request"
      }
      icon={
        <>
          <FileText size={15} />
          <span className={`method method--${request.method.toLowerCase()}`}>{request.method}</span>
        </>
      }
      id={request.id}
      indent={28 + depth * 14}
      label={request.name}
      context={context}
      draggable
      dropClass={dropClass}
      onDragStart={() => context.setDrag({ kind: "request", id: request.id })}
      onDragEnd={() => {
        context.setDrag(undefined);
        context.setDropHint(undefined);
      }}
      onDragOver={() => {
        if (context.drag?.kind === "request" && context.drag.id !== request.id) {
          context.setDropHint(`req:${request.id}`);
        }
      }}
      onDrop={() => {
        if (context.drag?.kind === "request" && context.drag.id !== request.id) {
          context.onMoveRequestTo(context.drag.id, {
            position: "before",
            collectionId,
            requestId: request.id,
            folderId: containerFolderId
          });
        }
        context.setDrag(undefined);
        context.setDropHint(undefined);
      }}
      onSelect={() => context.onSelectRequest(request.id)}
      onRename={(name) => context.onRenameRequest(request.id, name)}
      onDelete={() => context.onDeleteRequest(request.id)}
      onDuplicate={() => context.onDuplicateRequest(request.id)}
    />
  );
}

/**
 * One tree row: click selects, hover reveals rename/duplicate/delete actions,
 * rename switches the label to an inline input (Enter commits, Escape cancels).
 */
