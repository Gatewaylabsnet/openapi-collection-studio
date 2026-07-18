# Specfold v1.2.1

## Fixed

- Collection and nested-folder collapse controls now work independently instead of leaving folder contents permanently expanded.
- Selecting a collection or folder no longer toggles its expanded state; dedicated chevron controls handle expansion without disrupting selection.
- Searching the collection tree temporarily reveals matching descendants and restores the user's previous expanded state when the search is cleared.

## Changed

- The request workspace now shows only the base URL editor for the selected collection or folder scope.
- A compact effective-base-URL summary identifies whether routing comes from the nearest folder, collection, or active environment.
- Newly created folders open automatically, while deleted folders are removed from the tree's expansion state.

## Security

- Existing local-first storage and encrypted secret handling remain unchanged.
- Release checksums are published in `SHA256SUMS.txt`; packages remain unsigned while the SignPath Foundation application is pending.

## Known limitations

- Windows packages may trigger SmartScreen while code signing is pending.
- macOS packages are not signed or notarized and may trigger Gatekeeper prompts.
- Auto-update is not included; install new versions manually from GitHub Releases.
- SOCKS proxies are not supported.
