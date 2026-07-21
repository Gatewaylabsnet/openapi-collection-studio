# Specfold v1.3.1–v1.5 delivery plan

This document is the acceptance checklist for the current work. Version numbers are release targets; no package is published until its release gate passes.

## v1.3.1 — correctness and secret safety

### Scope

- Preserve `application/x-www-form-urlencoded` fields in copied cURL commands.
- Respect the export example toggle for OpenAPI response examples.
- Warn before native Collection JSON, OpenAPI, Postman, or HTTP exports include likely secrets.
- Encrypt literal request credentials, sensitive values, and saved response examples at rest. If secure storage is unavailable, do not persist those values.

### Success criteria

- A form request copied as cURL includes every enabled form field.
- Export warnings cover request auth, bodies, parameters, headers, and response examples.
- Storage tests prove literal secrets are absent from the persisted workspace and reappear only after safe decryption.
- Typecheck, all tests, and production build pass.

## v1.4.0 — clarity and everyday request work

### Scope

- System, Light, and Dark themes with a persisted preference and semantic colour tokens.
- Import Doctor: Preview reports non-destructive importer warnings before Import changes the workspace.
- Route inspector: show the resolved request URL and missing variables before Send.
- Response tools: copy the currently viewed body/header/raw content; save a response as an example after a secret confirmation.

### Success criteria

- A previous settings file without a theme opens as System; light and dark palette changes apply to the renderer and Electron window.
- Preview never writes a collection; its warnings are visible, scrollable, and remain available until input changes.
- The URL inspector honours folder, collection, environment, path parameter, and query parameter resolution and identifies missing variables.
- Saved examples retain status, headers, content type, and body; potential secrets require confirmation.
- Keyboard navigation and focus styles remain visible in both palettes.

## v1.5.0 — portability and safe repeat imports

### Scope

- Safe re-import into a selected collection, with a diff before applying.
- Postman Collection v2.1 and `.http` exports.
- Reusable generic OAuth token recipes (client credentials and password grant) in addition to the existing Apinizer recipe.
- Named environment profiles presented as connection profiles: base URL and variables move together when selected.

### Success criteria

- Re-import reports matched, added, and retained requests; it never deletes an existing request automatically.
- Matching requests retain their ID, custom auth, body, and saved examples; newly imported requests retain their folder path.
- Postman output has the v2.1 schema marker and imports into Postman; `.http` output includes method, URL, headers, and supported body modes.
- OAuth recipes use only environment variables and work with the existing response-to-variable workflow.
- Switching a named connection profile changes only the active environment, not collection or folder routing rules.

## Release gate for every version

- Update root, desktop, core, and lockfile versions together.
- Add release notes and update README, architecture/import rules, UI/product specs, and roadmap.
- Run `npm run release:check` (source-size gate, typecheck, tests, and production build) on the final commit.
- Verify desktop packages and checksum manifest before tagging; publish only user-facing assets.
- Smoke-test import, tree navigation, request sending, base-URL precedence, backup/restore, export, and deletion with a secret-free workspace.

## Explicitly deferred

Per-profile HTTP/SOCKS proxy, custom CA, client certificates, OAuth browser login, cloud sync, scripts, and multi-protocol testing remain out of this three-version release train. They enlarge the security and support surface and need a separate design and test plan.
