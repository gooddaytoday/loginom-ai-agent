# LAB57 Ben owned cleanup — PREPARED / NOT_APPLIED

This is a nonmodel proposal for the existing review cycle 2, not a third review,
an admission, or an operational pin. Parent support is
`0fd20f7c7e36724ca78a58bb8f9085b78884a87b`; frozen author remains
`eb1c2b0da02210a9d95569849ae056fa4784440c`. Only added proposal policy,
filesystem primitives, fixtures, tests and this document are changed.
The helper, supervisor, author/checker/oracle/inputs/validator, CLI d6, skill,
role settings and installed support remain unchanged.

## Delivered interface and present decision

`script/prepare-lab57-owned-cleanup.ts <private-input.json>` evaluates an offline
snapshot and returns PREPARED, applied=false and exact missing prerequisites.
It has no apply switch. It does not import or register a node-eval-ops command.
`src/lab57-record-archive.ts` implements separately tested filesystem primitives;
these confer no resource ownership or cleanup admission. They are not invoked
on real resources, and must not be called as an ad hoc operator bypass.

Current report is **NOT_READY** for a real cleanup command. The original
31-process capture proves launcher PID 2133627 / birth 99242764 and records
parent PID 2126565. Its launcher origin explicitly has null parent PID/birth
fields, and no captured identity is the outer harness process. Current original
guard owner records PID 2126565 / birth 99114278 / UID 1000. Those observations
match by PID, but the capture does not independently bind the parent's birth.
An original harness admission receipt was not requested by the legacy boundary.
Current owner bytes are preserved; they are not rewritten into such a receipt.

The policy conservatively requires a separately preserved original parent
birth/source record before this exceptional guard retirement is eligible.
This is a proposal choice, not a claim that an additional receipt existed.
If the coordinator can establish an equivalent closed binding from other
immutable original records, that attestation and its validation must be reviewed
explicitly. A newly written declaration or PID absence cannot fill the gap.
The delivered search examined all original run JSON/JSONL/receipts in Ben's
owned execution roots; it found the parent PID, not such a parent birth capture.

There is also no genuine proof that all of the original session's server
operations have ceased. Terminal exit, completed node.apply receipts and absence
of a package lock do not establish server session logout/cessation. Guard
archival and CSV cleanup remain gated on a separately verified eligible
cessation/recovery proof. Fresh full operational guards must be collected again
immediately before any later action. No missing receipt is synthesized here.

## Closed identities

The offline policy binds these identities and exact five original byte hashes:

| Record | Required binding |
|---|---|
| Original owner | issue `01a1214a-fcf8-7e0c-8c1c-f5dd600180b3`, task `01a1375d-ce4a-7c35-a3a3-94cf64a8b589`, Ben/eval/eb1 |
| Lease directory | device/inode 64512/17837096; acquiredAt `2026-10-13T22:28:17.228Z` |
| Config digest | `d20475fc9ef2e273b6098943c810886f5f2af580bd76ba82d739022594f84981` |
| Raw owner hash | `7d343a0f13f97506770e08a24e10f2d3360c88754dfd7184776cef4508b0be64` |
| Raw private config hash | `ffbc373a557e0156a4726874d424a330922286545310bb0e0cd9b12863646b35` |
| Endpoint/container | `http://localhost/app/`; `b030b7bc86873b473f5d77d90132b82d3a4d15e993074929939c099748e3918e` |
| Original run | `20261013-225027-eb1c2b0da`; `txt-semicolon-cp1251-decimal/1` |
| Session | `ses_ec8768439ffevZMaARGaKwMSzf` |
| Package | `/user/eval-20261013-225027-eb1c2b0da-txt-semicolon-cp1251-decimal-1.lgp` |
| Cleanup bytes | `1ef7a1544f4a779bcf9648300a3afa081953cf2eaa7ecda90c35769fb31862f1` |
| Original result bytes | `2b40770b25b69bf2357ed6a534161dfcfa155c9391c746fc4047e5cef96eb712` |
| Terminal bytes | `05c608dd9e55b63273f4c4a3fe89b9dd1c0eb5d593742e09e128bbbe36c8c197` |
| Whole summary bytes | `93a750552ae7bfb97697e7e4563f1fd1b0ee046ca4a3018048bb632386985058` |
| Code verdict bytes | `b832669145a229999b39d02f293a2e0300ea9466c7e4beae6bbdcae5a2c2bf10` |

