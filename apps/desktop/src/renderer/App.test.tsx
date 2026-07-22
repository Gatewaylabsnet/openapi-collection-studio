// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCollection,
  createEmptyWorkspace,
  createFolder,
  createRequest,
  type Workspace
} from "@openapi-collection-studio/core";
import type { StudioApi } from "../shared/contracts";
import { App } from "./App";
import { CollectionTree } from "./components/CollectionTree";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function sampleWorkspace(): Workspace {
  const workspace = createEmptyWorkspace("Test workspace");
  const collection = createCollection("Demo API");
  collection.requests.push(createRequest({ name: "List users", method: "GET", url: "/users" }));
  workspace.collections.push(collection);
  return workspace;
}

function studioMock(workspace = sampleWorkspace()): StudioApi {
  return {
    loadWorkspace: vi.fn(async () => ({ workspace, recovered: false, secureStorageAvailable: true })),
    saveWorkspace: vi.fn(async () => undefined),
    loadSettings: vi.fn(async () => ({
      requestTimeoutMs: 30_000,
      maxResponseBytes: 10 * 1024 * 1024,
      allowInsecureTls: false,
      theme: "system" as const,
      fontSize: "compact" as const
    })),
    saveSettings: vi.fn(async (settings) => settings),
    sendRequest: vi.fn(async () => ({
      status: 200,
      statusText: "OK",
      durationMs: 1,
      sizeBytes: 2,
      headers: {},
      body: "{}",
      rawBody: "{}"
    })),
    saveExportFile: vi.fn(async () => ({ canceled: true })),
    openImportFile: vi.fn(async () => ({ canceled: true })),
    openPostmanFolder: vi.fn(async () => ({ canceled: true })),
    openUploadFile: vi.fn(async () => ({ canceled: true })),
    releaseUploadFile: vi.fn(async () => undefined),
    exportBackup: vi.fn(async () => ({ canceled: true })),
    restoreBackup: vi.fn(async () => ({ canceled: true, restored: false, secureStorageAvailable: true })),
    deleteAllData: vi.fn(async () => undefined),
    fetchImportUrl: vi.fn(async () => ({ ok: false, error: "offline" }))
  };
}

async function renderApp(api = studioMock()) {
  window.studio = api;
  render(<App />);
  await screen.findByRole("navigation", { name: "Primary" });
  return { api, user: userEvent.setup() };
}

