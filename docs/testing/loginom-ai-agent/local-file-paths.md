# Local file paths #74 — evidence

## Task 1: native upload completion probe, 2026-10-21

Source `34cb53ba7b`; independent approach and final evidence reviews: Approved. No product changes or model calls.
Evidence/scripts: `/home/kiselev/storage/tmp/local-paths-74-ptufs123/`; this is a direct source probe, not installed acceptance.
Dedicated no-mount Docker pair, IDs in `stand.json`, origin `http://127.0.0.1:32773/app/`, account `user`, Loginom 7.4.2.
Studio `wsproxy: auto` initially selected the shared port 8080; detected before any upload, logged out, changed only the new Studio to `wsproxy: true`.
`reconnect.json` confirms only `ws://127.0.0.1:32773/app/ws/`; shared server/configuration unchanged.
Pinned Node 24.19.0 / Playwright 1.64.0-alpha-1789764292000 / Chromium 1246; Node/browser SHA match `packages/product/loginom-release.json`.
A: `skills-cold/sales.lgp`, 10157 bytes, SHA `ad9e8e3b8e63597d724a26fc88f1fa17dc0c9b396ada0624a2756d13238b3790`.
B: `analytic/holiday-month-sales/reference.lgp`, 9950 bytes, SHA `864834e57e438383aa7d3bf1a3950c89e30253cd2ad44b5544d132998182ea86`.

### Sufficient native predicates

- Before submission: retained document/card/form/sender/input/grid/store, exact origin/build/account/directory, idle sender, destination absent, baseline `store.loadCount`.
- Reuse artifact admission, staged upload lease/verification and the unchanged `makeArtifactUploadCode` body; its original AMBIGUOUS receipt remains in evidence.
- Completion: same retained owner; input empty; active loaders zero; no pending upload paths or conflict; store idle, complete, unbuffered, `loadCount >= baseline + 1`; no visible masks/dialogs.
- Exactly one native file record: `Type=0`, `FileName`, `FilePath=id=destination`, `Size=expected bytes`; fresh UI row agrees with `storage_entry.bytes_source=native_file_store`. No size-text parser or download.
- Open only the confirmed destination, using `prepareWorkspaceSession` + `makeWorkspacePrepareCode`, then the existing geometry reader in the same context.

### Measurements and controls

- A: upload 150 ms, upload plus fresh row 257 ms; return to home/open 1762 ms; geometry 4 ms (`upload-a.json`, `open-a.json`). Manual gaps are excluded; no continuous A total is claimed.
- Continuous A → B: binding/Files 542 ms, upload 163 ms, upload plus row 296 ms, return to A 82 ms, open 802 ms, geometry 2 ms; total **1915 ms** (`route-b.json`).
- B has a new operation/workflow ID in the same document; metadata changes `workspaceReady: false → true`, B's exact path is verified, preserved A graph is unchanged. No second browser/context or draft.
- Paused only the owned server during another upload: input still contains a file, no destination row, completion pending; after unpause the new generation/exact row completes (`while-paused.json`, `delayed.json`). No resubmission.
- Conflict: current upload code returns `UPLOAD_DECISION_UNKNOWN` after earlier dialogs because it hardcodes `msgbox`; the observed conflict was `msgbox-1`. The unchanged refusal is retained in `conflict-receipt.json`.
- Task-local binding of the existing conflict helper to that exact observed prefix confirmed `reject`, idle sender and unchanged destination size, without overwrite (`reject-observed-conflict.json`). Product conflict handling is not yet fixed or certified.
- Negative fixture `calc-data-double/reference.lgp` is 7.5, not 7.4.2: native open refusal retained; its owned package was closed/discarded. The successful B control used the accepted 7.4.2 fixture, with a fresh harness observation state; this does not prove product recovery after open failure.

### Decision and implementation implications

Read-only completion is feasible; neither control download nor draft/delivery fallback is needed. Source SHA describes admitted bytes, not a downloaded server copy.
Current open helper waits for home/graph and times out from Files (`workspace_entry_ready`, effect=false). Restore the confirmed entry tab or admit the specifically bound Files surface before existing open; cover this in task 3.
Also cover the observed conflict-dialog suffix in the shared upload/conflict boundary. Preserve all existing owner, dialog-content and reject guards.
Measured route fits 105 s runtime / ~120 s Host / >=180 s adapter; these small local fixtures do not prove worst-case latency. Task 3 must retain a coherent overall deadline.
Downloads: **0**. Local source hashes unchanged. Owned temporary packages closed with diagnostic discard, logout SUCCEEDED; browser disconnected and upload leases released (`cleanup.json`).
`stand-cleanup.json` records zero browser processes and removal of only the created no-mount containers/network; existing stands were retained.

## Task 2: local data admission and early source CLI, 2026-10-21

