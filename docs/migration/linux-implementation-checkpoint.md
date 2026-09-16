# Linux implementation checkpoint — 2026-09-16

Implementation is ongoing, not release-ready. The active goal remains the full approved Linux plan. Branch `loginom`; foundation commit `d848db933`, subsequent desktop wiring and packaging changes remain uncommitted at this checkpoint.

## Verified

- Imported source manifest: 4951 files verified, including documented managed-runtime transformations. Full imported runtime suite after the recovery-state additions: 1951 pass, 1 skip, 0 failures (Node 24.19.0, 124.5 seconds).
- Own product/package/config/environment identities migrated; external provider protocols preserved. Client and legacy SDK regenerated. Backend config tests: 250 pass, 3 skip; UI identity/persistence tests: 45 pass. Core, backend, schema, host and desktop typechecks passed at the corresponding implementation checkpoints.
- Bundled managed Node 24.19.0, Playwright/MCP and Chromium 1243 launched with sandbox enabled. Real Loginom authentication and account read-back passed using the private local config; no folder probe. Full bridge exposed 34 tools.
- Main process owns connection generations, private secrets, validation and runtime processes. Utility backend receives a private MessagePort and per-drain lease. Renderer exposes only the five approved operations and redacted status.
- Shared wizard/settings form is connected. Four fields, default URL/user, empty secrets and no password placeholder verified in a real Electron/Xvfb GUI. Real check/save passed; Linux file permissions were 0600 and plaintext policy verified. Restart restored the connection without repeating the wizard. The GUI test uses explicit awaited IPC polling because the prior browser-side asynchronous readiness predicate returned prematurely.
- Connection service suite: 18 tests passed, including two simultaneous drains, pending replacement, cancellation, recovery continuation and a write error after active-file replacement. The latter reads back the durable pointer and keeps runtime identity consistent while reporting a bounded write error. Store/credential tests are separate.
- Host tests cover real child IPC, Unicode paths, and separate trusted byte attachments with the same filename. This is not yet the remote CSV semantic oracle.
- Production Electron build passed. Resource staging now includes 4360 hashed files and excludes browser cache `.links` metadata. Node/browser executable hashes, runtime lock hash, installed MCP/Playwright versions and Chromium revision are checked at build time. Packaging DEB/AppImage is in progress; do not infer installation success from staging/build success.

## Current commands/evidence

- Pinned toolchains: `~/.cache/loginom-ai-agent/toolchain/bun-v1.3.14/bun-linux-x64`, `~/.cache/loginom-ai-agent/toolchain/node-v24.19.0-linux-x64/bin`.
- Resource build inputs: `LOGINOM_AI_AGENT_NODE_SOURCE` points to pinned Node; `LOGINOM_AI_AGENT_BROWSER_SOURCE=~/.cache/loginom-ai-agent/browsers`. Production builds use `LOGINOM_AI_AGENT_CHANNEL=prod`.
- Build log `/tmp/loginom-linux-build.log`; packaging log `/tmp/loginom-linux-package.log`; GUI log `/tmp/loginom-gui-smoke.log`; runtime log `/tmp/loginom-runtime-managed-tests.log`. Logs and GUI evidence are local and not release artifacts.
- GUI runner: `packages/desktop/test/loginom/gui-smoke.mjs`, run with pinned Node under `xvfb-run -a`; optional `LOGINOM_AI_AGENT_TEST_CONFIG` reads secrets privately and does not print them. Isolated test profile is removed afterward.
- Frozen source verifier: `python3 script/migration/verify_sources.py --map docs/migration/source-map.json --root . --transforms docs/migration/source-transforms.json`.

## Remaining gates

1. Durable crash recovery for ambiguous operations across a full app restart; main-port release/close versus in-flight request races; lifecycle integration tests. The current recovery map is memory-only.
2. Make Loginom catalog/admission failures isolate only Loginom functionality. Finish tool-result image/plugin integration and verify original-user attachment authority through the real backend path.
3. Test packaged DEB/AppImage, all five Docker OS targets non-root, native Ubuntu X11/Wayland. Docker exists; Ubuntu 22/26 image pulls have started; no matrix success claimed yet.
4. Real remote CSV A/B same-name separation, totals 55/101, save/reopen readback, cancellation/network/ambiguous-effect recovery.
5. Complete branding audit (remaining external-looking links, assets and experimental V2 CLI path), own CLI installation policy, licenses/source-availability/release manifest, artifact hash verification and own updater N→N+1 test. Default upstream updater remains disabled.
6. Update native Windows/macOS runbooks to match final paths/contracts. Native OS testing remains on the other machines as agreed.
7. Final package checks, secret scan and normal commits. No upstream publication, production deployment, old installation deletion or source-repo deletion has occurred.

The current tree is a working implementation, not an accepted Linux release. Existing user desktop/wrapper installations are untouched.

## Latest packaging/lifecycle checkpoint

- DEB and AppImage build completed successfully: `packages/desktop/dist/loginom-ai-agent-linux-amd64.deb` and `loginom-ai-agent-linux-x86_64.AppImage`. DEB metadata verified: package `loginom-ai-agent`, version `0.1.0`, amd64. These are local unsigned candidates, not published releases.
- Packaged `linux-unpacked/loginom-ai-agent` passed the actual first-launch GUI field test under Xvfb. The DEB's Ubuntu 22.04 image installation is in progress; image logs are `/tmp/loginom-docker-ubuntu22-build.log`.
- Main-port release during runtime startup now holds the generation through the eventual call result and rejects subsequent calls from the released run. Real MessageChannel regression test passes. Bun's promise rejection matcher blocked this particular MessagePort test; awaiting the rejection explicitly before assertion fixed the harness.
- Desktop connection/store/credentials/host-port and builder tests: 30 pass, 103 assertions. Backend typecheck passed after isolating Loginom catalog/admission failures and adding plugin hooks/image results. Desktop typecheck rerun after formatting.
- Package candidate binaries predate the latest host-port and backend tool-result changes. Rebuild before final artifact acceptance. Source formatting and new Docker smoke scripts also postdate those binaries.
- Ubuntu 22.04 and 26.04 Docker images pulled successfully. Offline non-root installed smoke test and Dockerfile are under `packages/desktop/test/loginom/docker/`; only Ubuntu 22 image build has started, no container smoke pass claimed yet.
- Private API key scan of all changed/new repository files passed. No secret value was printed.