The actual registration is the **sibling** `<profile>.process-group`, not
`<profile>/.process-group`. Device/inode 64512/3710822, 0600, UID1000, seven bytes
`2133627`, hash `f03f26330addd250ebebfc615ffb52350ba77aba21b95bc94ce93344dc27a0a9`.
mtimeNs/ctimeNs are both `1791933110497611176`. The earlier incorrect checkpoint
is retained, with this correction recorded separately.

Legacy sibling `<profile>.harness-lease`: 64512/3840909, 0700, UID1000;
owner.json: 64512/3840913, 0600, 96 bytes, hash
`f3d323b799d38e4a1ebe1ad901bf69a08e572479674cc94d6f1751642ea87106`.
Both records' mtimeNs/ctimeNs are `1791931825725205266`.
Raw owner nonce and common lease token stay private.

Only remaining known storage file is
`cc6187e46829a5fa768f09eeb024367d745628a1d10f46f26a0ec5543f76c997-0-semicolon_cp1251_decimal.txt`:
identity `58:1179775:150:81a4`, hash
`94821af546f6454601f5338d6fe32b8bf7a85bf7208b34df2bc522e55e2ab4dd`.
The previously observed empty owned `.lgp.lck` is now absent. Its disappearance
cause is UNKNOWN. No coordinator or Ben mutation is claimed. It requires no
deletion, and must not be added to a fabricated removed-files ledger.

## Why existing exception paths are ineligible

`writerIdentity()` calls `observeWriterRelease()` only for an ENOENT owner race.
The latter checks the same original writer directory and throws
`Writer owner identity changed during release` when owner is observed again.
That deeper owner event was not captured. It remains UNKNOWN; these checks
cannot retrospectively reconstruct an owner trace or declare it benign.

The unchanged `settleNodeWriterRelease()` and
`observeWriterReleaseSettlement()` accept only `Writer owner unavailable`.
This source has a different error and an empty stages array. It is not edited,
coerced, retried or passed to that command. The LAB31 continuation is also
bound to another issue/owner/incident and cannot be reused here.
Generic `retireRecordedHarnessLease()` requires the genuine original harness
admission receipt; no replacement is generated.

## Proposed operator sequence and STOP boundaries

1. Prefer a genuine existing completion covering the **latest whole stage**.
   Validate its immutable source, actual complete cleanup/history/storage and
   freshness with the installed helper. None presently qualifies: original
   product is ERROR; earlier successful cold/unit proofs predate that run.
2. Coordinator reviews this exact proposal commit/patch/manifest. No pin is
   changed here. Before adopting a live exception, resolve the original parent
   binding and specify/verify a closed server-cessation route. If either cannot
   be established safely, return NOT_READY with that binding and stop. Current
   source does not expose an executable cleanup command; adoption alone is not
   implementation of a live route.
3. Any future implementation must be a separate closed helper operation for
   this owner/source/registration/guard, not an expanded generic allowlist.
   Bind its private admission to original result/run/session/summary, config,
   source CLI executable/device/inode, all raw current records and full pending
   profile/history inventory. Preserve original failures and missing evidence.
4. Under the original lease and helper operation guard, collect all queues
   excluding the current operator, exact running container/no host mounts,
   six profiles and all foreign markers, full captured ancestry plus two fresh
   full `/proc` passes, relevant FD/browsers/debuggers and exact full storage.
   Source capture and present absence are distinct proofs. Live/reused PIDs,
   inaccessible/unknown relevant identities, foreign objects, alias/symlink,
   source/owner/config/container/path/byte/device/inode/ctime mismatch => STOP.
   Recheck immediately before each mutation; cached observations do not admit it.
5. Reserve the **one unspent original recovery**, through the pinned supported
   helper, with wx0600 + file/parent fsync before first resource mutation. Also
   create the distinct closed-operation once attestation bound to all source
   hashes and proposed clean support SHA. A crash/error never resets either
   reservation. There is no retry, renamed-incident reset, owner rebinding or
   second continuation. This stage spends neither reservation.
6. Prefer entire atomic **no-replace** archival of the exact registration and,
   after genuine cessation/complete archival, the entire legacy guard. Do not
   remove individual owner files. Preserve inodes, owner bytes and private
   receipts. `RENAME_NOREPLACE` must reject even an empty existing directory.
   Recheck source immediately before rename and entire archive afterwards;
   mismatch after rename => STOP with preserved archive/once, no rollback.
   The tested filesystem primitive records only RECORD_ARCHIVED and explicitly
   leaves cleanup UNCONFIRMED. It cannot retire the stand or create admission.
