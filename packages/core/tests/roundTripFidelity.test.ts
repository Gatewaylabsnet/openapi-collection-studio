import { describe, expect, it } from "vitest";
import {
  checkOpenApiDocument,
  createKeyValue,
  exportCollectionToOpenApiResult,
  importApiDocument,
  type Collection
} from "../src";

const SOURCE_DOCUMENT = {
  openapi: "3.0.3",
  info: { title: "Fidelity API", version: "2.1.0" },
  servers: [{ url: "https://api.example.com/v2" }],
  components: {
    securitySchemes: {
      OAuth2: {
        type: "oauth2",
        flows: {
          clientCredentials: {
            tokenUrl: "https://auth.example.com/token",
            scopes: { "users:read": "Read users" }
          }
        }
      }
    },
    schemas: {
      User: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", format: "uuid" },
          role: { type: "string", enum: ["admin", "member"] }
        }
      },
      Orphan: { type: "object" }
    }
  },
  paths: {
    "/users": {
      get: {
        operationId: "listUsers",
        summary: "List users",
        deprecated: true,
        tags: ["Users"],
        security: [{ OAuth2: ["users:read"] }],
        parameters: [
          {
            name: "status",
            in: "query",
            description: "Filter by status",
            schema: { type: "string", enum: ["active", "disabled"], default: "active" }
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", format: "int32", minimum: 1, maximum: 100 }
          }
        ],
        responses: {
          "200": {
            description: "A list of users",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/User" } }
              }
            }
          }
        }
      }
    }
  }
};

const exportOptions = {
  format: "json" as const,
  useFolderNamesAsTags: false,
  includeRequestExamples: false,
  includeResponseExamples: true,
  includeBearerJwtSecurityScheme: true,
  includeAllComponents: true,
  pruneUnusedComponents: true
};

function importFixture(): Collection {
  return importApiDocument(JSON.stringify(SOURCE_DOCUMENT), { grouping: "tags" }).collection;
}

function exportedOperation(collection: Collection) {
  const result = exportCollectionToOpenApiResult(collection, exportOptions);
  const document = JSON.parse(result.content);
  return { document, operation: document.paths["/users"].get, result };
}

describe("round-trip fidelity (import → export)", () => {
  it("preserves parameter schemas, response schemas, security scopes, and deprecated", () => {
    const { document, operation } = exportedOperation(importFixture());

    const status = operation.parameters.find((p: { name: string }) => p.name === "status");
    expect(status.schema.enum).toEqual(["active", "disabled"]);
    expect(status.schema.default).toBe("active");

    const limit = operation.parameters.find((p: { name: string }) => p.name === "limit");
    expect(limit.schema.format).toBe("int32");
    expect(limit.schema.maximum).toBe(100);

    expect(operation.deprecated).toBe(true);
    expect(operation.security).toEqual([{ OAuth2: ["users:read"] }]);
    expect(document.components.securitySchemes.OAuth2.flows.clientCredentials.scopes).toEqual({
      "users:read": "Read users"
    });

    expect(operation.responses["200"].content["application/json"].schema.items.$ref).toBe(
      "#/components/schemas/User"
    );
    // The referenced schema survives pruning; the orphan does not.
    expect(document.components.schemas.User.properties.role.enum).toEqual(["admin", "member"]);
    expect(document.components.schemas.Orphan).toBeUndefined();
  });

  it("produces a structurally valid document", () => {
    const { document } = exportedOperation(importFixture());
    const check = checkOpenApiDocument(document);
    expect(check.issues).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it("overlays user edits (rename, delete param, add header) onto the source operation", () => {
    const collection = importFixture();
    const request = collection.folders[0].requests[0];
    request.name = "List all users (renamed)";
    // Delete the "limit" query param, keep "status".
    request.queryParams = request.queryParams.filter((param) => param.key !== "limit");
    // Add a manual header.
    request.headers.push(createKeyValue("X-Trace-Id", ""));

    const { operation } = exportedOperation(collection);

    expect(operation.summary).toBe("List all users (renamed)");
    expect(operation.parameters.some((p: { name: string }) => p.name === "limit")).toBe(false);
    // Untouched original keeps its schema.
    const status = operation.parameters.find((p: { name: string }) => p.name === "status");
    expect(status.schema.enum).toEqual(["active", "disabled"]);
    // The new header is synthesized.
    const trace = operation.parameters.find((p: { name: string }) => p.name === "X-Trace-Id");
    expect(trace.in).toBe("header");
  });

  it("falls back to synthesized output when preferSourceOperation is false", () => {
    const { operation } = (() => {
      const collection = importFixture();
      const result = exportCollectionToOpenApiResult(collection, {
        ...exportOptions,
        preferSourceOperation: false
      });
      const document = JSON.parse(result.content);
      return { operation: document.paths["/users"].get };
    })();

    const status = operation.parameters.find((p: { name: string }) => p.name === "status");
    expect(status.schema.enum).toBeUndefined();
    expect(operation.deprecated).toBeUndefined();
  });
});
