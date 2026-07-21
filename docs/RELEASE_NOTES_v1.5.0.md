# Specfold v1.5.0

## Added

- Safe re-import preview and merge: matched, added, and retained request counts are visible before applying.
- Postman Collection v2.1 and `.http` export.
- Portable OAuth Client Credentials and Password Grant token recipes.

## Changed

- Re-import never removes existing requests and preserves a matched request’s ID, custom auth, body, and saved examples.

## Security

- Re-import is opt-in and non-destructive; no source document can silently delete workspace requests.

## Known limitations

- Per-profile proxy/CA/client-certificate settings and browser-based OAuth login are not included.
- `.http` export deliberately omits session-only multipart file grants.

## Verification

- Re-import preservation, portable output, OAuth recipes, typecheck, tests, and production build must pass on the final release commit.
