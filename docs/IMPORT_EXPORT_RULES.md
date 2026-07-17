# Import And Export Rules

## Supported Imports

| Format | Input | Preserved |
| --- | --- | --- |
| OpenAPI 3.0/3.1 | JSON or YAML | Paths, operations, parameters, bodies, responses, auth, components, servers |
| Swagger 2.0 | JSON or YAML | Paths, parameters, bodies, responses, security, host/basePath |
| Postman 2.0/2.1 | Collection JSON | Hierarchy, variables, auth, bodies, response examples |
| Postman 3 | Multi-file YAML folder | Definitions, hierarchy, requests, examples; scripts skipped |
| Insomnia 4/5 | Export JSON | Workspaces, folders, environments, auth, bodies, responses |
| HAR 1.2 | JSON | Requests, query/form values, headers, captured responses |
| HTTP files | `.http` / `.rest` | Variables, request lines, headers, inline bodies, named sections |
| Specfold | Collection JSON | Native collection model |
| cURL | Command text | Method, URL, headers, body, supported auth |

JSON detection runs before YAML/OpenAPI parsing. Unsupported JSON gets a format-specific message. Folder parent cycles are broken safely. Unknown HTTP methods, malformed entries, orphan examples, scripts, and file-backed bodies are skipped or warned about rather than executed.

Local `$ref` values are resolved where practical. Remote `$ref` values are retained but never fetched. Operations can be selected before import and grouped by tags, first path segment, or one folder.

## URL And Environment Rules

- Every workspace has at least one environment; the final environment cannot be deleted.
- New collections copy the active environment `baseUrl`.
- Base URL precedence during request preparation is: absolute request URL, nearest folder, collection, then active environment.
- Nested folders inherit the nearest configured folder base URL; relative request paths are joined to the effective value.
- Imported OpenAPI servers and portable variables populate the relevant collection/environment fields.

## OpenAPI Export

- Public functions `exportCollectionToOpenApi`, `exportCollectionToOpenApiResult`, and `exportCollectionToOpenApiDocument` remain stable.
- Imported OpenAPI 3 operations prefer source-operation fidelity and overlay editable fields.
- Selected folders export recursively; folder names can become tags.
- Folder base URLs are emitted as OpenAPI operation-level `servers` when they differ from the collection server.
- Parameters, request bodies, responses, and supported security schemes are mapped back to OpenAPI.
- Literal examples are opt-in and secret-like values produce warnings.
- Unused component schemas are pruned by default for scoped exports.
- Duplicate method/path mappings and invalid variable paths/servers produce visible warnings.

## Complete Backup

Backup is separate from collection/OpenAPI export. `specfold.backup.v1` contains workspace and settings, including readable secret values after an explicit warning. Restore accepts only that schema, caps input at 100 MB, validates structure, re-encrypts secrets before persistence, and rolls back on failure.
