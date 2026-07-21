// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCollection } from "@openapi-collection-studio/core";
import { ImportScreen } from "./ImportScreen";

afterEach(() => vi.restoreAllMocks());

describe("ImportScreen", () => {
  it("shows Import Doctor findings and a safe re-import preview", () => {
    const collection = createCollection("Existing API");
    render(
      <ImportScreen
        collections={[collection]}
        grouping="tags"
        importDiff={{ matched: 2, added: 1, retained: 4 }}
        importError=""
        importSummary="OpenAPI 3.1 JSON - 3 requests"
        importTargetCollectionId={collection.id}
        importText="{}"
        importUrl=""
        importWarnings={["Get users: response script was not imported."]}
        isFetchingUrl={false}
        onFetchUrl={vi.fn()}
        onGroupingChange={vi.fn()}
        onImport={vi.fn()}
        onImportTargetChange={vi.fn()}
        onImportUrlChange={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenPostmanFolder={vi.fn()}
        onPreview={vi.fn()}
        onSelectAllOperations={vi.fn()}
        onTextChange={vi.fn()}
        onToggleOperation={vi.fn()}
        operations={[]}
        postmanFolderPath=""
        selectedOperationKeys={new Set()}
      />
    );

    expect(screen.getByRole("region", { name: "Import Doctor" }).textContent).toContain("response script was not imported");
    expect(screen.getByText("Safe re-import preview")).toBeTruthy();
    expect(screen.getByText("2 matched · 1 new · 4 retained")).toBeTruthy();
  });
});
