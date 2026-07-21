# Roadmap

## v1.0 (Released)

- Local OpenAPI/Swagger collection editing, environments, request sending, cURL, OpenAPI/Collection export, encrypted secrets, hardened Electron shell, and Windows/macOS/Linux packages.
- `v1.0.3` remains available for users who need the previous stable release.

## v1.1.0

- Postman Collection v2.0/v2.1, Postman v3 folders, Insomnia v4/v5, HAR 1.2, and `.http`/`.rest` imports.
- Operation selection, folder traversal limits, script/symlink skipping, and portable-format warnings.
- Default renameable `Specfold` environment and final-environment protection.
- Complete backup export, 100 MB validated restore, pre-restore safety copy, atomic rollback, and full local deletion.
- No plaintext secret persistence when secure storage is unavailable.
- Production modules below 500 lines with shared IPC contracts and format-specific import/export modules.
- React Testing Library coverage and tagless release-package verification with `SHA256SUMS.txt`.

## v1.3.1–v1.5 (In progress)

- Correctness and secret-safety hotfixes for cURL, native exports, response examples, and literal request credentials.
- System/Light/Dark appearance, Import Doctor, route inspection, response copy/save-example tools, and named connection profiles.
- Safe re-import diffs, Postman v2.1 and `.http` export, plus portable OAuth token recipes.

Acceptance criteria and release gates: [v1.3.1–v1.5 delivery plan](V1_3_TO_V1_5_DELIVERY_PLAN.md).

## Later

- Windows code signing.
- Apple signing and notarization.
- Auto-update after signed release infrastructure exists.
- Authenticated/SOCKS proxy UI.
- Worker-thread parsing for very large documents.
- Broader packaged-app automation on physical platform runners.
