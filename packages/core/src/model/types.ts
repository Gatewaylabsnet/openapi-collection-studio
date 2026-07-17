export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

export type BodyMode = "none" | "json" | "raw" | "form";

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export interface RequestBody {
  mode: BodyMode;
  contentType?: string;
  raw?: string;
  /** Field pairs for mode "form" (application/x-www-form-urlencoded). */
  form?: KeyValue[];
  json?: unknown;
  schema?: unknown;
}

export type AuthConfig =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "apiKey"; key: string; value: string; in: "header" | "query" };

export interface ResponseExample {
  id: string;
  name: string;
  status: number;
  headers: KeyValue[];
  body?: string;
  contentType?: string;
}

export interface OpenApiMetadata {
  sourceFormat?:
    | "openapi3"
    | "swagger2"
    | "collection-json"
    | "postman"
    | "insomnia"
    | "har"
    | "http-file";
  documentVersion?: string;
  title?: string;
  version?: string;
  servers?: string[];
  basePath?: string;
  path?: string;
  method?: string;
  operationId?: string;
  tags?: string[];
  components?: Record<string, unknown>;
  securitySchemes?: Record<string, unknown>;
  rawOperation?: unknown;
}

export interface ApiRequest {
  id: string;
  name: string;
  description?: string;
  method: HttpMethod;
  url: string;
  queryParams: KeyValue[];
  pathParams: KeyValue[];
  headers: KeyValue[];
  body: RequestBody;
  auth: AuthConfig;
  responseExamples: ResponseExample[];
  openApi?: OpenApiMetadata;
}

export interface Folder {
  id: string;
  name: string;
  /** Overrides the collection/environment base URL for requests in this subtree. */
  baseUrl?: string;
  description?: string;
  folders: Folder[];
  requests: ApiRequest[];
  openApi?: OpenApiMetadata;
}

export interface Collection {
  id: string;
  name: string;
  version?: string;
  baseUrl?: string;
  description?: string;
  folders: Folder[];
  requests: ApiRequest[];
  openApi?: OpenApiMetadata;
}

export interface EnvironmentVariable {
  id: string;
  name: string;
  value: string;
  enabled: boolean;
  secret?: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
}

export interface Workspace {
  id: string;
  schemaVersion: 1;
  name: string;
  collections: Collection[];
  environments: Environment[];
  activeEnvironmentId?: string;
  updatedAt: string;
}

export type GroupingStrategy = "tags" | "firstPathSegment" | "singleFolder";
