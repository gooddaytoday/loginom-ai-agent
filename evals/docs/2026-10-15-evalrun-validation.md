# Evalrun: validation and recovery evidence

## Harness and timing fixtures

Initial unit run: 724 PASS, 3 SKIP, 2 FAIL (729 tests, 597s). Both failures were integration fixture timing, with no observed assertion mismatch:
- transition exit3 cleanup: FAIL5.016s / PASS4.887s / FAIL5.000s; explicit20s integration budget replaces generic5s.
- node-selection empty stdout SQLite fixture: PASS4.608s / FAIL7.257s / FAIL5.133s; fixture writes now one transaction.
Five repeats of each after changes: 10 PASS, 0 FAIL (39.38s).

First complete suite on evalrun/6708e2b0f5: 786 PASS, 1 FAIL, 4068 assertions, 787 tests/61files,588.78s; typecheck PASS.
Only failure: first isolated-storage integration test hit20.000s. Exact independent repeat passed3.678s with all8assertions; both temporary containers destroyed. Existing logs cannot identify the original slow Docker operation. Its fixture budget is now60s; production guards/assertions are unchanged. Other8 Docker integration fixtures passed.

Additional targeted checks: config/CLI/sandbox/standalone76PASS; real fake-CLI zero infra retry dispatch PASS; process-supervisor20PASS, including unknown/foreign helper refusal; standalone evidence/archive5PASS and typecheck PASS.

## Native qualification and operator recovery

CLI0.2.0 full6015-file manifest verified: bytes, modes, symlinks; exact version/source and bundled runtime/browser. bwrap/AppArmor, isolated Loginom7.4.2/Python-disabled config, own storage, native check and profile/history gates qualified without product model inference.

First native browser check left an unexplained helper observation because transient children appeared between /proc samples after parent exit. Cleanup failed closed. The original failed receipt remains at `roles/evalrunner/work/native-check/1792062465296-d4c73f69-14ed-47ac-aab0-77cbe9f7acae/cleanup.json`.
Operator independently verified exact private launcher capsule, two privileged /proc passes, all birth identities, and exact writer-marker inode/hash. No process remained, no signal was sent. Recovery proof: `roles/evalrunner/work/qualification-recovery.json`; only the proven stale marker was retired. Product attempts=0.

Fix6708e2b0f5 adds private PID namespace ownership proof for declared browser/helper executables, after a bound root browser, with birth/executable/namespace checks. Names and process groups alone remain insufficient. Unknown/foreign executables still fail closed. Subsequent native check exit0, cleanup confirmed, history archived at `eval-profile.history/evalrun-qualification-8EI9u2`.

## Independent offline replay

Copied114 closed files read-only from eval-tests; source/copy paths and every SHA256 remain private in operator `positive-copy.json`.
- calc-data-double saved positive verdict: current scorer100/PASS, all7items. This replays original judge output; no new judge inference.
- crosstable-fixed-sum saved positive package/events/results/cleanup: current full code validator PASS, errors/failures empty.
Target receipt `R/evidence/positive-replay.json`, product model calls=0. New gpt-6-sol/xhigh judge quality is not calibrated by this replay.

## Storage cleanup

No active/queued task for preserved agents or EvalRunner. No process cwd/exe/FD into removed paths; maintenance Git clones clean. Removed old task workspaces, LAB23 maintenance artifacts, Bun/npm caches, Codex temporary/cache trees and two previous installation backups (2447732KiB). Removed five unused managed Codex releases after config/symlink/maps/FD checks (2189216KiB). Preserved standalone0.159.3, managed0.162.1, Cursor, auth/settings and registration. Receipts `R/evidence/obsolete-cleanup.json`, `obsolete-releases.json`.
