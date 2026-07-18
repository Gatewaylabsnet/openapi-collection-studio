<p align="center">
  <a href="https://gatewaylabs.net/specfold">
    <img src="apps/desktop/build/logo.svg" width="96" height="96" alt="Specfold logo" />
  </a>
</p>

<h1 align="center">Specfold</h1>

<p align="center">
  A local-first desktop API collection studio for OpenAPI, Swagger, Postman, Insomnia, HAR, cURL, and gateway request workflows.
</p>

<p align="center">
  <a href="https://gatewaylabs.net/specfold">gatewaylabs.net/specfold</a>
  ·
  <a href="https://github.com/Gatewaylabsnet/specfold/releases/tag/v1.2.1">Download v1.2.1</a>
  ·
  <a href="docs/REDTEAM_REPORT.md">Security review</a>
</p>

<p align="center">
  <a href="https://github.com/Gatewaylabsnet/specfold/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/Gatewaylabsnet/specfold/actions/workflows/ci.yml/badge.svg" />
  </a>
  <a href="https://github.com/Gatewaylabsnet/specfold/actions/workflows/release.yml">
    <img alt="Release" src="https://github.com/Gatewaylabsnet/specfold/actions/workflows/release.yml/badge.svg" />
  </a>
  <a href="LICENSE">
    <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" />
  </a>
</p>

![Specfold desktop app showing the collection tree, collection base URL, request editor, and response panel](docs/assets/specfold-main.png)

Specfold helps developers turn API specifications into a practical request workspace:

```text
OpenAPI / Swagger / Postman / Insomnia / HAR / .http / cURL
        -> editable collections, folders, and requests
        -> local environments and collection-level base URLs
        -> request testing, response inspection, and variable capture
        -> OpenAPI YAML / JSON export
```

It is intentionally local-first. There is no account requirement, no cloud workspace, and no hosted sync layer. Your workspace, environments, request history, and secrets stay on the machine running the desktop app.

## Download v1.2.1

| Platform | Package | Download |
| --- | --- | --- |
| Windows x64 | Installer | [Specfold-1.2.1-x64.exe](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.2.1/Specfold-1.2.1-x64.exe) |
| Windows x64 | Portable app | [Specfold-1.2.1-x64-portable.exe](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.2.1/Specfold-1.2.1-x64-portable.exe) |
| macOS Apple Silicon | DMG | [Specfold-1.2.1-mac-arm64.dmg](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.2.1/Specfold-1.2.1-mac-arm64.dmg) |
| macOS Apple Silicon | ZIP | [Specfold-1.2.1-mac-arm64.zip](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.2.1/Specfold-1.2.1-mac-arm64.zip) |
| macOS Intel | DMG | [Specfold-1.2.1-mac-x64.dmg](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.2.1/Specfold-1.2.1-mac-x64.dmg) |
| macOS Intel | ZIP | [Specfold-1.2.1-mac-x64.zip](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.2.1/Specfold-1.2.1-mac-x64.zip) |
| Linux x64 | AppImage | [Specfold-1.2.1-linux-x86_64.AppImage](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.2.1/Specfold-1.2.1-linux-x86_64.AppImage) |
| Linux x64 | Debian package | [Specfold-1.2.1-linux-amd64.deb](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.2.1/Specfold-1.2.1-linux-amd64.deb) |
| All platforms | SHA-256 checksums | [SHA256SUMS.txt](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.2.1/SHA256SUMS.txt) |