7. Through the reviewed supported route, use genuine nonmodel recovery/session
   cessation, then `archiveProfileHistory()`/`verifyHistoryArchive()` so the
   pending DB/WAL/SHM/runtime/session evidence closes into the assigned private
   sibling history. Bind every original DB/session file hash before/after;
   preserve authentication/config. Do not manually delete pending history.
8. Only after own server cessation and process/history proofs, use the exact
   owned CSV ledger/hash/package binding. Unknown/foreign/reappeared storage
   => STOP. No lock removal is required when the historical lock is absent.
9. Only genuine helper recovery completion may feed ordinary `release`.
   Require fresh all-profiles/storage/container/queues checks and real RELEASED
   plus FREE. Never manufacture completion, use the early cold proof, or edit
   ERROR into PASS. An optional later unit is separately assigned; no new unit,
   cold/native/product/reference/admission/probe is automatically scheduled.
10. Ben's final independent acceptance can inspect the new attested cleanup and
    immutable source, saved cold/reference/sensitivity and all six already
    consumed product receipts. Report eval quality separately from the historical
    product ERROR. There is no product repeat for PASS and no ACCEPT in this stage.

## Concrete read-only commands and eligibility

Use task-local CFG/LEASE from the original execution; do not acquire a new lease.
`R` is the established runtime root. `PROPOSAL` denotes this reviewed source,
not the installed operational support.

```sh
git -C "$PROPOSAL" rev-parse HEAD
git -C "$PROPOSAL" diff --exit-code
# Verify the delivered support sourceCommit and EVERY source manifest file hash.
"$R/bin/bun" "$PROPOSAL/evals/script/prepare-lab57-owned-cleanup.ts" \
  "$WORK/lab57-cleanup-proposal-input.json"
# Read-only current installed helper status, after its entire manifest is verified:
"$R/bin/with-env" "$R/runtime.env" "$R/bin/bun" "$OPS" status --config "$CFG"
```

The command currently returns three missing prerequisites: original parent
birth capture, genuine server cessation, and fresh operator guards. Original
source/lease/registration/guard/storage hashes otherwise match. A live cleanup
command is deliberately absent until its eligibility can be established. Do
not invoke `settle-writer-release`, `continue-lab31-owned-registration`, generic
guard retirement or `recover` with this original failed proof. After a separately
implemented/adopted eligible operation returns real helper recovery completion,
the ordinary release syntax remains:

```sh
"$R/bin/with-env" "$R/runtime.env" "$R/bin/bun" "$OPS" release \
  --config "$CFG" --lease "$LEASE" --evidence "$REAL_RECOVERY_COMPLETION"
```

That is a future eligibility-dependent command, not authorization to execute it
now. There is no valid `REAL_RECOVERY_COMPLETION` from this preparation.

## Offline tests and evidence

Only targeted new tests run with unchanged support0fd supervisor,
`unit_after_exit`, inside an isolated synthetic filesystem/PID/network contour.
Real profiles/storage/credentials/CLI/native routes and Docker socket are not
mounted. The source tree is read only in the test namespace; only its contour
and private evidence output are writable. Temporary records use dedicated
tmpfs TMPDIR. No test mocks globals or replaces the supervisor. Original lease
and source/hash bindings are checked outside the contour before/after.

Tests cover source bytes, capture/admissions/ancestry/CLI, owner/task/acquiredAt/
config/container/profile, registration/guard bytes and metadata, missing or
synthesized admission, unknown/reused/live PID observations, foreign storage,
symlinks/hardlinks/paths, once races, durable crash boundaries, source races,
nonreplace destination including empty directory, and failed-attempt resume.
Five genuine historical confirmed captures and the original 31-entry capture
retain their valid lineage. Existing helper and supervisor hashes remain exact;
their valid historical contracts are not broadened or changed.

Preserved counters: Ben cold 9/9/8 + ERROR1, product 6/6; Rich reference
1/1/2/1/1/3, six products one each, cold 11/10/8, cleanup continuations2,
same-cause repeats3/10 remaining7, admission3/3, diagnostic wrapper1/1,
recovery0. New signature first charge0; deeper root UNKNOWN. c26 remains REJECT,
reviewCycle2/rejectCount1. Independent calculation and original chronology remain
unchanged. LAB55/foreign resources, status/assignee/metadata and operational pins
are not modified.
