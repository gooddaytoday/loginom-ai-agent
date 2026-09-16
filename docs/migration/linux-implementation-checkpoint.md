# Linux implementation checkpoint — 2026-09-16

Implementation is ongoing, not release-ready. The active goal remains the approved Linux implementation. Branch `loginom`; existing commits include `d848db933` and `10ddfb0ee`. No push, production deployment, old installation removal or source-repository deletion has occurred.

## Implemented

- Imported 4951 active Dock files with source map, verified archive and documented transformations. Legacy integrations remain in the migration archive. Product identity, namespaces, config/environment paths, desktop UI, icons and installer metadata use Loginom AI Agent; external provider contracts and attribution are preserved.
- Shared first-launch wizard and accessible settings: key, default URL, username `user`, empty password without placeholder. Existing model/provider setup remains unchanged. Folder is derived from username; setup does not probe it.
- Main-owned private credentials and generation coordinator, whole-drain leases, separate recovery leases, private utility-backend MessagePort, trusted original-user byte attachments and isolated chat browsers. Linux credentials are plaintext 0600/0700. Windows/macOS native credential handling remains for native acceptance.
- Pending connection changes are now durable. Startup restores active/pending identity, reconciles an already-staged exact generation, and gates a pending switch behind recovered calls. A marker is fsynced before tool dispatch. Unconfirmed markers survive restart and require explicit acknowledgement in settings after the user checks the result; no business operation is replayed. Attempt directories preserve previous browser state and receipts rather than overwriting them. This is explicit recovery completion, not automatic reconstruction of a lost Dock session.
- Loginom authentication and the managed browser MCP share one live Playwright context via the public in-memory MCP connection. Closing/reopening a browser lost Loginom authentication; a second CDP client missed download events. Those approaches were removed. Current transport verifies uploaded bytes through the same browser context.
- Package-menu region discovery works even when a populated graph forces bounded roots discovery. Cold readback uses a separate acceptance-only execution/output reader without reapplying settings. Reconfiguring a cold existing Grouping node via empty parameters currently times out at input mapping and remains a documented limitation.
- Bundler includes pinned Node 24.19.0, MCP 0.0.80, Playwright 1.63.0-alpha-2026-08-31 and Chromium 1243, licenses and 4365 resource hashes. Build checks binary/lock/model-catalog hashes. A public models.dev snapshot is now frozen for desktop builds; provider connection behavior is unchanged. Runtime performs no npm/browser installation.
- DEB/AppImage metadata and dependencies include GBM/ALSA. Chromium's `chrome_sandbox` also has the expected `chrome-sandbox` name; afterPack restores mode 4755 for DEB root ownership. Own CI, source archive, strict release manifest and static extraction/hash checks have been added but the complete release workflow is not yet accepted.

## Verification performed

