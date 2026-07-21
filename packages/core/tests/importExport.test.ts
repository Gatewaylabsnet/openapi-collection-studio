import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createCollection,
  createFolder,
  createJwtRequest,
  createOAuthTokenRequest,
  createRequest,
  applySafeReimport,
  previewSafeReimport,
  collectCollectionSecretWarnings,
  exportCollectionToOpenApi,
  exportCollectionToHttpFile,
  exportCollectionToPostman,
  importApiDocument,
  serializeCollectionJson,
  parseCollectionJson
} from "../src";

const fixture = (path: string) =>
  readFileSync(join(process.cwd(), "fixtures", path), "utf8");

describe("OpenAPI and Swagger import/export", () => {
  it("provides portable OAuth token recipes", () => {
    const client = createOAuthTokenRequest("client_credentials");
    const password = createOAuthTokenRequest("password");

    expect(client.body.form?.map((field) => field.key)).toEqual([
      "grant_type", "client_id", "client_secret", "scope"
    ]);
    expect(password.body.form?.map((field) => field.key)).toContain("username");
    expect(password.url).toBe("{{baseUrl}}/oauth/token");
    expect(client.body.form?.find((field) => field.key === "scope")?.enabled).toBe(false);
  });

  it("exports portable Postman and HTTP representations", () => {
    const collection = createCollection("Portable");
    const request = createRequest({ name: "Create", method: "POST", url: "{{baseUrl}}/users" });
    request.body = { mode: "form", form: [{ id: "kv_1", key: "name", value: "Ada", enabled: true }] };
    collection.requests.push(request);

    const postman = JSON.parse(exportCollectionToPostman(collection));
    expect(postman.info.schema).toContain("v2.1.0");
    expect(postman.item[0].request.body.urlencoded[0]).toMatchObject({ key: "name", value: "Ada" });
    request.auth = { type: "basic", username: "ada", password: "secret" };
    const http = exportCollectionToHttpFile(collection);
    expect(http).toContain("POST {{baseUrl}}/users");
    expect(http).toContain("Authorization: Basic YWRhOnNlY3JldA==");
    expect(http.match(/Content-Type: application\/x-www-form-urlencoded/g)).toHaveLength(1);
  });

  it("safely reimports matching operations without deleting user data", () => {
    const target = createCollection("Existing");
    const existing = createRequest({ name: "Old list", method: "GET", url: "/users" });
    existing.openApi = { method: "get", path: "/users" };
    existing.auth = { type: "bearer", token: "{{token}}" };
    existing.responseExamples = [{ id: "response_1", name: "Saved", status: 200, headers: [], body: "{}" }];
    target.requests.push(existing);

    const incoming = createCollection("Imported");
    const updated = createRequest({ name: "List users", method: "GET", url: "/users" });
    updated.openApi = { method: "get", path: "/users" };
    const added = createRequest({ name: "Get user", method: "GET", url: "/users/{id}" });
    added.openApi = { method: "get", path: "/users/{id}" };
    incoming.requests.push(updated, added);

    expect(previewSafeReimport(target, incoming)).toEqual({ matched: 1, added: 1, retained: 0 });
    expect(applySafeReimport(target, incoming)).toEqual({ matched: 1, added: 1, retained: 0 });
    expect(target.requests).toHaveLength(2);
    expect(target.requests[0]).toMatchObject({ id: existing.id, name: "List users", auth: existing.auth });
    expect(target.requests[0].responseExamples).toEqual(existing.responseExamples);
  });

  it("imports OpenAPI operations grouped by tags", () => {
    const result = importApiDocument(fixture("openapi/openapi-with-tags.yaml"), {
      grouping: "tags"
    });

    expect(result.collection.name).toBe("Tagged API");
    expect(result.collection.folders.map((folder) => folder.name)).toEqual(["Users", "Auth"]);
    expect(result.collection.folders[1].requests[0].body.mode).toBe("json");
  });

  it("imports Swagger 2.0 operations", () => {
    const result = importApiDocument(fixture("swagger2/swagger2-simple.yaml"), {
      grouping: "firstPathSegment"
    });

    expect(result.collection.openApi?.sourceFormat).toBe("swagger2");
    expect(result.collection.folders[0].name).toBe("pets");
    expect(result.collection.folders[0].requests).toHaveLength(2);
  });

  it("imports OpenAPI bearer auth from a security scheme fixture", () => {
    const result = importApiDocument(fixture("openapi/openapi-with-bearer-auth.yaml"), {
      grouping: "tags"
    });
    const request = result.collection.folders[0].requests[0];

    expect(result.collection.openApi?.securitySchemes?.BearerAuth).toBeDefined();
    expect(request.auth).toEqual({ type: "bearer", token: "{{accessToken}}" });
  });

  it("exports an entire collection to OpenAPI JSON and YAML", () => {
    const result = importApiDocument(fixture("openapi/simple-openapi.yaml"), {
      grouping: "firstPathSegment"
    });

    const json = exportCollectionToOpenApi(result.collection, defaultExportOptions("json"));
    const yaml = exportCollectionToOpenApi(result.collection, defaultExportOptions("yaml"));

    expect(JSON.parse(json).openapi).toBe("3.0.3");
    expect(json).toContain("/users/{id}");
    expect(yaml).toContain("openapi: 3.0.3");
  });

  it("exports selected folders only", () => {
    const result = importApiDocument(fixture("openapi/openapi-with-tags.yaml"), {
      grouping: "tags"
    });
    const authFolder = result.collection.folders.find((folder) => folder.name === "Auth");
    const json = exportCollectionToOpenApi(result.collection, {
      ...defaultExportOptions("json"),
      folderIds: authFolder ? [authFolder.id] : []
    });
    const exported = JSON.parse(json);

    expect(exported.paths["/auth/token"]).toBeDefined();
    expect(exported.paths["/users"]).toBeUndefined();
  });

  it("exports selected folders with child folders recursively", () => {
    const collection = createCollection("Nested Export");
    const parent = createFolder("Parent");
    const child = createFolder("Child");
    child.requests.push(createRequest({ name: "Nested request", url: "{{baseUrl}}/nested" }));
    parent.folders.push(child);
    collection.folders.push(parent);

    const exported = JSON.parse(
      exportCollectionToOpenApi(collection, {
        ...defaultExportOptions("json"),
        folderIds: [parent.id]
      })
    );

    expect(exported.paths["/nested"].get.summary).toBe("Nested request");
    expect(exported.tags).toEqual([{ name: "Child" }]);
  });

  it("exports JWT bearer security", () => {
    const collection = createCollection("Manual Auth");
    const folder = createFolder("Auth");
    const request = createJwtRequest();
    request.auth = { type: "bearer", token: "{{accessToken}}" };
    folder.requests.push(request);
    collection.folders.push(folder);

    const exported = JSON.parse(
      exportCollectionToOpenApi(collection, defaultExportOptions("json"))
    );

    expect(exported.components.securitySchemes.BearerAuth.scheme).toBe("bearer");
    expect(exported.paths["/auth/token"].post.security).toEqual([{ BearerAuth: [] }]);
  });

  it("exports folder base URLs as operation-level servers", () => {
    const collection = createCollection("Multiple proxies");
    collection.baseUrl = "https://api.example.com/default";
    const folder = createFolder("Apinizer Auth");
    folder.baseUrl = "https://api.example.com";
    folder.requests.push(createRequest({ name: "Token", method: "POST", url: "{{baseUrl}}/auth/jwt" }));
    collection.folders.push(folder);

    const exported = JSON.parse(
      exportCollectionToOpenApi(collection, defaultExportOptions("json"))
    );

    expect(exported.servers).toEqual([{ url: "https://api.example.com/default" }]);
    expect(exported.paths["/auth/jwt"].post.servers).toEqual([
      { url: "https://api.example.com" }
    ]);
  });

  it("roundtrips app Collection JSON without data loss", () => {
    const result = importApiDocument(fixture("openapi/simple-openapi.yaml"), {
      grouping: "firstPathSegment"
    });
    result.collection.folders[0].baseUrl = "https://folder.example.com/proxy";
    const serialized = serializeCollectionJson(result.collection);
    const document = JSON.parse(serialized);
    const parsed = parseCollectionJson(serialized);

    expect(document.schema).toBe("specfold.collection.v1");
    expect(parsed).toEqual(result.collection);
  });

  it("imports legacy Collection JSON schema ids", () => {
    const collection = createCollection("Legacy Collection JSON");
    const serialized = JSON.stringify({
      schema: "openapi-collection-studio.collection.v1",
      exportedAt: new Date().toISOString(),
      collection
    });

    expect(parseCollectionJson(serialized)).toEqual(collection);
  });

  it("warns before native Collection JSON exposes literal request secrets", () => {
    const collection = createCollection("Sensitive collection");
    const request = createRequest({ name: "Get profile", url: "https://api.example.test/profile" });
    request.auth = { type: "bearer", token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature" };
    request.responseExamples.push({
      id: "response",
      name: "Token response",
      status: 200,
      headers: [],
      contentType: "application/json",
      body: '{"access_token":"very-secret-token-value-123456789"}'
    });
    collection.requests.push(request);

    const warnings = collectCollectionSecretWarnings(collection);

    expect(warnings.map((warning) => warning.message).join(" ")).toMatch(/bearer token/i);
    expect(warnings.map((warning) => warning.message).join(" ")).toMatch(/response example/i);
  });
});

function defaultExportOptions(format: "json" | "yaml") {
  return {
    format,
    useFolderNamesAsTags: true,
    includeRequestExamples: true,
    includeResponseExamples: true,
    includeBearerJwtSecurityScheme: true,
    includeAllComponents: true
  };
}
