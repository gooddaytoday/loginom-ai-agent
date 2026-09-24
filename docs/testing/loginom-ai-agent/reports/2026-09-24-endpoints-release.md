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

## Release checkpoint

CI and artifact verification are pending. This report must be completed with
the source commit, release run, asset verification and publication status.
Local source/live checks do not establish installed acceptance of release binaries.
Linux/Windows remain unsigned; macOS own code is ad-hoc signed without notarization.
