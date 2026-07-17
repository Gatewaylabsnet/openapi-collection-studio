import { describe, expect, it } from "vitest";
import {
  cloneFolder,
  cloneRequest,
  countFolderRequests,
  createApinizerJwtRequest,
  deriveApinizerBaseUrl,
  createCollection,
  createEmptyWorkspace,
  createFolder,
  createKeyValue,
  createRequest,
  findFolder,
  removeFolder
} from "../src";

describe("model helpers", () => {
  it("starts every workspace with an active, renameable Specfold environment", () => {
    const workspace = createEmptyWorkspace();

    expect(workspace.environments).toHaveLength(1);
    expect(workspace.environments[0].name).toBe("Specfold");
    expect(workspace.activeEnvironmentId).toBe(workspace.environments[0].id);
  });

  it("clones a request with fresh ids everywhere", () => {
    const request = createRequest({ name: "Original", method: "POST", url: "{{baseUrl}}/x" });
    request.headers.push(createKeyValue("X-Test", "1"));

    const copy = cloneRequest(request);

    expect(copy.id).not.toBe(request.id);
    expect(copy.name).toBe("Original copy");
    expect(copy.headers[0].id).not.toBe(request.headers[0].id);
    expect(copy.headers[0].key).toBe("X-Test");
  });

  it("clones a folder subtree with fresh ids", () => {
    const folder = createFolder("Parent");
    const child = createFolder("Child");
    child.requests.push(createRequest({ name: "Nested" }));
    folder.folders.push(child);

    const copy = cloneFolder(folder);

    expect(copy.id).not.toBe(folder.id);
    expect(copy.name).toBe("Parent copy");
    expect(copy.folders[0].id).not.toBe(child.id);
    expect(copy.folders[0].requests[0].id).not.toBe(child.requests[0].id);
    expect(copy.folders[0].requests[0].name).toBe("Nested");
  });

  it("removes a nested folder and reports subtree request counts", () => {
    const collection = createCollection("Test");
    const parent = createFolder("Parent");
    const child = createFolder("Child");
    child.requests.push(createRequest({ name: "A" }), createRequest({ name: "B" }));
    parent.requests.push(createRequest({ name: "C" }));
    parent.folders.push(child);
    collection.folders.push(parent);

    expect(countFolderRequests(parent)).toBe(3);

    const removed = removeFolder(collection, child.id);
    expect(removed?.id).toBe(child.id);
    expect(findFolder(collection, child.id)).toBeUndefined();
    expect(countFolderRequests(parent)).toBe(1);
  });

  it("builds an Apinizer JWT password-grant token request", () => {
    const request = createApinizerJwtRequest();

    expect(request.method).toBe("POST");
    expect(request.url).toBe("{{baseUrl}}/auth/jwt");
    expect(request.body.mode).toBe("form");
    expect(request.body.contentType).toBe("application/x-www-form-urlencoded");
    const formPairs = Object.fromEntries((request.body.form ?? []).map((f) => [f.key, f.value]));
    expect(formPairs.grant_type).toBe("password");
    expect(formPairs.username).toBe("{{username}}");
    expect(formPairs.password).toBe("{{password}}");
    expect(formPairs.client_id).toBe("{{clientId}}");
    expect(formPairs.client_secret).toBe("-");
    // The token endpoint itself needs no auth; credentials go in the body.
    expect(request.auth).toEqual({ type: "none" });
  });

  it("derives the Apinizer gateway origin from an API proxy URL", () => {
    expect(deriveApinizerBaseUrl("https://api.tarimorman.gov.tr/dats/cks"))
      .toBe("https://api.tarimorman.gov.tr");
    expect(deriveApinizerBaseUrl("{{scheme}}://{{host}}/dats/cks")).toBeUndefined();
    expect(deriveApinizerBaseUrl("not a URL")).toBeUndefined();
  });
});
