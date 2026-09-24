# Public endpoint release 0.1.13 — 2026-09-24

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

Version 0.1.13 is synchronized using `script/set-version.ts`. Release targets:
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

## Release checkpoint

CI and artifact verification are pending. This report must be completed with
the source commit, release run, asset verification and publication status.
Local source/live checks do not establish installed acceptance of release binaries.
Linux/Windows remain unsigned; macOS own code is ad-hoc signed without notarization.