describe("renderer workflows", () => {
  it("shows every supported import source choice", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByRole("button", { name: "Open file" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Postman v3 folder" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Import from URL" })).toBeTruthy();
    expect(screen.getByPlaceholderText(/Paste OpenAPI 3.x/)).toBeTruthy();
  });

  it("requires confirmation before backup export and restore", async () => {
    const api = studioMock();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { user } = await renderApp(api);
    await user.click(screen.getByRole("button", { name: "Settings" }));

    await user.click(screen.getByRole("button", { name: "Export backup" }));
    expect(api.exportBackup).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Export backup" }));
    await waitFor(() => expect(api.exportBackup).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Restore backup" }));
    await waitFor(() => expect(api.restoreBackup).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledTimes(3);
  });

  it("saves the text size preference from Settings", async () => {
    const api = studioMock();
    const { user } = await renderApp(api);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Text size" }), "large");

    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ fontSize: "large" })));
    expect(document.documentElement.dataset.fontSize).toBe("large");
  });

  it("does not allow the last environment to be deleted", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Environments" }));
    const deleteButton = screen.getByTitle("At least one environment is required") as HTMLButtonElement;
    expect(deleteButton.disabled).toBe(true);
  });

  it("keeps request name editing responsive across multiple folders and commits on blur", async () => {
    const workspace = createEmptyWorkspace("Multi-folder workspace");
    const collection = createCollection("Demo API");
    const firstFolder = createFolder("Accounts");
    const secondFolder = createFolder("Orders");
    firstFolder.requests.push(
      createRequest({ name: "Find account", method: "GET", url: "/accounts/{id}" })
    );
    secondFolder.requests.push(
      createRequest({ name: "Find order", method: "GET", url: "/orders/{id}" })
    );
    collection.folders.push(firstFolder, secondFolder);
    workspace.collections.push(collection);

    const { user } = await renderApp(studioMock(workspace));
    const nameInput = screen.getByRole("textbox", { name: "Request name" });
    await user.clear(nameInput);
    await user.type(nameInput, "Get account details");

    expect((nameInput as HTMLInputElement).value).toBe("Get account details");
    expect(screen.getByText("Find account")).toBeTruthy();

    await user.tab();
    await screen.findByText("Get account details");
  });

  it("builds multipart text and file fields with an accessible file picker", async () => {
    const workspace = createEmptyWorkspace("Upload workspace");
    const collection = createCollection("Documents API");
    collection.requests.push(
      createRequest({ name: "Upload document", method: "POST", url: "/documents" })
    );
    workspace.collections.push(collection);
    const api = studioMock(workspace);
    api.openUploadFile = vi.fn(async () => ({
      canceled: false,
      file: {
        uploadId: "upload-session-1",
        fileName: "report.pdf",
        sizeBytes: 2048,
        contentType: "application/pdf"
      }
    }));

    const { user } = await renderApp(api);
    await user.click(screen.getByRole("button", { name: "Body" }));
    await user.click(screen.getByRole("button", { name: "Form data" }));

    expect(screen.getByRole("note", { name: "Multipart boundary information" }).textContent)
      .toMatch(/boundary.*automatically/i);
    await user.click(screen.getByRole("button", { name: "Add text field" }));
    await user.type(screen.getByRole("textbox", { name: "Field 1 name" }), "title");
    await user.type(screen.getByRole("textbox", { name: "Field 1 value" }), "Quarterly report");

    await user.click(screen.getByRole("button", { name: "Add file" }));
    await user.type(screen.getByRole("textbox", { name: "Field 2 name" }), "document");
    expect(screen.getByRole("alert").textContent).toMatch(/choose a file/i);
    await user.click(screen.getByRole("button", { name: "Choose file for field 2" }));

    expect(await screen.findByText("report.pdf")).toBeTruthy();
    expect(screen.getByText("2.0 KB / application/pdf")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Replace file for field 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear file for field 2" })).toBeTruthy();
    const mediaType = screen.getByRole("textbox", { name: "Field 2 media type" });
    expect((mediaType as HTMLInputElement).value).toBe("application/pdf");
    await user.clear(mediaType);
    await user.type(mediaType, "application/vnd.gateway.document");

    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(api.sendRequest).toHaveBeenCalledTimes(1));
    expect(api.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          mode: "multipart",
          contentType: "multipart/form-data",
          multipart: expect.arrayContaining([
            expect.objectContaining({ key: "title", type: "text", value: "Quarterly report" }),
            expect.objectContaining({
              key: "document",
              type: "file",
              uploadId: "upload-session-1",
              fileName: "report.pdf",
              contentType: "application/vnd.gateway.document"
            })
          ])
        })
      }),
      expect.anything(),
      expect.anything(),
      []
    );

    await user.click(screen.getByRole("button", { name: "Clear file for field 2" }));
    expect(screen.getByRole("alert").textContent).toMatch(/choose a file/i);
    expect(api.releaseUploadFile).toHaveBeenCalledWith("upload-session-1");
  });

  it("shows file-picker failures inline without removing the multipart row", async () => {
    const workspace = createEmptyWorkspace("Upload error workspace");
    const collection = createCollection("Documents API");
    collection.requests.push(
      createRequest({ name: "Upload document", method: "POST", url: "/documents" })
    );
    workspace.collections.push(collection);
    const api = studioMock(workspace);
    api.openUploadFile = vi.fn(async () => ({
      canceled: false,
      error: "The selected file is no longer available."
    }));

    const { user } = await renderApp(api);
    await user.click(screen.getByRole("button", { name: "Body" }));
    await user.click(screen.getByRole("button", { name: "Form data" }));
    await user.click(screen.getByRole("button", { name: "Add file" }));
    await user.click(screen.getByRole("button", { name: "Choose file for field 1" }));

    expect((await screen.findByRole("alert")).textContent)
      .toBe("The selected file is no longer available.");
    expect(screen.getByRole("listitem", { name: "Form-data field 1" })).toBeTruthy();
  });

  it("edits a folder base URL and sends its inherited folder path", async () => {
    const workspace = createEmptyWorkspace("Proxy workspace");
    const collection = createCollection("Demo API");
    collection.baseUrl = "https://api.example.com/default";
    const parent = createFolder("Proxy A");
    parent.baseUrl = "https://proxy-a.example.com/service";
    const child = createFolder("Orders");
    child.requests.push(createRequest({ name: "List orders", method: "GET", url: "/orders" }));
    parent.folders.push(child);
    collection.folders.push(parent);
    workspace.collections.push(collection);
    const api = studioMock(workspace);

    const { user } = await renderApp(api);
    await user.click(screen.getByRole("button", { name: /^Orders/ }));
    const folderBaseUrl = screen.getByRole("textbox", { name: "Folder base URL" });
    expect(screen.queryByRole("textbox", { name: "Collection base URL" })).toBeNull();
    expect(folderBaseUrl.getAttribute("placeholder")).toContain("https://proxy-a.example.com/service");
    expect(screen.getByText("Inherited from Proxy A")).toBeTruthy();
    await user.type(folderBaseUrl, "https://proxy-b.example.com/orders");

    await user.click(screen.getByRole("button", { name: /List orders/ }));
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(api.sendRequest).toHaveBeenCalledTimes(1));
    expect(api.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ name: "List orders" }),
      expect.anything(),
      expect.objectContaining({ baseUrl: "https://api.example.com/default" }),
      [
        { baseUrl: "https://proxy-a.example.com/service" },
        { baseUrl: "https://proxy-b.example.com/orders" }
      ]
    );
  });

  it("creates Apinizer JWT in a dedicated folder with a derived gateway origin", async () => {
    const workspace = createEmptyWorkspace("Apinizer workspace");
    const collection = createCollection("DATS CKS");
    collection.baseUrl = "https://api.tarimorman.gov.tr/dats/cks";
    workspace.collections.push(collection);

    const { user } = await renderApp(studioMock(workspace));
    await user.click(screen.getByRole("button", { name: "New" }));
    await user.click(screen.getByRole("menuitem", { name: "Apinizer JWT request" }));

    expect((await screen.findAllByText("Apinizer Auth")).length).toBeGreaterThan(0);
    expect((screen.getByRole("textbox", { name: "Folder base URL" }) as HTMLInputElement).value)
      .toBe("https://api.tarimorman.gov.tr");
    expect((screen.getByRole("textbox", { name: "Request URL" }) as HTMLInputElement).value)
      .toBe("{{baseUrl}}/auth/jwt");
  });

  it("copies the generated export preview to the clipboard", async () => {
    const { user } = await renderApp();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain("/users");
    expect(await screen.findByText("Copied export content to the clipboard.")).toBeTruthy();
  });
});

