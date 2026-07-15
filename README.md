<p align="center">
  <a href="https://gatewaylabs.net/specfold">
    <img src="apps/desktop/build/logo.svg" width="96" height="96" alt="Specfold logo" />
  </a>
</p>

<h1 align="center">Specfold</h1>

<p align="center">
  A local-first desktop API collection studio for OpenAPI, Swagger, cURL, and gateway request workflows.
</p>

<p align="center">
  <a href="https://gatewaylabs.net/specfold">gatewaylabs.net/specfold</a>
  ·
  <a href="https://github.com/Gatewaylabsnet/specfold/releases/tag/v1.0.3">Download v1.0.3</a>
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
OpenAPI / Swagger / cURL
        -> editable collections, folders, and requests
        -> local environments and collection-level base URLs
        -> request testing, response inspection, and variable capture
        -> OpenAPI YAML / JSON export
```

It is intentionally local-first. There is no account requirement, no cloud workspace, and no hosted sync layer. Your workspace, environments, request history, and secrets stay on the machine running the desktop app.

## Download v1.0.3

| Platform | Package | Download |
| --- | --- | --- |
| Windows x64 | Installer | [Specfold-1.0.3-x64.exe](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.0.3/Specfold-1.0.3-x64.exe) |
| Windows x64 | Portable app | [Specfold-1.0.3-x64-portable.exe](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.0.3/Specfold-1.0.3-x64-portable.exe) |
| macOS Apple Silicon | DMG | [Specfold-1.0.3-mac-arm64.dmg](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.0.3/Specfold-1.0.3-mac-arm64.dmg) |
| macOS Apple Silicon | ZIP | [Specfold-1.0.3-mac-arm64.zip](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.0.3/Specfold-1.0.3-mac-arm64.zip) |
| macOS Intel | DMG | [Specfold-1.0.3-mac-x64.dmg](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.0.3/Specfold-1.0.3-mac-x64.dmg) |
| macOS Intel | ZIP | [Specfold-1.0.3-mac-x64.zip](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.0.3/Specfold-1.0.3-mac-x64.zip) |
| Linux x64 | AppImage | [Specfold-1.0.3-linux-x64.AppImage](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.0.3/Specfold-1.0.3-linux-x64.AppImage) |
| Linux x64 | Debian package | [Specfold-1.0.3-linux-x64.deb](https://github.com/Gatewaylabsnet/specfold/releases/download/v1.0.3/Specfold-1.0.3-linux-x64.deb) |

Release page: [github.com/Gatewaylabsnet/specfold/releases/tag/v1.0.3](https://github.com/Gatewaylabsnet/specfold/releases/tag/v1.0.3)

Unsigned Windows builds may trigger SmartScreen. Unsigned and non-notarized macOS builds may require opening from Finder with **Open** to confirm the Gatekeeper prompt.

## What It Does

- Imports OpenAPI 3.x, Swagger 2.0, Specfold Collection JSON, and `curl` commands.
- Lets you select exactly which operations to import before creating requests.
- Groups imported endpoints by tag, first path segment, or a single folder.
- Organizes APIs into collections, folders, and requests with search, rename, duplicate, delete, and drag-and-drop movement.
- Edits request method, URL, query params, path params, headers, body, and auth.
- Supports bearer token, basic auth, API key auth, and no-auth request modes.
- Sends HTTP requests from the desktop app and shows status, timing, size, headers, body, raw response, and per-request history.
- Copies any request as a `curl` command.
- Saves JSON response fields directly into environment variables.
- Exports a whole collection or selected folders back to OpenAPI YAML/JSON.
- Runs an export structure check before saving generated OpenAPI.

## Base URLs And Environments

Specfold separates environment defaults from collection-level routing:

- Environment `baseUrl` is a convenient default for new collections and bulk updates.
- New collections copy the active environment `baseUrl` as their starting collection base URL.
- Collection `baseUrl` overrides the environment `baseUrl` when requests resolve `{{baseUrl}}`.
- Collection `baseUrl` can be edited directly from the request workspace, even when no request is selected.
- Updating an environment `baseUrl` can optionally apply the same value to all collection base URLs.
- Imported OpenAPI/Swagger `servers` are mapped into collection base URL data.

This lets teams keep environment-level defaults while still allowing each collection to point at a different gateway, tenant, or service boundary.

## Apinizer JWT Workflow

Specfold includes an Apinizer-focused JWT request template:

1. Import an OpenAPI/Swagger document exported from Apinizer.
2. Create an **Apinizer JWT request** from the New menu.
3. Set collection or environment values such as `baseUrl`, `username`, `password`, and `clientId`.
4. Send the token request.
5. Use **Save field to variable** on the response to store `access_token` as `{{accessToken}}`.
6. Use bearer auth with `{{accessToken}}` on other requests.
7. Export the selected folder or collection as OpenAPI YAML/JSON.

## Data And Security

- Workspaces are saved locally using atomic writes.
- Rotating workspace backups are kept.
- Corrupt workspace files are quarantined instead of overwritten.
- Environment variables marked secret are encrypted at rest with Electron `safeStorage`.
- If encryption is unavailable, secret values load back empty instead of being persisted as plaintext.
- Export warnings flag literal values that look like secrets.
- Parameter and header values are not emitted as OpenAPI examples unless explicitly enabled.
- Unused component schemas are pruned from folder-scoped exports by default.
- HTTP requests use configurable timeouts and capped response bodies.
- Insecure TLS is opt-in.
- System proxy rules are used, with `HTTP_PROXY` / `HTTPS_PROXY` fallback.
- The desktop renderer runs with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and a packaged Content Security Policy.

See [docs/REDTEAM_REPORT.md](docs/REDTEAM_REPORT.md) for the v1.0 security review, threat model, closed findings, and remaining release risks.

## Installation Notes

### Windows

Download the installer or portable `.exe`. If SmartScreen appears, verify the file came from the GitHub release and choose **More info** -> **Run anyway**.

### macOS

Download the `.dmg` or `.zip` for your architecture:

- Apple Silicon: `arm64`
- Intel: `x64`

Because v1.0.3 is not notarized, macOS may require opening the app from Finder with **Open**.

### Linux

Download the `.AppImage` or `.deb`.

```bash
chmod +x Specfold-1.0.3-linux-x64.AppImage
./Specfold-1.0.3-linux-x64.AppImage
```

For Debian-based distributions:

```bash
sudo dpkg -i Specfold-1.0.3-linux-x64.deb
sudo apt-get install -f
```

## Project Layout

```text
apps/desktop      Electron app: main process, preload bridge, React renderer
packages/core     Model, importers, exporters, variable resolution, HTTP preparation
docs/             Product notes, architecture, import/export rules, security review
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

The release workflow runs on `v*` tags and builds Windows, macOS, and Linux packages.

```bash
git tag -a v1.0.3 -m "v1.0.3"
git push origin main
git push origin v1.0.3
```

The workflow creates a draft GitHub Release with generated release notes and all platform artifacts attached.

## Known Limitations

- Release builds are not code-signed yet.
- macOS builds are not notarized yet.
- Auto-update is not implemented in v1.0.3.
- SOCKS proxies are not supported; configure an HTTP(S) proxy for Specfold.

## License

Specfold is licensed under the [Apache License 2.0](LICENSE).
