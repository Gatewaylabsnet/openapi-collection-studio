# OpenAPI Collection Studio

Local-first Windows desktop tool to **import OpenAPI/Swagger, organize requests into collections/folders, add manual requests (e.g. a JWT token request), test them, and export selected folders back to OpenAPI YAML/JSON**.

It is not a full Postman replacement. The core value is a tight loop:

```
Paste OpenAPI/Swagger  →  Import into collection/folder/request tree
      →  Add manual requests (JWT token, etc.)
      →  Edit & test requests
      →  Export a selected folder or the whole collection as OpenAPI YAML/JSON
```

Everything runs locally. No account, no cloud sync, no team workspace.

## Features

- Paste-import OpenAPI 3.x, Swagger 2.0, or the app's own Collection JSON.
- Auto-group imported endpoints by tag, first path segment, or a single folder.
- Collection / folder / request tree with a Postman-style editor.
- Query params, path params, headers, body, and auth (bearer / basic / API key).
- Environments with `{{baseUrl}}`, `{{accessToken}}`-style variables (multi-level: a variable value may reference another variable).
- Manual JWT token request template.
- **Save a response field straight into an environment variable** (e.g. `access_token` → `{{accessToken}}`) without any scripting.
- Send requests and view status, timing, size, headers, and body.
- Export a selected folder or the whole collection to OpenAPI YAML/JSON, or the app's Collection JSON.
- Portable Windows build.

## Security & data-safety notes

This app handles API definitions and credentials, and its exports are meant to be shared. Recent hardening:

- **No silent data loss.** The workspace is written atomically (temp file + rename), rotating backups are kept in a `backups` folder under the app's user-data directory, and a workspace file that cannot be read or parsed is *quarantined* (renamed to `workspace.corrupt-<timestamp>.json`) rather than overwritten.
- **Secrets encrypted at rest.** Environment variables marked *secret* are encrypted with the OS keychain (Electron `safeStorage`, DPAPI on Windows) before being written to disk. If encryption is unavailable on the platform, secret values are not persisted in plaintext — they load back empty.
- **Leak-aware export.** Parameter/header values are **not** emitted as OpenAPI examples unless you explicitly opt in. When you do, the export screen scans for literal values that look like secrets (tokens, API keys, JWTs, `password`-style fields) and warns before you send the file to anyone.
- **Folder-scoped exports stay lean.** Unused component schemas are pruned by default, so exporting one folder does not ship the entire API's data models.
- **Valid OpenAPI output.** Server URLs containing `{{variables}}` are omitted (a `{{baseUrl}}` server is invalid OpenAPI), the source `3.0.x`/`3.1.x` version is preserved, and duplicate `method + path` operations produce a visible warning instead of silently dropping requests.
- **Safer HTTP.** Requests have a configurable timeout, are aborted when they exceed it, and response bodies are capped at a configurable size to avoid out-of-memory on huge/streaming responses. An opt-in "allow insecure TLS" setting supports internal CAs / self-signed gateways (off by default, with a warning).
- **Hardened import.** `$ref` resolution refuses to walk into the prototype chain (`__proto__`/`constructor`/`prototype`).
- **Confirmations** guard destructive actions (new workspace, delete environment), and a single-instance lock prevents two windows from clobbering the same workspace file.

### Known limitations / follow-ups

- Renderer `sandbox` is left off because the preload ships as an ESM module (Electron only loads sandboxed preloads as CommonJS). `contextIsolation` is on and `nodeIntegration` is off; a production Content-Security-Policy is applied.
- HTTP proxy support and full round-trip fidelity for parameter schemas (enum/format/pattern) are not yet implemented — see `docs/REDTEAM_REPORT.md`.
- The portable build is not code-signed yet.

## Project layout

```
apps/desktop      Electron app (main / preload / React renderer)
packages/core     Import/export, HTTP prep, variable resolution, model (framework-agnostic, unit-tested)
docs/             Product spec, architecture, import/export rules, red-team report
```

## Development

Requires Node.js >= 20 and npm >= 10.

```bash
npm install
npm run dev            # launch the Electron app in dev mode
npm run typecheck      # type-check all workspaces
npm test               # run unit tests (packages/core)
```

## Build

```bash
npm run package:win:portable     # portable .exe
npm run package:win:installer    # NSIS installer
```

Artifacts are written to `apps/desktop/dist`.

## Security review

See [`docs/REDTEAM_REPORT.md`](docs/REDTEAM_REPORT.md) for the threat model, findings, and the prioritized action list this hardening pass is based on.