describe("collection tree", () => {
  it("collapses nested folders independently and reveals matches while searching", async () => {
    const collection = createCollection("Hierarchy API");
    const accounts = createFolder("Accounts");
    const orders = createFolder("Orders");
    accounts.requests.push(createRequest({ name: "Find account", method: "GET", url: "/accounts/{id}" }));
    orders.requests.push(createRequest({ name: "Find order", method: "GET", url: "/orders/{id}" }));
    accounts.folders.push(orders);
    collection.folders.push(accounts);
    const noop = vi.fn();
    const onSelectFolder = vi.fn();
    const user = userEvent.setup();

    render(<CollectionTree
      activeCollectionId={collection.id}
      collections={[collection]}
      onDeleteCollection={noop}
      onDeleteFolder={noop}
      onDeleteRequest={noop}
      onDuplicateFolder={noop}
      onDuplicateRequest={noop}
      onMoveFolderTo={noop}
      onMoveRequestTo={noop}
      onRenameCollection={noop}
      onRenameFolder={noop}
      onRenameRequest={noop}
      onSelectCollection={noop}
      onSelectFolder={onSelectFolder}
      onSelectRequest={noop}
    />);

    const accountsButton = screen.getByRole("button", { name: /^Accounts/ });
    const collapseAccounts = screen.getByRole("button", { name: "Collapse Accounts" });
    expect(collapseAccounts.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Find account")).toBeTruthy();
    expect(screen.getByText("Find order")).toBeTruthy();

    await user.click(collapseAccounts);
    expect(screen.getByRole("button", { name: "Expand Accounts" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Find account")).toBeNull();
    expect(screen.queryByText("Find order")).toBeNull();

    await user.type(screen.getByRole("textbox", { name: "Search requests" }), "order");
    expect(screen.getByText("Find order")).toBeTruthy();
    await user.clear(screen.getByRole("textbox", { name: "Search requests" }));
    expect(screen.queryByText("Find order")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Expand Accounts" }));
    await user.click(screen.getByRole("button", { name: "Collapse Orders" }));
    expect(screen.getByText("Find account")).toBeTruthy();
    expect(screen.queryByText("Find order")).toBeNull();

    await user.click(accountsButton);
    expect(onSelectFolder).toHaveBeenCalledWith(accounts.id);
  });

  it("supports selection, search, and inline rename", async () => {
    const first = createCollection("First API");
    first.requests.push(createRequest({ name: "Find account", method: "GET", url: "/account" }));
    const second = createCollection("Second API");
    const onSelectCollection = vi.fn();
    const onRenameCollection = vi.fn();
    const noop = vi.fn();
    const user = userEvent.setup();
    render(<CollectionTree
      collections={[first, second]}
      onDeleteCollection={noop}
      onDeleteFolder={noop}
      onDeleteRequest={noop}
      onDuplicateFolder={noop}
      onDuplicateRequest={noop}
      onMoveFolderTo={noop}
      onMoveRequestTo={noop}
      onRenameCollection={onRenameCollection}
      onRenameFolder={noop}
      onRenameRequest={noop}
      onSelectCollection={onSelectCollection}
      onSelectFolder={noop}
      onSelectRequest={noop}
    />);

    await user.click(screen.getByRole("button", { name: "First API" }));
    expect(onSelectCollection).toHaveBeenCalledWith(first.id);
    await user.type(screen.getByRole("textbox", { name: "Search requests" }), "account");
    expect(screen.getByText("Find account")).toBeTruthy();
    await user.clear(screen.getByRole("textbox", { name: "Search requests" }));
    await user.dblClick(screen.getByRole("button", { name: "Second API" }));
    const renameInput = screen.getByDisplayValue("Second API");
    await user.clear(renameInput);
    await user.type(renameInput, "Renamed API{Enter}");
    expect(onRenameCollection).toHaveBeenCalledWith(second.id, "Renamed API");
  });
});
