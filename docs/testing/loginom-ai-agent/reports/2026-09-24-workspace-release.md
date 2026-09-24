# Workspace address release 0.1.15 — 2026-09-24

## Scope and release gates

Desktop and standalone CLI, prod channel, Linux x64 / Windows x64 / macOS arm64.
Private login and managed preparation use one canonical Loginom URL. The public
root maps to `/app/?testable=true`; custom paths retain their identity. Settings
and public connection views omit `testable`; new saves strip it while historical
generations remain immutable. Other query parameters and credentials are preserved.

The original installed 0.1.14 failure and read-only browser reproduction are in
[the diagnosis](../public-root-workspace-diagnosis.md).

Publication requires green release CI, one complete Linux matrix 5/5, verified
assets/manifests/hashes and live Desktop/CLI macOS acceptance on those exact assets.
Live acceptance uses isolated profiles and GPT-6 Sol low, with CSV import,
execution, result comparison, saving, reopening and restart preparation. User
sessions and the installed application are not replaced. Windows/Linux live
scenario acceptance is not part of this release gate and must not be claimed.
After the final report, publication requires the user's separate confirmation.

## Source checks

- Runtime: 67 tests PASS using pinned Node 24.19.0, including login-to-workspace
  regressions for root, explicit app path, custom URLs/query parameters and foreign
  pages. The address regression is also added to the shared CI unit gate.
- Desktop connection/packaging: 48 tests PASS.
- Host: 127 PASS, 8 platform-specific SKIP, 0 FAIL.
- Host and Desktop typechecks PASS with Bun 1.3.14.
- Source attribution: 5045 files verified; the changed migrated test is recorded
  in source-transforms.json.

## Release status

Version synchronized to 0.1.15. CI, downloadable artifact verification and live
acceptance are pending. This section must be updated with exact commit/run IDs,
artifact hashes and acceptance results before requesting publication.
