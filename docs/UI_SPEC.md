# UI Spec

## Application Shell

The top bar shows product identity, collection/environment counts, active environment, save state, transient notices, and a persistent security warning when secure storage is unavailable. The sidebar switches between Editor, Import, Environments, Export, and Settings.

## Import

Users can open a supported file, select a Postman v3 folder, fetch an HTTP(S) URL, or paste a document/cURL command. Detected operations can be selected individually or by range before import. Grouping choices are tags, first path segment, and single folder. Preview and error messages identify the detected format.

## Editor

- Collection tree supports multiple expanded collections, search, inline rename, duplicate/delete, active collection color, and request/folder drag-and-drop.
- Request editor exposes method, URL, request name, destination folder, Params, Auth, Headers, and Body.
- Response panel exposes body, headers, raw text, history, timing/size, and response-to-environment assignment.
- Collection base URL remains editable with or without a selected request.
- Selecting a folder exposes its optional base URL, inherited parent/collection hint, and subtree override behavior.

## Environments

Every workspace starts with a renameable `Specfold` environment. Users can add, select, rename, and remove environments, but cannot delete the final environment. Base URL can optionally be applied across collections. Variables support enabled and secret flags.

## Export

Users choose OpenAPI YAML, OpenAPI JSON, or Collection JSON; scope folders; configure examples/components/fidelity; inspect warnings and structural checks; preview output; and save through a native dialog.

## Settings And Data Management

Export backup, Restore backup, and Delete all data are grouped together. Export warns that readable secrets are included. Restore confirms replacement and reports the local safety-copy path. Delete requires a warning plus exact `DELETE ALL` text. Request timeout, response cap, insecure TLS, workspace name, and new-workspace actions remain on the same screen.

## Responsive Gate

Desktop and narrow layouts must avoid horizontal viewport overflow. Release QA checks at least 1100x720, 1366x768, and 1920x1080, including long tree labels, Import, Settings, and response content.
