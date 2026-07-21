import { useState } from "react";
import { Boxes, Download, FileJson, FilePlus2, FolderPlus, Import, Plus, Settings, Wand2 } from "lucide-react";
import { flattenFolders, type Collection, type Workspace } from "@openapi-collection-studio/core";
import { CollectionTree, type TreeActions } from "../../components/CollectionTree";
import type { Screen } from "../types";

export function CollectionsSidebar({
  workspace,
  activeCollection,
  selectedFolderId,
  selectedRequestId,
  screen,
  onScreenChange,
  treeActions,
  onAddRequest,
  onAddFolder,
  onAddCollection,
  onAddJwtRequest,
  onAddApinizerJwtRequest,
  onAddOAuthClientRequest,
  onAddOAuthPasswordRequest
}: {
  workspace: Workspace;
  activeCollection?: Collection;
  selectedFolderId?: string;
  selectedRequestId?: string;
  screen: Screen;
  onScreenChange(screen: Screen): void;
  treeActions: TreeActions;
  onAddRequest(): void;
  onAddFolder(): void;
  onAddCollection(): void;
  onAddJwtRequest(): void;
  onAddApinizerJwtRequest(): void;
  onAddOAuthClientRequest(): void;
  onAddOAuthPasswordRequest(): void;
}) {
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const selectedFolderPath =
    activeCollection && selectedFolderId
      ? flattenFolders(activeCollection)
          .find(({ folder }) => folder.id === selectedFolderId)
          ?.path.map((folder) => folder.name)
          .join(" / ")
      : "";
  const requestTarget = selectedFolderPath || (activeCollection ? `${activeCollection.name} root` : "Create a collection first");
  const runNewAction = (action: () => void) => {
    action();
    setIsNewMenuOpen(false);
  };

  return (
    <aside className="sidebar">
      <nav className="sidebar__nav" aria-label="Primary">
        <NavButton
          active={screen === "editor"}
          icon={<FileJson size={16} />}
          onClick={() => onScreenChange("editor")}
        >
          Editor
        </NavButton>
        <NavButton
          active={screen === "import"}
          icon={<Import size={16} />}
          onClick={() => onScreenChange(screen === "import" ? "editor" : "import")}
        >
          Import
        </NavButton>
        <NavButton
          active={screen === "environments"}
          icon={<Boxes size={16} />}
          onClick={() => onScreenChange(screen === "environments" ? "editor" : "environments")}
        >
          Environments
        </NavButton>
        <NavButton
          active={screen === "export"}
          icon={<Download size={16} />}
          onClick={() => onScreenChange(screen === "export" ? "editor" : "export")}
        >
          Export
        </NavButton>
        <NavButton
          active={screen === "settings"}
          icon={<Settings size={16} />}
          onClick={() => onScreenChange(screen === "settings" ? "editor" : "settings")}
        >
          Settings
        </NavButton>
      </nav>
      <div className="sidebar__toolbar">
        <div className="sidebar__new-menu" onKeyDown={(event) => event.key === "Escape" && setIsNewMenuOpen(false)}>
          <button
            aria-expanded={isNewMenuOpen}
            aria-haspopup="menu"
            className="primary-button sidebar__new-trigger"
            onClick={() => setIsNewMenuOpen((open) => !open)}
            type="button"
          >
            <Plus size={16} />
            New
          </button>
          {isNewMenuOpen && (
            <div className="sidebar__new-panel" role="menu">
              <button className="new-menu-item" onClick={() => runNewAction(onAddCollection)} role="menuitem" type="button">
                <Plus size={15} />
                Collection
              </button>
              <button
                className="new-menu-item"
                disabled={!activeCollection}
                onClick={() => runNewAction(onAddFolder)}
                role="menuitem"
                type="button"
              >
                <FolderPlus size={15} />
                Folder
              </button>
              <div className="new-menu-section">
                <div className="new-menu-section__title">
                  <FilePlus2 size={14} />
                  Request
                </div>
                <button
                  className="new-menu-item new-menu-item--nested"
                  disabled={!activeCollection}
                  onClick={() => runNewAction(onAddRequest)}
                  role="menuitem"
                  type="button"
                >
                  Standard request
                </button>
                <button
                  className="new-menu-item new-menu-item--nested"
                  disabled={!activeCollection}
                  onClick={() => runNewAction(onAddJwtRequest)}
                  role="menuitem"
                  type="button"
                >
                  JWT token request
                </button>
                <button
                  className="new-menu-item new-menu-item--nested"
                  disabled={!activeCollection}
                  onClick={() => runNewAction(onAddApinizerJwtRequest)}
                  role="menuitem"
                  type="button"
                >
                  Apinizer JWT request
                </button>
                <button className="new-menu-item new-menu-item--nested" disabled={!activeCollection} onClick={() => runNewAction(onAddOAuthClientRequest)} role="menuitem" type="button">
                  OAuth client credentials
                </button>
                <button className="new-menu-item new-menu-item--nested" disabled={!activeCollection} onClick={() => runNewAction(onAddOAuthPasswordRequest)} role="menuitem" type="button">
                  OAuth password grant
                </button>
                <div className="new-menu-target" title={requestTarget}>
                  Target: {requestTarget}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <CollectionTree
        {...treeActions}
        activeCollectionId={activeCollection?.id}
        collections={workspace.collections}
        selectedFolderId={selectedFolderId}
        selectedRequestId={selectedRequestId}
      />
    </aside>
  );
}

export function WelcomeMain({
  onImport,
  onNewCollection
}: {
  onImport(): void;
  onNewCollection(): void;
}) {
  return (
    <div className="welcome-main">
      <div className="home-empty">
        <FileJson size={32} />
        <h2>Welcome to Specfold</h2>
        <p>
          Import an OpenAPI/Swagger document to turn its endpoints into an editable
          request collection, or start a collection from scratch.
        </p>
        <div className="button-row">
          <button className="primary-button" onClick={onImport} type="button">
            <Import size={16} />
            Import OpenAPI
          </button>
          <button className="secondary-button" onClick={onNewCollection} type="button">
            <Plus size={16} />
            New collection
          </button>
        </div>
      </div>
    </div>
  );
}

export function NavButton({
  children,
  active,
  icon,
  onClick
}: {
  children: string;
  active: boolean;
  icon: React.ReactNode;
  onClick(): void;
}) {
  return (
    <button
      aria-label={children}
      className={active ? "nav-btn is-active" : "nav-btn"}
      onClick={onClick}
      title={children}
      type="button"
    >
      {icon}
      <span className="nav-btn__label">{children}</span>
    </button>
  );
}
