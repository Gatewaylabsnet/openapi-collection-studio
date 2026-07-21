# Product Spec

## Goal

Specfold is a simple, local-first desktop REST API collection studio for developers who want to turn common API interchange formats into an editable, account-free request workspace.

## Core Jobs

- Import OpenAPI, Swagger, Postman, Insomnia, HAR, HTTP files, Specfold JSON, and cURL.
- Preview and select operations before import without executing embedded scripts.
- Create and organize collections, nested folders, requests, and JWT/OAuth token recipes.
- Manage renameable connection profiles (environments) and resolve `{{variableName}}` values with folder, collection, and environment base URL precedence.
- Isolate multiple API proxies inside one collection and create Apinizer JWT authentication with an automatically derived gateway origin.
- Send requests outside browser CORS restrictions, inspect resolved routes/missing variables, and capture responses.
- Test multipart form-data services with text fields, repeated names, and explicitly selected local files.
- Export selected content to OpenAPI or complete collections to native JSON, Postman v2.1, or `.http`, with secret warnings.
- Re-import into an existing collection only through an explicit, non-destructive diff/merge.
- OAuth recipes start with only required fields enabled; optional scope can be enabled when the provider requires it.
- Export, validate, and restore a complete local backup; delete every local Specfold data file with strong confirmation.

## Product Principles

- Simple defaults: the first launch creates one active `Specfold` environment.
- Local by default: no account, cloud workspace, telemetry, or hosted sync.
- Portable but explicit: broad import support, visible fidelity warnings, no script execution.
- Safe persistence: atomic writes, encryption at rest, restore rollback, and no plaintext fallback for secrets.
- Explicit file access: imported documents can describe file fields but can never make Specfold read a local path; every upload file requires a native picker grant for the current session.
- Progressive disclosure: Import Doctor, route resolution, and response tools surface the next action without adding a scripting language or cloud workflow.

## Non-Goals For v1.5

- Auto-update.
- Windows code signing or Apple signing/notarization.
- Cloud sync, collaboration, accounts, or remote `$ref` fetching.
- Postman/Insomnia script execution or automatic file upload restoration.
- Per-profile HTTP/SOCKS proxy configuration, custom CA/client certificates, and OAuth browser login.

## Success Gate

Typecheck, unit/renderer tests, production build, tagless multi-platform package verification, checksums, light/dark layout review, and packaged smoke tests must pass before each draft release is published.
