# Public endpoint release 0.1.14 — 2026-09-24

## Changes and acceptance contract

MCP: `https://mcp.loginom.ai/mcp`. Default Loginom: `https://app.loginom.ai`.
The settings form uses Product defaults. Existing Desktop and CLI connections
using exactly `http://logi-test-plan.bg.local/app/` (or without the final slash)
migrate through a new durable generation. Pending user settings take precedence;
custom URLs, credentials and old generation files remain intact. Failed runtime
preparation keeps the pending record so the next startup can retry.

The public root redirects to `/app/` without preserving query parameters.
The browser login address therefore resolves that specific public root to
`/app/?testable=true`; displayed/stored defaults remain the requested root URL.
Other origins and custom paths retain their existing behavior.

Version 0.1.14 is synchronized using `script/set-version.ts`. Release targets:
Desktop and CLI for Linux x64, Windows x64 and macOS arm64, channel prod,
published GitHub pre-release after all release gates and artifact verification.

## Local checks

- Product: 5 tests PASS; typecheck PASS.
- Shared connection migration: 14 tests PASS, covering Desktop/CLI codecs,
  both old URL spellings, custom URLs, pending precedence, credentials/history,
  restart idempotence, preparation failure/retry and clean profiles.
- Desktop connection tests: 35 PASS; Desktop/Host/App typecheck PASS.
- Settings form: 15 tests PASS under browser conditions.
- Runtime login address and authentication controls: 5 tests PASS, Node 24.19.0.
- Authenticated MCP initialize and real Loginom login: PASS using source runtime,
  pinned Chromium 1243 and an isolated temporary profile. Existing user profiles
  were not changed. Initial MCP 503/502 responses cleared before acceptance.
- Source attribution: 5045 files verified. Updated setup/docs hashes and repaired
  stale attribution for the unchanged `session.mjs` browser-download change from
  commit `75bc5d86e`; no additional runtime change was made for that repair.

## Superseded v0.1.13 attempt

Tag `v0.1.13` remains at `f3fd53b5d13e85a49f7085ed3b27a58481dc49c0` and is
not published. The user selected v0.1.14 rather than moving that tag.
[Run 36011972407](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/36011972407)
built all three platforms successfully; Desktop, e2e and typecheck passed.
The unit gate hit the previously observed Host kill/cleanup race; five isolated
local repeats passed without source changes. The branch's full test run passed.
Linux smoke failed because the test expected the old URL; both installed/GUI
smoke expectations are corrected for v0.1.14. Ubuntu 24.04 additionally hit a
404 while downloading libexpat from an Ubuntu mirror. Attempt 2 was cancelled
once the deterministic outdated assertion was identified.

Downloaded macOS 0.1.13 source/DMG/ZIP hashes match its manifest; native source,
build, static and offline reports passed. The corrected GUI defaults test also
passed on that binary in an isolated profile. Authenticated check/save and
restart migration from the old URL passed on the exact downloaded macOS binary,
with credentials and the old generation preserved. Early acceptance harness
attempts encountered incompatible Playwright matchers/premature async waiting;
the final probe uses one Playwright runtime and explicit status polling. Some
live login attempts timed out behind a transient Loginom mask; a diagnostic
copy exposed the intercepted click, and the complete final installed run passed.
This does not establish that server-side mask delays have been eliminated.

## v0.1.14 release verification

Source: `8b7ea1225d0ed095ea48b8816a6c80b04f0d0cdf`, immutable tag `v0.1.14`.
[Release run 36016334443](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/36016334443).
All three native builds, shared unit/HTTP API tests, Desktop tests, e2e and
typecheck passed on attempt 1. Linux matrix attempt 1 passed 4/5 systems;
Ubuntu 26.04 failed before application launch on an Ubuntu libexpat HTTP 404.
Attempt 2 passed Ubuntu 26.04 and Debian 12/13; Ubuntu 22.04/24.04 failed on
the same mirror download problem. Neither incomplete matrix authorizes release.
The failed reports and logs were preserved locally before replacing their CI
artifact for the next attempt. No application assertions were weakened.

On 2026-09-24, all three exact missing Ubuntu package URLs returned HTTP 200.
The full five-system matrix was rerun without source, tag or workflow changes.
Attempt 3 passed all five systems in one matrix run: Ubuntu 22.04/24.04/26.04
and Debian 12/13, each `offline-nonroot-launch`, exit 0. The report references
DEB SHA-256 `58271c18affd713e9056bdaadc13cabacbb5416128e00cd0b65b9c95c7de2b5f`.
The successful native builds and other gates are retained from attempt 1;
there is no aggregation of different matrix attempts. Mirror recovery made
workflow modifications and a new client version unnecessary.
The complete release run finished **SUCCESS** on attempt 3. CI created a draft
with 30 assets. Local release validation passed; all 30 GitHub asset sizes and
SHA-256 digests matched the locally verified files, including `SHA256SUMS.txt`.
The user-authorized [v0.1.14 pre-release](https://github.com/gooddaytoday/loginom-ai-agent/releases/tag/v0.1.14)
was published at **2026-09-24 15:44:46 UTC**. Read-back confirmed `isDraft=false`,
`isPrerelease=true`, 30 assets. Release notes describe the new defaults/migration,
actual acceptance boundaries and mirror retries; an obsolete proxy-policy line
from the notes template was removed. No client, workflow or tag changed after
building. Reports/checkpoint are recorded in a subsequent documentation commit.

All downloaded Desktop manifests identify that same clean source and version;
installer/source hashes and the CLI/archive and manifest checksum files passed
local verification. macOS native source/build/static/offline reports passed.
The exact downloaded macOS ZIP was extracted into an isolated test installation:
new form/profile defaults, authenticated MCP/Loginom check and save passed.
Migration to generation 2 preserved credentials and historical generation 1.
An initial live migration preparation timed out behind the Loginom UI mask;
restarting the same isolated profile completed its pending migration successfully.
The mask delay itself is not claimed fixed. A second complete clean-profile
check/save and migration run passed without a retry immediately before publication
verification (`loginom-014-release-live-BKiKyb`, temporary local evidence).

Linux installed acceptance is the DEB's offline non-root container matrix;
AppImage static extraction is not an installed AppImage GUI test. Windows has
native CI, installer/payload and independent-profile tests, but no local installed
live Loginom acceptance. CLI migration has shared service tests with CLI codecs;
no installed CLI live Loginom acceptance is claimed. No model/provider request
was tested. Linux/Windows remain unsigned; macOS own code is ad-hoc signed without
notarization. Signing, auto-update and public-site changes are outside this release.
