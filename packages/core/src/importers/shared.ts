import { parse as parseYaml } from "yaml";
import { createId, createKeyValue } from "../model/factory";
import type { ApiDocumentKind, ParsedApiDocument, SourceTextFormat } from "./types";
import type { AuthConfig, KeyValue, ResponseExample } from "../model/types";

export type AnyRecord = Record<string, unknown>;

export const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head"
] as const;

export type LowerHttpMethod = (typeof HTTP_METHODS)[number];

export function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): AnyRecord {
  return isRecord(value) ? value : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asStringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

export function getRecord(parent: AnyRecord, key: string): AnyRecord {
  return asRecord(parent[key]);
}

export function parseApiText(text: string): ParsedApiDocument {
  const parseAttempts: Array<{ format: SourceTextFormat; parse: () => unknown }> = [
    { format: "json", parse: () => JSON.parse(text) },
    { format: "yaml", parse: () => parseYaml(text) }
  ];

  const errors: string[] = [];
  for (const attempt of parseAttempts) {
    try {
      const parsed = attempt.parse();
      if (!isRecord(parsed)) {
        throw new Error("Document root must be an object.");
      }
      const kind = detectApiKind(parsed);
      const info = asRecord(parsed.info);
      return {
        format: attempt.format,
        kind,
        version:
          kind === "openapi3"
            ? String(parsed.openapi)
            : String(parsed.swagger),
        title: asString(info.title),
        document: parsed
      };
    } catch (error) {
      errors.push(`${attempt.format}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Could not parse OpenAPI/Swagger text. ${errors.join(" | ")}`);
}

export function detectApiKind(document: AnyRecord): ApiDocumentKind {
  const openapi = asString(document.openapi);
  if (openapi && openapi.startsWith("3.")) {
    return "openapi3";
  }

  const swagger = asString(document.swagger);
  if (swagger === "2.0") {
    return "swagger2";
  }

  throw new Error("Document must be OpenAPI 3.x or Swagger 2.0.");
}

export function countOperations(document: AnyRecord): { pathCount: number; operationCount: number } {
  const paths = getRecord(document, "paths");
  let operationCount = 0;
  for (const pathItem of Object.values(paths)) {
    const pathRecord = asRecord(pathItem);
    for (const method of HTTP_METHODS) {
      if (isRecord(pathRecord[method])) {
        operationCount += 1;
      }
    }
  }
  return {
    pathCount: Object.keys(paths).length,
    operationCount
  };
}

export function resolveLocalRef<T = unknown>(document: AnyRecord, value: T): T {
  if (!isRecord(value) || typeof value.$ref !== "string") {
    return value;
  }

  const ref = value.$ref;
  if (!ref.startsWith("#/")) {
    return value;
  }

  const segments = ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));

  // Reject segments that would walk into the prototype chain. A crafted
  // document ("$ref": "#/__proto__/...") must never reach Object.prototype.
  if (segments.some((segment) => segment === "__proto__" || segment === "prototype" || segment === "constructor")) {
    return value;
  }

  let current: unknown = document;
  for (const segment of segments) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return value;
    }
    current = current[segment];
  }

  return (current ?? value) as T;
}

export function valueFromExample(schemaLike: AnyRecord): string {
  if ("example" in schemaLike) {
    return stringifyPrimitive(schemaLike.example);
  }
  if ("default" in schemaLike) {
    return stringifyPrimitive(schemaLike.default);
  }
  return "";
}

