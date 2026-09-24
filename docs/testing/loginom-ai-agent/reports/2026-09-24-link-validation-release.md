# Workspace and link readiness release 0.1.16 — 2026-09-24

## Scope

Desktop and standalone CLI, prod channel, macOS arm64 / Windows x64 / Linux x64.
The user authorized v0.1.16 after the v0.1.15 Desktop scenario failed. Preserve
v0.1.15 as an immutable tag and unpublished draft; see the [0.1.15 report](2026-09-24-workspace-release.md).

Includes the shared canonical workspace address and hidden `testable` fixes from
0.1.15. Adds waiting for asynchronous native port compatibility during one held
managed drag. Reads only Loginom's cached validation result, with exact graph,
source/target and drag ownership checks. Refreshes the target center and verifies
its native marker before mouse-up. Cancellation, rejection, identity changes and
the original deadline still stop work and release the mouse. No validation RPC,
new browser session, retry of an unknown gesture or deadline extension is added.

## Diagnosis and source acceptance

The original Desktop trace created/renamed grouping successfully, then exhausted
10 link gestures without an exact link. It did not record validation latency, so
its precise server response duration cannot be established retrospectively.
Live inspection of Loginom 7.4.2 confirmed that port validation returns a Promise,
fills `FValidatedConnectionsCache` asynchronously and enlarges compatible ports.
The previous drag released immediately after its move and could exhaust all
attempts before that result arrived.

A controlled 20-second delay of the existing UI validation promise reproduced
AMBIGUOUS / graph reconciliation required on the old artifact. With the source
fix, the same delay succeeded with one held drag: validation settled at 20864 ms,
mouse-up at 20865 ms, exact link verified at 21795 ms. A complete graph read
confirmed the requested edge. The isolated diagnostic package was closed with
explicit discard of its own temporary changes and logout; the saved CLI fixture
and the user's installed application were preserved.

Private diagnostic evidence: `.local/node-development/evidence/release-0115/link-repl-1/`
(`delayed-old.json`, `fixed-delay20.json`, `fixed-delay20-graph.json`,
`fixed-cleanup.json`). These are source diagnostics, not v0.1.16 artifact acceptance.
One intervening diagnostic attempt failed during creation while the old delayed
UI was still settling; it is retained and is not counted as a pass.

- Runtime full suite: 2382 PASS, 4 platform/environment SKIP, 0 FAIL, pinned Node 24.19.0.
- Targeted executor/target/hover/rebind/validation suite: 130 PASS, including
  19 new regression cases for pending/ready/rejected caches, changed owners,
  delayed validation, deadline expiry, foreign context and missing target marker.
- Desktop connection and packaging: 48 PASS, 0 FAIL.
- Host and Desktop typechecks: PASS, Bun 1.3.14.
- Source attribution: 5045 files verified.
- Host full suite: 127 PASS, 8 platform SKIP, 0 FAIL.

The shared CI gate includes the new regression and surrounding link suites.
Generated release notes also correct the Linux DEB matrix scope and Desktop
system-proxy description; runtime proxy behavior is unchanged.

## Release verification — 2026-09-25 Europe/Moscow

**READY FOR PUBLICATION; draft only. Separate user authorization is pending.**

Annotated tag `v0.1.16` identifies `2bac319e8fc7b35558b8fd309126b7b32f49a7ef`
on `loginom`, prod channel. Branch and new tag were pushed atomically. The existing
v0.1.15 tag was not moved and that release remains an explicitly blocked draft.
The user's installed application and sessions were not replaced or restarted.

[Release CI run 36056419930](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/36056419930)
passed all required jobs on the first attempt: shared unit/HTTP API/Desktop/e2e,
typechecks, all three native builds, and Linux matrix 5/5 (Ubuntu 22/24/26,
Debian 12/13). The tag-push workflow's `cut` job is intentionally skipped.

All 30 release files matched GitHub sizes/digests and all 29 SHA256SUMS entries.
The three release manifests identify the same clean tagged commit and version.
The Linux matrix hash matches the exact DEB. macOS ZIP/DMG passed local native
verification of 4447 resources and signatures; CLI manifest and strict code
signature verification passed. Desktop and CLI runtime files for address and
link handling matched the committed source byte for byte. The release-notes
validator also passed against the complete downloaded asset set.

| macOS artifact | SHA-256 |
| --- | --- |
| `loginom-ai-agent-mac-arm64.zip` | `f1181eb5dea2c996db8eb5cd61219d742b09f47d02d0465d3a2fc1257e23c6d1` |
| `loginom-ai-agent-mac-arm64.dmg` | `f0c1a7e667e22ed3a447f74ebb19944373bc59a12f071fda0653a51bbabb1cbd` |
| `loginom-ai-agent-cli-0.1.16-darwin-arm64.tar.gz` | `1323191dd368546349518839feb9df754f8f2daa3a5630b4704679dba5785757` |

## Exact-artifact live macOS acceptance

Both products ran from the downloaded 0.1.16 artifacts in separate test profiles.
Both used `openai/gpt-6-sol`, variant `low`, confirmed in actual message records.
The official CLI model-catalog refresh supplied GPT-6 Sol; Desktop used a copy
of that refreshed catalog in its own profile. No binary or bundled runtime was
patched for acceptance. The original CSV was `Product;Amount` with A/10, A/20,
A/25 (SHA-256 `5fc835ea6ddaa06eff161c48917e42e9aa613f37b3c9417c0eb31b361d88501b`).

| Gate | CLI | Desktop |
| --- | --- | --- |
| Ordinary public root saved; connection ready | PASS | PASS |
| Original CSV uploaded and imported | PASS | PASS |
| Group by Product, execute, read A / 55 | PASS | PASS |
| Save with confirmed unmodified package | PASS | PASS |
| New process, preparation and saved-package reopen | PASS | PASS |
| Independent cold execution, same result, no node settings reapplied | PASS | PASS (second probe) |
| Owned cold-session package close and logout | PASS | PASS |

CLI package: `/user/release0116-cli-1790283601150.lgp`.
Desktop package: `/user/release0116-desktop-1790284095176.lgp`.

The first independent Desktop cold probe timed out opening the progress console
(`cold-read-desktop:n2`, UI gesture at 21660 ms), before starting node execution.
Its cleanup confirmed package closure and logout without changes. The second
probe used the same artifact, script, deadlines and saved package in a fresh
profile, and passed. The first failed probe remains retained; its precise delay
cause is not established. It is not counted as a successful attempt. The model
creation/execution/save/restart/reopen flow itself passed on its first 0.1.16 run.

Private evidence: `.local/node-development/evidence/release-0116/`:
`cli-accepted`, `cli-cold`, `desktop-accepted`, `desktop-cold` (failed initial
probe), `desktop-cold-2` (PASS). Artifact checks are in
`~/Downloads/loginom-ai-agent-0.1.16/asset-verification.json`,
`runtime-fix-verification.json`, `verified-{cli,zip,dmg}.json`, `ci-summary.json`.
Raw journals, credentials and profiles are excluded from Git.

## Publication boundary and limitations

Windows/Linux received full native CI and the Linux DEB matrix; no live Loginom
scenario acceptance is claimed for those platforms. Linux/Windows remain
unsigned; macOS own code is ad-hoc signed, without Developer ID/notarization.
The public automatic update feed remains disabled. Publication must await the
user's separate authorization after reviewing this report and the prepared notes.
After publication, verify pre-release status and asset availability and append
the final release link here.