- Frozen source verifier: 4951 files PASS after the package-menu transformation.
- Imported runtime full suite before the latest menu discovery addition: 1951 PASS, 1 skip. Updated workspace UI suite: 274 PASS (113.6 s), including menu discovery regression.
- Latest desktop coordinator/store/credentials/MessagePort/builder/static-resource tests: 42 PASS, 150 assertions (including updater controller disabled-feed tests). Desktop/app typecheck PASS. Earlier backend/config checks: 250 PASS, 3 skip; UI identity tests: 45 PASS; core/backend/schema/host typechecks passed at their implementation checkpoints.
- Real Electron/Xvfb: four fields and defaults, real Loginom check/save, safe IPC readback, plaintext/0600, restart without repeating wizard — PASS again after durable recovery changes.
- Native protocol checks in isolated headless Weston on Ubuntu 22.04: Electron first-launch UI PASS; headed managed Chromium authentication/prepare/trusted attachment PASS with DISPLAY unset and Wayland selected. This is not physical GNOME/KDE/GPU acceptance.
- Real CSV A and B have individually produced Alpha35/Beta20 = 55 and Alpha100/Beta1 = 101 and saved their unique packages. A has now passed independent cold reopening, exact numeric readback and owned-package cleanup. B and the combined oracle now PASS: both independent cold readers verified exact totals 55 and 101, without reapplying settings. Evidence: `/tmp/loginom-linux-oracle-Kp7heo/summary.json`.
- First installed Ubuntu22 DEB failed offline browser launch because libasound.so.2 was absent. Dependencies were corrected. The corrected DEB passed a clean Ubuntu22 install and offline non-root Chromium/Electron launch with sandbox enabled. Artifact SHA256: 33df41f7c90d00e657d2b479c099b32901786e7c9d0192df2564710933675972. Corrected Ubuntu24/26 and Debian12/13 images are building. Old candidates installed in all five OS images, but only Ubuntu22 was launched before the dependency correction.
- Runtime parent SIGKILL: all 12 tracked processes terminated, no live browser/runtime descendants after parent IPC loss. This covers an idle authenticated runtime, not every in-flight mutation crash. Reproducible Linux test: `packages/desktop/test/loginom/parent-crash.ts`.
- Follow-up branding audit corrected model system prompts, project avatars, support/docs links, Vite environment names and unused CLI installation IPC. Upstream release highlights are disabled until a separate Loginom changelog feed is configured. External provider API contracts remain unchanged.
- Secret scan: private API key absent from all changed/new repository files. `git diff --check` passed.

## Current evidence and commands

Pinned PATH entries: `~/.cache/loginom-ai-agent/toolchain/bun-v1.3.14/bun-linux-x64` and `~/.cache/loginom-ai-agent/toolchain/node-v24.19.0-linux-x64/bin`. Build inputs use LOGINOM_AI_AGENT_NODE_SOURCE and LOGINOM_AI_AGENT_BROWSER_SOURCE; channel prod. System toolchains are unchanged.

- `/tmp/loginom-gui-smoke.log`: current real GUI save/restart PASS.
- `/tmp/loginom-wayland-headed-runtime.log`: actual headed Wayland runtime PASS. An earlier similarly named log without `headed` was a headless check and is not Wayland browser evidence.
- `/tmp/loginom-workspace-ui-tests.log`, `/tmp/loginom-desktop-tests.log`, `/tmp/loginom-desktop-typecheck.log`.
- `/tmp/loginom-runtime-acceptance.log`: latest combined oracle; private evidence directory printed there. Earlier independent reader `/tmp/loginom-independent-cold-A-01` discovered saved viewer column order Total/Category, then failed before cleanup; subsequent same-package attempt was read-only. Fresh unique tests now match known columns by identity and retain exact numeric checks.
- `/tmp/loginom-linux-matrix/linux-matrix.json`: Ubuntu22 PASS. Other targets use `/tmp/loginom-linux-matrix-<target>/`. Runner `test/loginom/docker/run-matrix.ts` records artifact SHA and per-OS build/smoke logs. Use `--init`: Xvfb cannot complete its readiness signal when its wrapper is PID 1. Test seccomp/AppArmor exceptions keep Chromium sandbox enabled.
- `dist/*.deb` / `dist/*.AppImage` are unsigned local candidates. They currently predate the latest MCP timeout adjustment and frozen model snapshot. Rebuild before final static verification/acceptance.

See `docs/testing/loginom-ai-agent/linux.md` for reproducible commands and `README.md`, `windows.md`, `macos.md` for native handoff.

## Remaining gates

1. A/B save/cold-reopen oracle is complete. Preserve every failed/ambiguous receipt and do not retry unknown mutations blindly. Test explicit cancel/network interruption and additional process-crash behavior in addition to persisted-marker tests.
2. Finish all five corrected non-root/offline Docker launches, installed AppImage, and final artifact static verification. Rebuild artifacts from the final committed source and emit the corresponding source archive and release manifest.
3. Verify generation recovery through full app/backend lifecycle, shutdown/orphan cleanup, and original-user attachment authority through the full backend path. Current unit/GUI checks do not replace every lifecycle failure injection.
4. Own updater N→N+1/corrupt-payload test remains open; default feed is disabled. Audit remaining active branding/CLI policy. Main now explicitly forwards its compiled channel to the backend so core channel-specific paths also isolate dev/beta data. Do not infer update installation from an up-to-date response.
5. Final documentation/report consolidation, hashes, commits and regression checks. Windows/macOS execution remains explicitly delegated to other machines, not tested here.