export function stringifyPrimitive(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function schemaToExample(schemaInput: unknown): unknown {
  const schema = asRecord(schemaInput);
  if ("example" in schema) {
    return schema.example;
  }
  if ("default" in schema) {
    return schema.default;
  }

  const type = asString(schema.type);
  if (type === "array") {
    return [schemaToExample(schema.items)];
  }
  if (type === "boolean") {
    return true;
  }
  if (type === "integer" || type === "number") {
    return 0;
  }
  if (type === "string") {
    const format = asString(schema.format);
    if (format === "date-time") {
      return "2026-01-01T00:00:00.000Z";
    }
    if (format === "date") {
      return "2026-01-01";
    }
    return "string";
  }

  const properties = asRecord(schema.properties);
  if (Object.keys(properties).length > 0 || type === "object") {
    const example: Record<string, unknown> = {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      example[key] = schemaToExample(propertySchema);
    }
    return example;
  }

  return {};
}

export function selectJsonLikeContent(contentInput: unknown): { contentType?: string; media: AnyRecord } {
  const content = asRecord(contentInput);
  const preferred =
    content["application/json"] ??
    content["application/*+json"] ??
    content["text/json"];

  if (isRecord(preferred)) {
    const contentType = Object.keys(content).find((key) => content[key] === preferred);
    return { contentType, media: preferred };
  }

  const firstEntry = Object.entries(content).find(([, value]) => isRecord(value));
  return {
    contentType: firstEntry?.[0],
    media: asRecord(firstEntry?.[1])
  };
}

export function exampleFromMedia(media: AnyRecord): unknown {
  if ("example" in media) {
    return media.example;
  }

  const examples = asRecord(media.examples);
  for (const example of Object.values(examples)) {
    const exampleRecord = asRecord(example);
    if ("value" in exampleRecord) {
      return exampleRecord.value;
    }
  }

  return schemaToExample(media.schema);
}

export function createResponseExample(
  name: string,
  status: number,
  contentType: string | undefined,
  bodyValue: unknown
): ResponseExample {
  return {
    id: createId("res"),
    name,
    status,
    headers: contentType ? [createKeyValue("Content-Type", contentType)] : [],
    contentType,
    body:
      typeof bodyValue === "string"
        ? bodyValue
        : JSON.stringify(bodyValue ?? {}, null, 2)
  };
}

export function collectSecuritySchemes(document: AnyRecord): AnyRecord {
  const components = getRecord(document, "components");
  const openApiSchemes = getRecord(components, "securitySchemes");
  if (Object.keys(openApiSchemes).length > 0) {
    return openApiSchemes;
  }
  return getRecord(document, "securityDefinitions");
}

export function authFromSecurity(
  securityInput: unknown,
  fallbackSecurityInput: unknown,
  securitySchemes: AnyRecord
): AuthConfig {
  const security = asArray(securityInput).length > 0 ? securityInput : fallbackSecurityInput;
  const requirements = asArray(security);
  for (const requirement of requirements) {
    const requirementRecord = asRecord(requirement);
    for (const schemeName of Object.keys(requirementRecord)) {
      const scheme = asRecord(securitySchemes[schemeName]);
      const type = asString(scheme.type);
      const schemeValue = asString(scheme.scheme)?.toLowerCase();
      if (type === "http" && schemeValue === "bearer") {
        return { type: "bearer", token: "{{accessToken}}" };
      }
      if (type === "http" && schemeValue === "basic") {
        return { type: "basic", username: "{{username}}", password: "{{password}}" };
      }
      if (type === "apiKey") {
        const location = asString(scheme.in) === "query" ? "query" : "header";
        const key = asString(scheme.name) ?? schemeName;
        return { type: "apiKey", in: location, key, value: `{{${key}}}` };
      }
      if (type === "basic") {
        return { type: "basic", username: "{{username}}", password: "{{password}}" };
      }
    }
  }
  return { type: "none" };
}

export function parameterToKeyValue(parameter: AnyRecord, fallbackValue = ""): KeyValue {
  const schema = asRecord(parameter.schema);
  const value = valueFromExample(parameter) || valueFromExample(schema) || fallbackValue;
  return createKeyValue(
    asString(parameter.name) ?? "",
    value,
    asString(parameter.description)
  );
}

export function firstPathSegment(path: string): string {
  return path.split("/").filter(Boolean)[0] ?? "Root";
}