Evidence: `local-paths-74-ptufs123/early-smoke/` under the same task temp. Source `1f52de3d58` plus recorded dirty patch/untracked hashes; dev bundle manifest `89719f65bc057dec341a13b716e5f21920c627cad3ff5d7c357957245088e5ee`. This is source smoke, not installed acceptance.
TDD covers 16 MiB/default 10 MiB, canonical snapshots, attachments/deny, filesystem and all permission refusal kinds, identities/hooks, multiple sources and copy names. Latest agent checks: 22 tests/152 assertions plus 24 docs tests/92 assertions; Host: 40 tests/319 assertions. Agent/Host typechecks passed; independent code review Approved.
Real CLI: `run --auto`, `openai/gpt-6.1-sol/xhigh`, 634.6 s; DB confirms model/variant and zero user file parts. Standard `models --refresh` supplied the catalog; initial missing-catalog/model launch failures remain in evidence.
Two external paths with spaces/Cyrillic and equal `sales.csv` basenames produced distinct admissions and verified deliveries. Actual owned-server bytes match both sources; saved `Unit.xml` imports exactly their destinations. Exported CSV equals the independent oracle: Alpha=17, Beta=20, Gamma=5 (`verification.json`, `result.csv`, `result.lgp`).
Separate registration of the missing path returned `NotFound: FileSystem.realPath` with its full path and no attachment hint; no file was created. Both original CSV hashes are unchanged. CLI exit 0, runtime closed ACK/exit 0, successful profile guard absent.
Isolation failure retained: Studio entrypoint overwrote an early `wsproxy:true` with `auto`; the first model attempt reached shared port 8080 and was cancelled. Only its two exact SHA-confirmed own CSV copies were removed. Native cleanup was unconfirmed; its guard/evidence remain, not a cleanup PASS.
After entrypoint completion, served `server.json` was verified; successful retry sockets used only owned Studio port 32774, never 8080, and physical inputs/results were verified in the owned server. After capture, no owned Bun/Node/Chromium remained; only the created no-mount containers/network were removed (`stand-cleanup.json`).

## Task 3: private local package prepare, 2026-10-21

Source `324b00c618` plus task patch; evidence in `local-paths-74-ptufs123/task3-native-v2/`. The earlier `task3-native/` run is retained before the final navigation deadline correction. Both are source private IPC checks, not installed acceptance or model evaluations.
Backend authorizes/snapshots the real path after hooks and forwards private bytes; Host admits one artifact/grant outside MCP arguments. Public MCP cannot supply a local path or the private completion option. BOUND observes the real authenticated document/account without a draft or READY. Native completion retains its pre-upload objects, exact fresh FileStore row/size and original AMBIGUOUS upload receipt; durable completion and lease cleanup precede opening. Ordinary data delivery still verifies downloaded bytes.
TDD covers attachment/deny through prepare, invalid scopes/sources, staging cancellation, native missing/wrong row, changed owner/sender/generation, conflict `msgbox[-N]`, unknown submission, journal/cleanup refusal and cancellation before Open. Known no-effect open failure permits a new explicit package; server-path continuation keeps the original operation ID and uploads nothing. Unknown open reconciles its receipt without another Open; unknown upload supplies no server-path hint.
The private route uses 100 s within the existing 105 s runtime / 120 s Host / >=180 s adapter. Reads, pagination, navigation, input selection, sender/conflict settlement and native gestures consume the original remainder. RED tests observed fixed 35 s transport and a late click; GREEN tests bound them to 250 ms and refuse the late gesture without effect. Mutation transport retains original receipt/uncertainty handling.
Checks: agent 592 tests/1530 assertions; Host 38 tests/361 assertions; named runtime 219 tests, full UI/artifact regression 503 tests (overlapping suites), entry/timeout 8 tests. All passed with pinned Node; current agent/Host typechecks and diff check passed. Independent approach/final code review: Approved after no-effect continuation and deadline fixes.
Native v2 A: 6867 ms; B in the same runtime: 6338 ms. Both exact server paths opened under distinct operation/workflow IDs in the same document, with A's graph unchanged. Server files were independently located in the owned no-mount container and their hashes match original sources; local sources are unchanged. No runtime control download or second browser/context was introduced. Runtime ACK/exit 0 and owned stand removal are recorded in `runtime-cleanup.json` and `stand-cleanup.json`.
All 13 changed imported files pass targeted attribution verification; immutable source-map is unchanged. Full `verify_sources.py` stops at the pre-existing `client/README.md` mismatch, also proved at HEAD: expected `c80b3a06…`, actual `1c5fdc7b…`. This unrelated baseline is retained. Tasks 4–8, including skill default save and installed/model acceptance, remain open.

## Task 4: skill instructions and profile boundaries, 2026-10-21

Source `4922c79691`; independent instruction/fixture review: Approved. Automation describes local prepare, re-registration after prepare, default Save/replace only into its own opened upload copy and the full server path/local-unchanged report. Package-docs retains local-source/no-automatic-download behavior and the shared permission/error rules. Only obsolete attachment-only Host guidance changed; bootstrap/profile algorithms needed no changes.
Final agent regression: **179 pass, 1 existing skip, 0 fail, 969 assertions** across profile-tools, task-scope, prompt, package-docs tool/CLI permissions and bundled-skills (155.25 s). Host task-scope: **17 pass, 110 assertions**; agent typecheck and diff check passed. These are source checks; model/default-save and installed acceptance remain tasks 7–8.
The first run omitted pinned Node; after correcting the invocation, one stable fixture failure remained. Its non-Git root scanned real ancestor skills under TMPDIR in the user's home (62 directories instead of 3). Adding the existing `{git:true}` option only to the realpath-dedup fixture isolates its root; all original assertions are retained. Narrow RED→GREEN and the full regression confirm the fix. No product algorithm was changed to accommodate the test.
Task 4 diff against `1df187237d`: **8 files, +71/−38**, including tests/documentation; below the original 14-file/270-line review signal. Logs: `task4-agent-tests[-v2|-final].log`, `task4-host-tests.log` under the task temp root. Final command uses `TMPDIR=/home/kiselev/storage/tmp` and pinned `LOGINOM_AI_AGENT_TEST_NODE=/opt/loginom-ai-agent-cli/0.3.2/resources/loginom/bin/node`.
