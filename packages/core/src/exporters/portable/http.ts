import { flattenRequests } from "../../model/traversal";
import type { ApiRequest, Collection } from "../../model/types";

export function exportCollectionToHttpFile(collection: Collection): string {
  return flattenRequests(collection)
    .map(({ request, folderPath }) => requestToHttp(request, folderPath.map((folder) => folder.name)))
    .join("\n\n###\n\n");
}

function requestToHttp(request: ApiRequest, path: string[]): string {
  const lines = [`# ${[...path, request.name].join(" / ")}`, `${request.method} ${urlWithApiKey(request)}`];
  for (const header of request.headers) {
    if (header.enabled && header.key) lines.push(`${header.key}: ${header.value}`);
  }
  if (request.auth.type === "bearer" && request.auth.token && !hasHeader(request, "authorization")) {
    lines.push(`Authorization: Bearer ${request.auth.token}`);
  }
  if (request.auth.type === "basic" && !hasHeader(request, "authorization")) {
    lines.push(`Authorization: Basic ${encodeBasic(`${request.auth.username}:${request.auth.password}`)}`);
  }
  if (request.auth.type === "apiKey" && request.auth.in === "header" && !hasHeader(request, request.auth.key)) {
    lines.push(`${request.auth.key}: ${request.auth.value}`);
  }
  if (request.body.mode === "form") {
    if (!hasHeader(request, "content-type")) lines.push("Content-Type: application/x-www-form-urlencoded");
    lines.push("", (request.body.form ?? []).filter((item) => item.enabled && item.key).map((item) => `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value)}`).join("&"));
  } else if (request.body.mode === "json" || request.body.mode === "raw") {
    lines.push("", request.body.raw ?? "");
  }
  return lines.join("\n");
}

function hasHeader(request: ApiRequest, name: string): boolean {
  return request.headers.some((header) => header.enabled && header.key.toLowerCase() === name.toLowerCase());
}

function urlWithApiKey(request: ApiRequest): string {
  if (request.auth.type !== "apiKey" || request.auth.in !== "query" || !request.auth.key) return request.url;
  const separator = request.url.includes("?") ? "&" : "?";
  return `${request.url}${separator}${encodeURIComponent(request.auth.key)}=${encodeURIComponent(request.auth.value)}`;
}

function encodeBasic(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