Release page: [github.com/Gatewaylabsnet/specfold/releases/tag/v1.2.1](https://github.com/Gatewaylabsnet/specfold/releases/tag/v1.2.1). The previous [v1.2.0 release](https://github.com/Gatewaylabsnet/specfold/releases/tag/v1.2.0) remains available.

Verify a downloaded package against the published checksums:

```bash
sha256sum -c SHA256SUMS.txt --ignore-missing
```

On Windows PowerShell, compare `Get-FileHash .\Specfold-1.2.1-x64.exe -Algorithm SHA256` with the matching line in `SHA256SUMS.txt`.

Unsigned Windows builds may trigger SmartScreen. Unsigned and non-notarized macOS builds may require opening from Finder with **Open** to confirm the Gatekeeper prompt.

See the [Code signing policy](docs/CODE_SIGNING_POLICY.md) for signing scope,
approval roles, build provenance, privacy, and the current SignPath Foundation
application status. Release artifacts remain unsigned until that policy
explicitly states that signing is active.

## What It Does

- Imports OpenAPI 3.x, Swagger 2.0, Postman Collection v2.0/v2.1 JSON and v3 YAML folders, Insomnia JSON v4/v5, HAR 1.2, `.http`/`.rest`, Specfold Collection JSON, and `curl` commands.
- Preserves portable collection folders, environment variables, supported auth modes, request bodies, and response examples where the source format provides them.
- Lets you select exactly which operations to import before creating requests.
- Groups imported endpoints by tag, first path segment, or a single folder.
- Organizes APIs into collections, folders, and requests with search, rename, duplicate, delete, and drag-and-drop movement.
- Collapses collections and nested folders independently while keeping search matches visible without losing the previous expanded state.
- Shows only the selected routing scope for base URL editing, alongside the effective URL and its environment, collection, or folder source.
- Edits request method, URL, query params, path params, headers, body, and auth.
- Supports bearer token, basic auth, API key auth, and no-auth request modes.
- Sends HTTP requests from the desktop app and shows status, timing, size, headers, body, raw response, and per-request history.
- Copies any request as a `curl` command.
- Copies generated export content directly from the preview to the clipboard.
- Saves JSON response fields directly into environment variables.
- Exports a whole collection or selected folders back to OpenAPI YAML/JSON.
- Exports a complete local backup containing collections, environments, settings, and secrets after an explicit security warning.
- Permanently deletes all local content, settings, and rotating backups through a two-step confirmation.
- Runs an export structure check before saving generated OpenAPI.

## Supported Import Formats

| Format | Accepted input | Notes |
| --- | --- | --- |
| OpenAPI 3.0/3.1 | JSON, YAML | Local references and source-operation fidelity |
| Swagger 2.0 | JSON, YAML | Converted to the internal request model |
| Postman 2.0/2.1 | Collection JSON | Folders, variables, auth, bodies, examples |
| Postman 3 | Multi-file YAML folder | Scripts and symlinks are skipped |
| Insomnia 4/5 | Export JSON | Workspaces, folders, environments, responses |
| HAR 1.2 | JSON | Captured requests and response examples |
| HTTP files | `.http`, `.rest` | Declarative requests only; scripts are not executed |
| Specfold | Collection JSON | Native portable collection |
| cURL | Command text | Common method/header/body/auth flags |

Malformed or unsupported records are reported without executing imported scripts. Folder imports are bounded by depth, file count, and total bytes.

## Base URLs And Environments

Specfold separates environment defaults from collection- and folder-level routing:

- Every workspace starts with an active `Specfold` environment; environments can be renamed, and the final environment cannot be deleted.
- Environment `baseUrl` is a convenient default for new collections and bulk updates.
- New collections copy the active environment `baseUrl` as their starting collection base URL.
- Collection `baseUrl` overrides the environment `baseUrl` when requests resolve `{{baseUrl}}`.
- A folder `baseUrl` overrides both values for every request below that folder; nested folders inherit the nearest configured parent and can override it again.
- Absolute request URLs always stay unchanged. Relative request URLs are joined to the effective base URL, so both `/orders` and `{{baseUrl}}/orders` are supported.
- Collection `baseUrl` can be edited directly from the request workspace, even when no request is selected.
- Select a folder in the collection tree to edit its base URL. Leaving it empty restores inheritance.
- Updating an environment `baseUrl` can optionally apply the same value to all collection base URLs.
- Imported OpenAPI/Swagger `servers` are mapped into collection base URL data.

Effective precedence is: absolute request URL, nearest folder `baseUrl`, collection `baseUrl`, then environment `baseUrl`. This keeps two proxy folders isolated inside one collection.

## Apinizer JWT Workflow

Specfold includes an Apinizer-focused JWT request template:

1. Import an OpenAPI/Swagger document exported from Apinizer.
2. Create an **Apinizer JWT request** from the New menu.
3. Specfold creates an **Apinizer Auth** folder and derives its base URL from the API origin when possible. For example, `https://api.tarimorman.gov.tr/dats/cks` becomes `https://api.tarimorman.gov.tr`, producing `https://api.tarimorman.gov.tr/auth/jwt`.
4. Review or override the folder base URL, then set environment values such as `username`, `password`, and `clientId`.
5. Send the token request.
6. Use **Save field to variable** on the response to store `access_token` as `{{accessToken}}`.
7. Use bearer auth with `{{accessToken}}` on other requests.
8. Export the selected folder or collection as OpenAPI YAML/JSON.

## Data And Security

- Workspaces are saved locally using atomic writes.
- Rotating workspace backups are kept.
- Corrupt workspace files are quarantined instead of overwritten.
- Environment variables marked secret are encrypted at rest with Electron `safeStorage`.
- Complete backup exports intentionally contain readable secret values, require explicit confirmation, and use `0600` permissions where supported.
- Restore accepts only `specfold.backup.v1`, caps reads at 100 MB, validates workspace/settings, creates a safety copy, re-encrypts secrets, and rolls back both files on failure.
- If encryption is unavailable, secret values are never persisted as plaintext and the application shows a persistent warning.
- Export warnings flag literal values that look like secrets.
- Parameter and header values are not emitted as OpenAPI examples unless explicitly enabled.
- Unused component schemas are pruned from folder-scoped exports by default.
- HTTP requests use configurable timeouts and capped response bodies.
- Insecure TLS is opt-in.
- System proxy rules are used, with `HTTP_PROXY` / `HTTPS_PROXY` fallback.
- The desktop renderer runs with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and a packaged Content Security Policy.

See [docs/REDTEAM_REPORT.md](docs/REDTEAM_REPORT.md) for the v1.1 security review, threat model, closed findings, and remaining release risks.

### Backup, Restore, And Delete

Open **Settings -> Data management**:

1. **Export backup** asks whether to include readable secrets, then writes the complete workspace and settings.
2. **Restore backup** confirms replacement, validates the selected file, and reports the pre-restore safety-copy path on success.
3. **Delete all data** requires both a warning confirmation and exact `DELETE ALL` text. It removes workspace, settings, rotating/safety backups, and quarantined workspace files, then creates a fresh `Specfold` environment.

Backup files are sensitive because they intentionally include secrets. Store them in an encrypted location and delete copies you no longer need.

## Installation Notes

### Windows

Download the installer or portable `.exe`. If SmartScreen appears, verify the file came from the GitHub release and choose **More info** -> **Run anyway**.

### macOS

Download the `.dmg` or `.zip` for your architecture:

- Apple Silicon: `arm64`
- Intel: `x64`

Because v1.2.1 is not notarized, macOS may require opening the app from Finder with **Open**.

### Linux

Download the `.AppImage` or `.deb`.

```bash
chmod +x Specfold-1.2.1-linux-x86_64.AppImage
./Specfold-1.2.1-linux-x86_64.AppImage
```

For Debian-based distributions:

```bash
sudo dpkg -i Specfold-1.2.1-linux-amd64.deb
sudo apt-get install -f
```

## Project Layout

```text
apps/desktop/src/main                 Electron bootstrap and testable services
apps/desktop/src/shared/contracts.ts  Shared main/preload/renderer IPC contracts
apps/desktop/src/renderer/app         Controller hooks and screen modules
apps/desktop/src/renderer/components  Tree and key/value editor components
packages/core/src/importers/portable  Postman, Insomnia, HAR, and HTTP importers
packages/core/src/exporters/openapi   OpenAPI assembly, operations, security, warnings
docs/                                 Product, architecture, UI, and security specs
```

## Development

Requires Node.js 20+ and npm 10+.

```bash
npm install
npm run dev
npm run typecheck
npm test
```

## Build Locally

```bash
npm run package:win:portable     # Windows portable .exe
npm run package:win:installer    # Windows NSIS installer
npm run package:win              # Windows portable + installer
npm run package:mac              # macOS dmg + zip, x64 + arm64; run on macOS
npm run package:linux            # Linux AppImage + deb, x64; run on Linux
```

Artifacts are written to `apps/desktop/dist`.

## Release

Run the release workflow manually first. `workflow_dispatch` builds and verifies every package plus `SHA256SUMS.txt` without creating a tag or release. Tag pushes run the same package gate and create a draft GitHub Release.

```bash
git tag -a v1.2.1 -m "Specfold v1.2.1"
git push origin main
git push origin v1.2.1
```

Public release assets are only the two Windows packages, four macOS packages, Linux AppImage/DEB, and `SHA256SUMS.txt`. Builder debug YAML, updater YAML, and blockmaps are excluded. The generated release stays draft until manual smoke tests pass.

## Known Limitations

- Release builds are not code-signed yet.
- macOS builds are not notarized yet.
- Complete backups are plaintext by design and may contain secrets.
- Very large imports/exports can still use the renderer thread, within configured size limits.
- Auto-update is not implemented in v1.2.1.
- SOCKS proxies are not supported; configure an HTTP(S) proxy for Specfold.

## License

Specfold is licensed under the [Apache License 2.0](LICENSE).
