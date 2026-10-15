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

## Frozen deployment after reboot

Harness708c72ebce60690d91d1b51137974bd6aa123209: typecheck PASS, full suite788PASS/0FAIL,4070assertions,61files,551.50s. No skipped Docker/sandbox fixtures. Log SHA is recorded in R/evidence/acceptance-ready.json. Gate opened only after successful process exit and repeated prepare check.

New judge live qualification on saved positive calc artifact: gpt-6-sol/xhigh, Codex0.159.3,100/PASS, no product model calls. Prompt/schema hashes and result in R/evidence/judge-qualification.json.

Reboot accepted: all5services active, unchanged2container IDs,HTTP200,standFREE. Both existing Codex/Cursor runtimes registered automatically; Cursor cold version detection timed out once and native discovery retried successfully after2minutes. Source/current provider/auth paths and old agent settings preserved.

## Agent memory transport recovery

First LAB76 management task01a13f5c-0cf0-7ba2-bcbc-12b321c69289 stopped before prepare/admission: MCPhealthPASS,actorfind hit15s. Original BLOCKED receipt/checkpoint retained with task ID. Installed doctor confirmed auth/systemstatus/fs/MCP list/ready all healthy; health network latency7.99s. Hook/install warnings are expected for this explicitly configured scripts-only stdio adapter, which does not install global hooks.

The exact read-only actor query passed through the same wrapper with60s request budget. Own agent MCP config now sets OPENVIKING_TIMEOUT_MS60000, tool_timeout_sec120/startup_timeout_sec60; no global memory/config/server changes. Agent must reconfirm actual health/find before product. No product attempt was consumed by the memory incident.

## First live smoke

calc-data-double: one admitted attempt, infraRetries0, completed221498ms, judge100/PASS, cleanup/history/RELEASED confirmed. Exact Session ses_ec097f426ffebJyB9b9ofWJYJ6: independent copy of closed SQLite verifies all11assistant messages openai/gpt-6.1-sol/medium; raw DB(+sidecars) source hashes unchanged. Independent release check verifies88sealed evidence files. Node smoke admitted only after this release.

Calc curated delivery: attachment01a13f6d-f4a4-77eb-979c-fd5ab79e731c, SHA25664fe0314d6891cc1ba7ad48a6ab8639e2b85dfe19a5a54d712ebe7c161373af7. Agent upload→download→verify confirmed; operator additionally downloads and verifies independently. No env/auth/history/rawlogs in archive.

Multica CLI produced explicit TLS handshake failures locally and in agent task, resolved by its recommended GODEBUG=tlsmlkem=0. This is set in EvalRunner custom env and daemon runtime.env; the environment was applied at an empty queue after delivery. Product/Judge env pins are unchanged.

## Node smoke and retained blocker

crosstable-fixed-sum consumed exactly one attempt: Session ses_ec09225a4ffepOXfUoLJr5JIlS, failed/recovery616s, LOGINOM_RECOVERY_REQUIRED, no package, node codeERROR2. Export operation export-result completed execution but could not confirm native download; AMBIGUOUS/effect_possible, no permitted recovery action. No measurement was retried.

After product processes closed with2zero-remaining passes, management loginom status hit a writer acquisition observation race. Original cleanup stayedfailed and no RELEASED was written; stand lease/admission retained. TDD RED reproduced exact Writer owner identity changed during release; fix4a0835c1b91a642612e000794bfce72d65bcabc7 distinguishes initial bounded owner creation from replacement of an observed owner. Both profile/supervisor files77PASS/0FAIL,241assertions,133.29s; new test5/5repeats PASS; typecheckPASS.

Original series/profile/global lease/config/gate copied privately to R/operations/incidents/lab76-node-20261015. Before retiring the exact stale process-group marker, privileged full/proc scans twice found no profile/bundled executable references. Marker UID/mode/dev/inode/hash/PID checked; no signals sent. Container UserStorage/SessionBackup captured before cleanup. A copy of pre-recovery closed SQLite verifies all20assistant model records openai/gpt-6.1-sol/medium with unchanged source hashes.

Operator native recovery acknowledged existing recovery and passed status checks, but native check observed a separate short-lived pre-exec Bun→bwrap identity transition and failed closed (PID33781). Its failed receipt and exact marker are retained separately; two new privileged scans verify no remaining processes. This launch observation race is not treated as a successful ownership proof. A bounded native check after operator retirement is permitted; product smoke retry remains forbidden.

Operator cleanup subsequently confirmed at12:22:14Z without model calls: native checkPASS, profile history archived at eval-profile.history/operator-recovery-lab76-node-XCtR9u, own marked storage emptied. Logical original stand lease/admissions remain intentionallyBLOCKED. Source snapshots and failed receipts were not rewritten. Active checkout/config advanced to tested writerfix4a0835c1b9 only after the failed cohort closed; original measurement SHA remains708c72ebce in raw pins/manifests.

Node BLOCKED diagnostic delivery: attachment01a13f85-e812-7122-b5d9-a9d79bd368cb, SHA2562664c726b2e77a1c6b12b109ac017b958c8de1752b676ab8f617c91850cd42e1. Independent download verifies8curated files; manifest kind evalrunner-blocked-diagnostic, statusBLOCKED/releasefalse. It is not a regular released measurement archive. Env/auth/profileDB/rawtool logs excluded.

Final daemon restart at empty queues applied GODEBUG=tlsmlkem=0, confirmed in the running process environment; both original runtime IDs online afterward. Neither product/Judge env pins nor old agent settings changed.

## Narrowed writer acquisition boundary

Full suite on intermediate4a0835c1b9 exposed two missed negative cases: replaced owner and owner-symlink (787PASS/2FAIL,4069assertions,789tests/61files,539.01s). The overbroad first fix was not accepted as final. Original failed log preserved as R/evidence/full-tests-postfix.log.

Fix7abcba27174d5c90fa937499d0ee1c5297f81011 restores strict writerIdentity default. Bounded initial creation observation requires initial absence, a live exact owned CLI, no previous captured writer, a private/current-UID directory born after the timestamp immediately before spawn. New negative test rejects a pre-dispatch directory. Replacement/symlink/EACCES and cleanup guards remain strict. Target fullCLI/stand/sandbox/nativecheck passed with confirmed cleanup and archived history, without model calls; final full suite runs separately in R/evidence/full-tests-scoped-writer.log. Measured cohort pins remain unchanged.

Final code7abc full suite: **790PASS/0FAIL,4072assertions,790tests/61files,539.85s**, typecheckPASS. Log R/evidence/full-tests-scoped-writer.log SHA256 `147eabee03afdbb7923bd9fbad74b9b0eee11e9a0cb7bcb3083983fb60d2550c`. Exact final targeted snapshot88PASS/0FAIL,259assertions,138.65s; acquisition5/5PASS. Final documentation deploy changes only the four evalrun Markdown files; runtime.json records its clean checkout SHA and original measured pins stay708c.

After tests, unused installation archives/bundles, test fixture directories and the duplicate recovery worktree were removed after process/FD checks. Keep R/evidence/final-temp-cleanup.json and recovery-worktree-cleanup.json as cleanup receipts; current profiles/auth/providers, original product evidence/history, incident copies, logical stand lease and admissions remain. Operator-local fixture/import copies were also removed after two no-reference passes; logs and independently downloaded delivery archives retained.
