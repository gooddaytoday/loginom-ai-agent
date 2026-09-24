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

**Publication blocked; v0.1.15 remains a draft pre-release.** The annotated tag
is immutable at `594a47b02b305d33cef9a506033ab56532390b02`.

- [Release CI run 36049223320](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/36049223320)
  passed all required jobs, three native builds and the complete Linux 5/5 matrix.
- All 30 downloaded release assets matched GitHub size/digest metadata and the
  29 SHA256SUMS entries. All three manifests identify the tagged clean commit.
- macOS ZIP and DMG passed native static verification (4447 resources) and deep
  strict signature verification. The standalone CLI manifest/signature passed.
- Exact macOS CLI artifact: GPT-6 Sol low imported the control CSV, grouped by
  Product and returned A / 55, then saved the package. A fresh model process
  reopened it. An independent cold reader freshly executed the saved node and
  confirmed 55 without reapplying settings, then closed the owned package and
  logged out. The model catalog was refreshed using the official CLI command.
- Exact macOS Desktop artifact: isolated profile, ordinary public root saved,
  connection ready, original CSV imported. Group creation and rename succeeded,
  but connecting its input exhausted native drag attempts without a verified link.
  `group-0115` remained AMBIGUOUS; no completed result or saved package was claimed.
  Reopening could not pass because that package was never saved. A driver exit code
  of zero is not a successful scenario result.
- Windows/Linux: full CI only; no live scenario acceptance claimed. The Linux
  container matrix covers DEB, not an installed AppImage live workflow.

Local private evidence: `.local/node-development/evidence/release-0115/`;
`cli-accepted`, `cli-cold-2/result.json`, `desktop-final` and its execution journal.
Downloaded verification evidence: `~/Downloads/loginom-ai-agent-0.1.15/`.
Secrets and raw journals are excluded from Git. Installed user applications and
sessions were not replaced or restarted; auto-update remains disabled.

## Authorized continuation: 0.1.16

The user authorized fixing the separate node-connection failure and preparing
v0.1.16. Preserve the v0.1.15 tag and draft. Diagnose the actual drag failure,
add targeted regression coverage, then repeat the complete release gates on a
new fixed commit and its exact artifacts. Publication still requires successful
Desktop and CLI acceptance and a separate final authorization.
