# UI Spec

## Application Shell

The top bar shows product identity, collection/environment counts, active connection profile, save state, transient notices, and a persistent security warning when secure storage is unavailable. The sidebar switches between Editor, Import, Environments, Export, and Settings. Settings exposes System, Light, and Dark appearance; focus states remain visible in every palette.

## Import

Users can open a supported file, select a Postman v3 folder, fetch an HTTP(S) URL, or paste a document/cURL command. Detected operations can be selected individually or by range before import. Grouping choices are tags, first path segment, and single folder. Preview and error messages identify the detected format. Import Doctor lists non-destructive importer warnings before Import. Users can create a new collection or choose a safe update destination; a preview reports matched, new, and retained requests.

## Editor

- Collection tree supports multiple expanded collections, search, inline rename, duplicate/delete, active collection color, and request/folder drag-and-drop.
- Request editor exposes method, URL, request name, destination folder, Params, Auth, Headers, and Body.
- Body modes are None, JSON, Text, Form data, and URL encoded. Form data uses accessible text/file rows with Choose, Replace, Clear, media-type, enabled, and remove controls; duplicate field names are allowed.
- File rows show a clear re-selection state after restart/import/restore, and the editor explains that Specfold generates the multipart boundary automatically.
- The request editor shows the resolved outgoing URL or the missing environment variable names before Send, and offers copy for the resolved URL.
- Response panel exposes body, headers, raw text, history, timing/size, response-to-environment assignment, copy for the visible representation, and security-confirmed Save example.
- Collection base URL remains editable with or without a selected request.
- Selecting a folder exposes its optional base URL, inherited parent/collection hint, and subtree override behavior.

## Environments

Every workspace starts with a renameable `Specfold` connection profile (environment). Users can add, select, rename, and remove profiles, but cannot delete the final one. A profile carries a base URL and variables; switching it never edits collection or folder overrides. Variables support enabled and secret flags.

## Export

Users choose OpenAPI YAML, OpenAPI JSON, Collection JSON, Postman v2.1, or `.http`; scope folders only for OpenAPI; configure OpenAPI examples/components/fidelity; inspect secret/structure warnings; preview/copy output; and save through a native dialog.

## Settings And Data Management

Export backup, Restore backup, and Delete all data are grouped together. Export warns that readable secrets are included. Restore confirms replacement and reports the local safety-copy path. Delete requires a warning plus exact `DELETE ALL` text. Request timeout, response cap, insecure TLS, workspace name, and new-workspace actions remain on the same screen.

## Responsive Gate

Desktop and narrow layouts must avoid horizontal viewport overflow. Release QA checks at least 1100x720, 1366x768, and 1920x1080, including long tree labels, Import, Settings, and response content.
Multipart rows switch to a stacked card layout instead of forcing horizontal viewport overflow.
