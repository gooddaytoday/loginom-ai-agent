# Linux implementation checkpoint — 2026-09-16

Implementation is ongoing, not release-ready. Active goal remains the full approved Linux plan.

## Verified in this checkpoint

- Frozen import: all 4951 files verified with `source-transforms.json`. The transform manifest uses symlink target bytes, not followed file contents.
- Runtime migration regressions: 11 failures stable in three targeted runs; caused by the known import commit `26ff8fa76`, which changed directory layout and intentionally archived Codex plugin manifests. No assertion weakening or unknown historical regression requiring bisect.
- Fixed catalog builder/publisher and landing imports to the monorepo. Two obsolete Codex manifest tests preserved as text in `legacy-tests/`; behavioral archive test retained.
- Targeted imported tests: 108 pass. Full imported suite: 1951 pass, 1 skip, 0 fail, Node 24.19.0, 128 seconds. This does not prove managed desktop execution.
- Core, desktop, backend and schema typecheck passed after namespace changes. Client regenerated from source using its official generator.
- Electron production build passed (Node v1 sidecar and renderer); this is not a packaged DEB/AppImage or a GUI acceptance test.
- Backend config/installation tests: 250 pass, 3 skip. UI identity/persistence/deep-link tests: 45 pass. Core global path tests passed. Desktop packaging/updater/install-state targeted tests passed.
- Connection settings foundation: 23 tests pass, schema/desktop typecheck pass. Covers plaintext Linux 0600 persistence, staged versus active settings, credentials adapter fail-closed behavior on non-Linux, two-run generation barrier, ambiguous receipt recovery lease, revision conflict, cancellation, failed readiness and bounded auth errors. Native protection adapters are not verified against Windows/macOS here.

## Work in progress

- F5 namespace migration is extensive and uncommitted. `packages/opencode` → `packages/agent`; own scoped packages, env vars and persistence changed. External provider IDs/API keys preserved. Product schema uses URNs instead of upstream URLs. Legacy symbol names exported by SDK/client remain compatibility names.
- Upstream installer download helpers removed; WSL upstream installation disabled with explicit manual-install error. V2 background CLI resource wiring still needs a deliberate product solution.
- D3/D5 new modules in `packages/desktop/src/main/loginom/` and schemas in `packages/schema/src/loginom.ts` are not yet wired into IPC/UI or a real runtime. The runtime interface in unit tests is a controlled adapter, not evidence of successful Loginom authentication.
- Chromium 1243 download started into the product build cache; confirm result before claiming availability.

## Remaining gates

F5/F6 review, complete branding/assets and compatibility exceptions, remaining generator checks; D1/D2 managed runtime/host and trusted input grants; real D4 authentication; IPC and D6 UI; D5 crash/write-failure recovery; R1–R7 bundles, installers, Docker, native Linux GUI and real Loginom CSV/save/reopen/recovery oracles. No old installations or repositories deleted. No server deployment or release published.

Connection service needs additional scrutiny for disk commit errors (especially fsync after pointer rename), validation token expiration cleanup, and final lifecycle wiring. Do not declare that state machine production complete from its current unit tests alone.

## Additional verified progress

- Legacy SDK regenerated successfully through `./packages/sdk/js/script/build.ts` after package rename.
- Pinned Chromium 1243 downloaded to the build cache. Browser SHA256: `8c599d43aec53f2460a31ae2f4af6bd863f8258b34ff519564bc5d4726bfaa1e`.
- Real server authentication and Loginom identity read-back passed with the user-provided private config; Chromium sandbox enabled, fresh headless profile, empty password from the explicit passwordless profile, no folder access/probe.
- Managed entrypoint and supervisor launched the real Node child via private IPC, verified Node/Chromium resource hashes, authenticated and shut down. Unicode/spaced writable profile path passed. The full bridge then reached readiness and listed 34 tools; no workspace creation or data operation was executed.
- Development resource fixture at `~/.cache/loginom-ai-agent/managed-test-resources` currently hashes Node and the browser executable only. It is not the full release manifest or distributable bundle; complete resources and hashes still belong to R1.
- Host package typecheck and two transport tests passed (real child process; no model calls). Runtime connection helper tests passed. Tokens now have expiration timers; generation records are created without overwrite using a hard link, then the active pointer is renamed atomically.
- Runtime modules remain unwired into desktop IPC and agent drains. Trusted attachment admission, model instruction delivery, and failure/recovery paths remain necessary before acceptance.
