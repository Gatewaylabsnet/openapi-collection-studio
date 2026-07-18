import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { findRequest, flattenFolders } from "@openapi-collection-studio/core";
import { CollectionNode } from "./tree/nodes";
import type { CollectionTreeProps, DragState, TreeContext } from "./tree/types";

export type { DragKind, DropTarget, TreeActions } from "./tree/types";

export function CollectionTree(props: CollectionTreeProps) {
  const { collections, activeCollectionId } = props;
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [drag, setDrag] = useState<DragState>();
  const [dropHint, setDropHint] = useState<string>();
  const [expandedCollectionIds, setExpandedCollectionIds] = useState<Set<string>>(() => {
    const firstExpanded = activeCollectionId ?? collections[0]?.id;
    return firstExpanded ? new Set([firstExpanded]) : new Set();
  });
  const initialFolderIds = collections.flatMap((collection) =>
    flattenFolders(collection).map(({ folder }) => folder.id)
  );
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set(initialFolderIds)
  );
  const knownFolderIds = useRef(new Set(initialFolderIds));
  const previousSelectedFolderId = useRef<string>();
  const previousSelectedRequestId = useRef<string>();
  const query = search.trim().toLowerCase();

  useEffect(() => {
    if (!activeCollectionId) return;
    setExpandedCollectionIds((current) => {
      if (current.has(activeCollectionId)) return current;
      const next = new Set(current);
      next.add(activeCollectionId);
      return next;
    });
  }, [activeCollectionId]);

  useEffect(() => {
    setExpandedCollectionIds((current) => {
      const collectionIds = new Set(collections.map((collection) => collection.id));
      const next = new Set([...current].filter((id) => collectionIds.has(id)));
      return next;
    });
  }, [collections]);

  useEffect(() => {
    const currentFolderIds = new Set(
      collections.flatMap((collection) =>
        flattenFolders(collection).map(({ folder }) => folder.id)
      )
    );
    const addedFolderIds = [...currentFolderIds].filter((id) => !knownFolderIds.current.has(id));
    knownFolderIds.current = currentFolderIds;
    setExpandedFolderIds((current) => {
      const next = new Set([...current].filter((id) => currentFolderIds.has(id)));
      for (const id of addedFolderIds) next.add(id);
      return next;
    });
  }, [collections]);

  useEffect(() => {
    if (props.selectedFolderId === previousSelectedFolderId.current) return;
    previousSelectedFolderId.current = props.selectedFolderId;
    if (!props.selectedFolderId) return;
    const location = collections
      .flatMap((collection) => flattenFolders(collection))
      .find(({ folder }) => folder.id === props.selectedFolderId);
    if (!location) return;
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      for (const folder of location.path.slice(0, -1)) next.add(folder.id);
      return next;
    });
  }, [collections, props.selectedFolderId]);

  useEffect(() => {
    if (props.selectedRequestId === previousSelectedRequestId.current) return;
    previousSelectedRequestId.current = props.selectedRequestId;
    if (!props.selectedRequestId) return;
    const location = collections
      .map((collection) => findRequest(collection, props.selectedRequestId!))
      .find(Boolean);
    if (!location) return;
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      for (const folder of location.folderPath) next.add(folder.id);
      return next;
    });
  }, [collections, props.selectedRequestId]);

  const toggleCollectionExpanded = (collectionId: string) => {
    setExpandedCollectionIds((current) => {
      const next = new Set(current);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  };

  const toggleFolderExpanded = (folderId: string) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const context: TreeContext = {
    ...props,
    query,
    expandedFolderIds,
    toggleFolderExpanded,
    editingId,
    setEditingId,
    drag,
    setDrag,
    dropHint,
    setDropHint
  };

  return (
    <div className="tree-wrap">
      <div className="tree-search">
        <Search size={14} />
        <input aria-label="Search requests" onChange={(event) => setSearch(event.target.value)} placeholder="Search requests..." value={search} />
        {search && (
          <button className="tree-search__clear" onClick={() => setSearch("")} title="Clear search" type="button"><X size={13} /></button>
        )}
      </div>
      <div className="tree">
        {collections.map((collection) => (
          <CollectionNode
            collection={collection}
            context={context}
            expanded={query.length > 0 || expandedCollectionIds.has(collection.id)}
            key={collection.id}
            onToggleExpanded={() => toggleCollectionExpanded(collection.id)}
          />
        ))}
        {collections.length === 0 && (
          <div className="tree-empty">No collections yet. Import an OpenAPI document or create one.</div>
        )}
      </div>
    </div>
  );
}
