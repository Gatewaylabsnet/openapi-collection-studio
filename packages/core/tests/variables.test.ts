import { describe, expect, it } from "vitest";
import {
  createCollection,
  createEnvironment,
  createFolder,
  createKeyValue,
  createRequest,
  prepareHttpRequest,
  resolveVariablesInText
} from "../src";

describe("variable resolver", () => {
  it("resolves known variables and reports missing variables", () => {
    const result = resolveVariablesInText("{{baseUrl}}/users/{{id}}", {
      baseUrl: "https://api.example.com"
    });

    expect(result.value).toBe("https://api.example.com/users/{{id}}");
    expect(result.missing).toEqual(["id"]);
  });

  it("prepares HTTP requests with environment values", () => {
    const request = createRequest({ name: "Get user", url: "{{baseUrl}}/users/{id}" });
    request.pathParams = [createKeyValue("id", "42")];
    request.queryParams = [createKeyValue("expand", "posts")];
    request.auth = { type: "bearer", token: "{{accessToken}}" };

    const environment = createEnvironment("Local");
    environment.variables = [
      { id: "var_baseUrl", name: "baseUrl", value: "https://api.example.com", enabled: true },
      { id: "var_accessToken", name: "accessToken", value: "secret", enabled: true, secret: true }
    ];

    const prepared = prepareHttpRequest(request, environment);

    expect(prepared.url).toBe("https://api.example.com/users/42?expand=posts");
    expect(prepared.headers.Authorization).toBe("Bearer secret");
  });

  it("uses the collection base URL when no environment override exists", () => {
    const collection = createCollection("Orders API");
    collection.baseUrl = "https://collection.example.com";
    const request = createRequest({ name: "List orders", url: "{{baseUrl}}/orders" });

    const prepared = prepareHttpRequest(request, undefined, collection);

    expect(prepared.url).toBe("https://collection.example.com/orders");
  });

  it("lets the collection base URL override the environment base URL", () => {
    const collection = createCollection("Orders API");
    collection.baseUrl = "https://collection.example.com";
    const request = createRequest({ name: "List orders", url: "{{baseUrl}}/orders" });
    const environment = createEnvironment("Production");
    environment.variables = [
      { id: "var_baseUrl", name: "baseUrl", value: "https://prod.example.com", enabled: true }
    ];

    const prepared = prepareHttpRequest(request, environment, collection);

    expect(prepared.url).toBe("https://collection.example.com/orders");
  });

  it("does not let an empty environment base URL hide the collection base URL", () => {
    const collection = createCollection("Orders API");
    collection.baseUrl = "https://collection.example.com";
    const request = createRequest({ name: "List orders", url: "{{baseUrl}}/orders" });
    const environment = createEnvironment("Local");
    environment.variables = [{ id: "var_baseUrl", name: "baseUrl", value: "", enabled: true }];

    const prepared = prepareHttpRequest(request, environment, collection);

    expect(prepared.url).toBe("https://collection.example.com/orders");
  });

  it("uses the nearest folder base URL before collection and environment values", () => {
    const collection = createCollection("Proxy collection");
    collection.baseUrl = "https://collection.example.com/api";
    const parent = createFolder("Proxy A");
    parent.baseUrl = "https://proxy-a.example.com/service";
    const child = createFolder("Nested");
    child.baseUrl = "https://proxy-b.example.com/other";
    const request = createRequest({ name: "List", url: "{{baseUrl}}/items" });

    const prepared = prepareHttpRequest(request, undefined, collection, [parent, child]);

    expect(prepared.url).toBe("https://proxy-b.example.com/other/items");
  });

  it("inherits a parent folder base URL and resolves relative request URLs", () => {
    const collection = createCollection("Proxy collection");
    collection.baseUrl = "https://collection.example.com/api";
    const parent = createFolder("Proxy");
    parent.baseUrl = "https://proxy.example.com/service/v1";
    const child = createFolder("Nested");
    const request = createRequest({ name: "List", url: "/items" });

    const prepared = prepareHttpRequest(request, undefined, collection, [parent, child]);

    expect(prepared.url).toBe("https://proxy.example.com/service/v1/items");
  });

  it("keeps an absolute request URL independent from folder base URLs", () => {
    const folder = createFolder("Proxy");
    folder.baseUrl = "https://proxy.example.com/service";
    const request = createRequest({
      name: "Auth",
      url: "https://api.tarimorman.gov.tr/auth/jwt"
    });

    const prepared = prepareHttpRequest(request, undefined, undefined, [folder]);

    expect(prepared.url).toBe("https://api.tarimorman.gov.tr/auth/jwt");
  });
});
