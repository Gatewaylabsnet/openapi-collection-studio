import { describe, expect, it } from "vitest";
import {
  createCollection,
  createFolder,
  createKeyValue,
  createRequest,
  exportCollectionToOpenApiResult,
  prepareHttpRequest,
  resolveVariablesInText,
  type ApiRequest,
  type Collection
} from "../src";
import { resolveLocalRef } from "../src/importers/shared";

function collectionWith(request: ApiRequest): Collection {
  const collection = createCollection("Test");
  const folder = createFolder("Main");
  folder.requests.push(request);
  collection.folders.push(folder);
  return collection;
}

const baseOptions = {
  format: "json" as const,
  useFolderNamesAsTags: true,
  includeResponseExamples: true,
  includeBearerJwtSecurityScheme: true,
  includeAllComponents: true
};

describe("export hardening", () => {
  it("warns and keeps the last request when two map to the same method+path", () => {
    const collection = createCollection("Dupes");
    const folder = createFolder("Auth");
    const first = createRequest({ name: "Token A", method: "POST", url: "{{baseUrl}}/auth/token" });
    const second = createRequest({ name: "Token B", method: "POST", url: "{{baseUrl}}/auth/token" });
    folder.requests.push(first, second);
    collection.folders.push(folder);

    const result = exportCollectionToOpenApiResult(collection, {
      ...baseOptions,
      includeRequestExamples: false
    });

    expect(result.warnings.some((warning) => warning.kind === "conflict")).toBe(true);
    const document = JSON.parse(result.content);
    expect(document.paths["/auth/token"].post.summary).toBe("Token B");
  });

  it("does not emit parameter values as examples unless explicitly enabled", () => {
    const request = createRequest({ name: "Get", method: "GET", url: "{{baseUrl}}/things" });
    request.headers.push(createKeyValue("X-Api-Key", "super-secret-token-value-1234567890"));

    const withoutExamples = JSON.parse(
      exportCollectionToOpenApiResult(collectionWith(request), {
        ...baseOptions,
        includeRequestExamples: false
      }).content
    );
    const headerParam = withoutExamples.paths["/things"].get.parameters.find(
      (parameter: { name: string }) => parameter.name === "X-Api-Key"
    );
    expect(headerParam.example).toBeUndefined();
  });

  it("flags a literal secret parameter value when examples are enabled", () => {
    const request = createRequest({ name: "Get", method: "GET", url: "{{baseUrl}}/things" });
    request.headers.push(createKeyValue("X-Api-Key", "AKIAIOSFODNN7EXAMPLEKEYVALUE1234"));

    const result = exportCollectionToOpenApiResult(collectionWith(request), {
      ...baseOptions,
      includeRequestExamples: true,
      includeParameterExamples: true
    });
    expect(result.warnings.some((warning) => warning.kind === "secret")).toBe(true);
  });

  it("does not flag {{variable}} placeholders as secrets", () => {
    const request = createRequest({ name: "Get", method: "GET", url: "{{baseUrl}}/things" });
    request.headers.push(createKeyValue("Authorization", "{{accessToken}}"));

    const result = exportCollectionToOpenApiResult(collectionWith(request), {
      ...baseOptions,
      includeRequestExamples: true,
      includeParameterExamples: true
    });
    expect(result.warnings.some((warning) => warning.kind === "secret")).toBe(false);
  });

  it("prunes component schemas that the exported paths do not reference", () => {
    const collection = collectionWith(
      createRequest({ name: "Get", method: "GET", url: "{{baseUrl}}/things" })
    );
    collection.openApi = {
      components: {
        schemas: {
          Used: { type: "object" },
          Orphan: { type: "object" }
        }
      }
    };
    const request = collection.folders[0].requests[0];
    request.body = { mode: "json", contentType: "application/json", raw: "{}", schema: { $ref: "#/components/schemas/Used" } };

    const document = JSON.parse(
      exportCollectionToOpenApiResult(collection, {
        ...baseOptions,
        includeRequestExamples: false,
        pruneUnusedComponents: true
      }).content
    );
    expect(document.components.schemas.Used).toBeDefined();
    expect(document.components.schemas.Orphan).toBeUndefined();
  });

  it("omits servers instead of emitting an invalid {{baseUrl}} placeholder", () => {
    const collection = collectionWith(
      createRequest({ name: "Get", method: "GET", url: "{{baseUrl}}/things" })
    );
    collection.openApi = { servers: ["{{baseUrl}}"] };

    const result = exportCollectionToOpenApiResult(collection, {
      ...baseOptions,
      includeRequestExamples: false
    });
    const document = JSON.parse(result.content);
    expect(document.servers).toBeUndefined();
    expect(result.warnings.some((warning) => warning.kind === "invalid-server")).toBe(true);
  });

  it("preserves a 3.1 source version instead of forcing 3.0.3", () => {
    const collection = collectionWith(
      createRequest({ name: "Get", method: "GET", url: "{{baseUrl}}/things" })
    );
    collection.openApi = { documentVersion: "3.1.0" };

    const document = JSON.parse(
      exportCollectionToOpenApiResult(collection, {
        ...baseOptions,
        includeRequestExamples: false
      }).content
    );
    expect(document.openapi).toBe("3.1.0");
  });
});

describe("variable resolution", () => {
  it("resolves a variable whose value references another variable", () => {
    const resolved = resolveVariablesInText("{{baseUrl}}/x", {
      baseUrl: "{{scheme}}://{{host}}",
      scheme: "https",
      host: "api.example.com"
    });
    expect(resolved.value).toBe("https://api.example.com/x");
    expect(resolved.missing).toHaveLength(0);
  });

  it("does not loop forever on a self-referential variable", () => {
    const resolved = resolveVariablesInText("{{a}}", { a: "{{a}}" });
    expect(resolved.value).toBe("{{a}}");
  });
});

describe("basic auth encoding", () => {
  it("encodes non-Latin1 credentials as UTF-8 base64", () => {
    const request = createRequest({ name: "Auth", method: "GET", url: "https://api.example.com/x" });
    request.auth = { type: "basic", username: "kullanıcı", password: "şifreğı" };
    const prepared = prepareHttpRequest(request);
    const decoded = Buffer.from(prepared.headers.Authorization.replace("Basic ", ""), "base64").toString(
      "utf8"
    );
    expect(decoded).toBe("kullanıcı:şifreğı");
  });
});

describe("reference resolution safety", () => {
  it("refuses to resolve refs that walk into the prototype chain", () => {
    const value = { $ref: "#/__proto__/polluted" };
    expect(resolveLocalRef({}, value)).toBe(value);
  });
});
