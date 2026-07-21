import type { ApiRequest, AuthConfig, Collection, Folder, KeyValue } from "../../model/types";

export function exportCollectionToPostman(collection: Collection): string {
  return JSON.stringify({
    info: {
      _postman_id: collection.id,
      name: collection.name,
      description: collection.description,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    variable: collection.baseUrl ? [{ key: "baseUrl", value: collection.baseUrl, type: "string" }] : [],
    item: [
      ...collection.requests.map(requestToPostmanItem),
      ...collection.folders.map(folderToPostmanItem)
    ]
  }, null, 2);
}

function folderToPostmanItem(folder: Folder): Record<string, unknown> {
  return {
    name: folder.name,
    description: folder.description,
    item: [...folder.requests.map(requestToPostmanItem), ...folder.folders.map(folderToPostmanItem)]
  };
}

function requestToPostmanItem(request: ApiRequest): Record<string, unknown> {
  return {
    name: request.name,
    request: {
      method: request.method,
      header: toPostmanHeaders(request.headers),
      body: requestBody(request),
      auth: authToPostman(request.auth),
      url: { raw: request.url }
    }
  };
}

function toPostmanHeaders(values: KeyValue[]) {
  return values.filter((item) => item.enabled && item.key).map((item) => ({ key: item.key, value: item.value }));
}

function requestBody(request: ApiRequest): Record<string, unknown> | undefined {
  if (request.body.mode === "none") return undefined;
  if (request.body.mode === "form") {
    return {
      mode: "urlencoded",
      urlencoded: (request.body.form ?? []).filter((item) => item.enabled && item.key).map((item) => ({ key: item.key, value: item.value, type: "text" }))
    };
  }
  if (request.body.mode === "multipart") {
    return {
      mode: "formdata",
      formdata: (request.body.multipart ?? []).filter((item) => item.enabled && item.key).map((item) => ({
        key: item.key,
        value: item.type === "file" ? item.fileName ?? "" : item.value,
        type: item.type === "file" ? "file" : "text"
      }))
    };
  }
  return { mode: "raw", raw: request.body.raw ?? "", options: { raw: { language: request.body.mode === "json" ? "json" : "text" } } };
}

function authToPostman(auth: AuthConfig): Record<string, unknown> | undefined {
  if (auth.type === "none") return undefined;
  if (auth.type === "bearer") return { type: "bearer", bearer: [{ key: "token", value: auth.token, type: "string" }] };
  if (auth.type === "basic") return { type: "basic", basic: [{ key: "username", value: auth.username, type: "string" }, { key: "password", value: auth.password, type: "string" }] };
  return { type: "apikey", apikey: [{ key: "key", value: auth.key, type: "string" }, { key: "value", value: auth.value, type: "string" }, { key: "in", value: auth.in, type: "string" }] };
}