## Late checkpoint: completed functional acceptance

The active Linux goal continues through final artifact and distribution verification. Code commits now include `5319db7f5`, `72808f39c`, `f39c23daf`, and `1d419007a`; the pending final code change renames the backend log to `loginom-ai-agent.log`. Production update and changelog feeds remain disabled. Root README now describes Loginom; upstream README translations are archived under `docs/upstream`.

Additional verified results:

- Real persistent desktop profile (no TEST_ONBOARDING/in-memory database): save Loginom connection, SIGKILL the actual main application and restart without repeating the wizard — PASS (`/tmp/loginom-installed-crash.log`).
- In-flight `dock_prepare` interrupt: cancellation observed, runtime still answers its catalog, no automatic replay — PASS (`/tmp/loginom-cancel-smoke.log`, evidence `/tmp/loginom-cancel-NQXDwe`).
- An authenticated runtime in its own Docker container lost its network before a prepare call. The single call returned a safe unavailable-server tool error, `recoveryPending: false`, with no replay (`/tmp/loginom-network-container/outcome.json`). An earlier localhost-proxy experiment failed during startup and is not counted as acceptance.
- Actual backend SessionTools boundary: latest original-user data bytes admitted, assistant-generated bytes and file URLs excluded, model-supplied message identity cannot replace the bound original ID; failed admission leaves ordinary tools available. Three tests PASS, backend typecheck PASS (`/tmp/loginom-backend-tools-final.log`).
- Own-update policy rejects foreign targets, missing hashes and mismatched release channels. Real isolated AppImage fixtures passed 0.1.0 → 0.1.1 through the application's updater, including corrupt SHA512 rejection, upstream URL rejection, stable/beta separation, automatic relaunch, preserved settings and a persisted chat message admitted with no model execution. Canonical test: `packages/desktop/test/loginom/updater/acceptance.mjs`; successful log `/tmp/loginom-updater-canonical.log`, report `/tmp/loginom-updater-fixture/report.json`. Earlier harness cleanup failures are not successful complete runs. Production artifacts were not patched for this test.
- Core observability: five tests PASS after correcting stale upstream telemetry expectations and renaming the backend journal (`/tmp/loginom-observability-final.log`).
- AppImage launch and static verification of both DEB/AppImage passed for code `72808f39c`. Its DEB hash was `c23d4dda4f107cd03ff4e8419730be1dea69e28624cd90cbb2572fb6cbc802fb`; it also passed an offline Ubuntu22 reinstall into a temporary `/opt` filesystem as UID1200 with Chromium sandbox enabled (`/tmp/loginom-final-ubuntu22-tmpfs.log`). These artifacts have subsequently been replaced during final packaging; do not treat that hash as the final artifact.

Four corrected baseline Docker builds (Ubuntu24/26 and Debian12/13) reached image export. They install the earlier corrected candidate SHA `33df41f7c90d00e657d2b479c099b32901786e7c9d0192df2564710933675972`; they do not yet prove final-payload launches. Docker HDD installation/export is very slow. Ubuntu22 clean install already passed. Keep baseline and final payload evidence distinct in the final report.

Remaining required work is final packaging/static hashes from the final committed source, collecting the five-OS launch evidence with the final payload, and final report consolidation. Windows/macOS and physical GNOME/KDE/GPU acceptance are explicitly outside this machine's completed checks. A cold existing Grouping node with empty apply parameters still has the previously documented input-mapping limitation; the independent saved-graph readback does not reconfigure it.
