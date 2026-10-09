# Bounded accounts-only capture and final readback

Status: source candidate for independent review; runtime qualification NOT_RUN.
Both public entrypoints unconditionally stop with BLOCKED_FINITE_SERVER_CLEANUP.
No receipt, input flag or config opens an ordinary entrypoint. The separate fixed qualification entry requires the complete source/owner/guard admission described below. Installed helpers
are unchanged. Historical LAB45/LAB48 remain NOT_RECONCILED.

## Private parent handoff

The authorized parent accesses the existing owner Mac Chrome Admin tab through
native CUA and loaded read-only getters. It preserves that tab/session and uses
only standard Refresh/read. No callable CDP/mas endpoint, new observer, queue,
authentication or Host/Agent/Multica contract is introduced. Private files are
transport artifacts delivered through the existing same-card supplement/handoff.
Their hashes bind bytes; they do not authenticate arbitrary outside writers.
The explicit authorized parent handoff is the trust boundary.

Before future admission, the parent supplies a private 0600 authorization:

```json
{
  "issue_id": "<LAB53 UUID>", "operation_id": "<new UUID>",
  "source": {"sha": "<clean published SHA40>", "tree": "<tree SHA40>", "manifest_sha256": "<VERSION digest>"},
  "configs": [{"path": "<operator absolute path>", "device": 1, "inode": 1, "sha256": "<SHA256>"}, "<worker binding>", "<reviewer binding>"],
  "expected_observer": {
    "user_hash": "<SHA256>", "guid_hash": "<SHA256 exact UTF8 GUID string>",
    "session_id": 1, "create_time": "<exact ISO UTC>",
    "stand": "<configured URL>", "tab_binding_sha256": "<authorized device/profile/tab binding digest>"
  }
}
```

This is the expected current observer, never an old3123/3128 snapshot reused as
future proof. The coordinator binds the file inode/device/hash and exact source
SHA/tree/VERSION before acquiring guarded operation state. Each before/during
and final request uses the common private envelope below with a fresh one-time
32-byte nonce; it repeats the SAME exact observer and source object:

```json
{
  "schema": "lab53-parent-readback-request-v1",
  "issue_id": "<same UUID>", "operation_id": "<same new UUID>",
  "nonce": "<fresh SHA256-sized random hex>",
  "phase": "before-operation | while-connected | post-cleanup",
  "source": "<exact source object>", "stand": "<exact URL>",
  "expected_observer": "<exact authorized tuple above>",
  "configs": "<three exact private path/device/inode/hash bindings>",
  "effects": "<empty for capture; ALL exact new effects for final>",
  "after": "<request ISO UTC>",
  "observer_access": "existing-owner-Mac-Admin-native-CUA"
}
```

Capture requests additionally carry `capture_binding`: issue/operation/source,
fresh causal nonce, target role/user/config hash, stand, after and permanent
account-lock device/inode. Final requests additionally bind the completed
all-effect logout file and exact process-cleanup file paths/hashes. The parent
reads the immutable request, performs a NEW standard Refresh after `after`,
then invokes `collectLoadedDispatcher` in the existing tab and normalizes with
`buildParentResponse(request, raw, refresh, authorizedTabBindingDigest)`.

```json
{
  "schema": "lab53-parent-readback-response-v1",
  "issue_id": "<same UUID>", "operation_id": "<same UUID>", "nonce": "<same phase nonce>",
  "request_sha256": "<SHA256 UTF8 JSON.stringify(parsed request), field order retained>",
  "source": "<identical source object>",
  "configs_sha256": "<bindings digest>", "effects_sha256": "<effects digest>",
  "access": "existing-owner-Mac-Admin-native-CUA",
  "owner_session_preserved": true, "new_browser_or_login": false, "close_actions": 0,
  "refresh": {"action": "native-Refresh", "started_at": "<after request>", "completed_at": "<after start>", "receipt_sha256": "<private action receipt digest>"},
  "readback": "<complete normalized inventory, counts, packages, exact observer and calibration>"
}
```

Final responses repeat logout/cleanup hashes. The normalized inventory digest
and counts include ALL manager/store rows and packages. Each row has row_index,
name_hash, type, pending_disconnect, create_time and packages. Real mstClient/
mstSelf rows require exact positive numeric ID, username hash and CreateTime;
only positively bound self has its actual RemoteGUID hash. Virtual mstShared/
mstPool rows retain names/types/packages with user_hash/session_id/guid_hash
null and observed nullable CreateTime. No virtual identity is invented. Unknown
or mstBackup semantics reject the snapshot rather than removing a row.

The collector discovers exactly one visible `bg.admin.view.SessionsManagerForm`
through Ext.ComponentManager.getAll, its real Controller.FSessionManager and
Controller.FSessionsStore, loaded root and Items.trpSessions.getStore equality.
It reads the actual static/prototype enum, manager Count/SessionInfo and all
PackageInfo getters; checks store proxy/name/type/date/package equality, no
masks, unchanged inventory and unique connected mstSelf through same-client $S.
It parses self's supported Name suffix and preserves exact GUID string hashing.
It never invents a numeric RemoteSession getter or treats opaque objectId as GUID.

## One bounded production operation behind closed gates

1. Validate the clean candidate and authorization; acquire pair plus admin/
   worker/reviewer permanent flocks with explicit exact previous PID/start_ticks
   records. Existing active legacy state blocks. Persist all three canonical
   own UNKNOWN effects before any possible Loginom action.
2. Run fixed source-hashed foreground children under an isolated subreaper.
   All four FDs are inherited. An irreversible per-child Linux seccomp barrier
   forbids flock syscalls across fork/exec/setsid, preventing unlock/relock.
   Parent held OFDs, exact lineage, command, barrier bytes and guards are checked.
   No unknown capture callback, executable, hook or supplied child identity is used.
3. Before EACH own Login, obtain complete fresh parent capture. Nonadmin target
   buckets must be empty. For the common admin ONLY the exact positively bound
   authorized owner ID/CreateTime/GUID/user/stand/tab may remain as baseline.
   Username-only exclusion and any additional target row are rejected.
4. Create one own disconnected page/context. Verify exact loaded vendor bytes;
   install source-backed native lifetime observation BEFORE its one Login.
   DoConnect/container ConnectToServer, field changes, connector/error callbacks,
   saved Reconnect and supplementary socket lifecycle are audited. Retry,
   reconnect, changed references, errors, extra transport or incomplete provenance
   remain UNKNOWN. Source variants and bundled/missing expected bytes fail closed.
5. Positively read own CurrentUser/RemoteGUID/connected and obtain fresh full
   parent during inventory. Exactly one NEW target client ID/CreateTime must be
   absent from the ENTIRE before inventory, with own GUID continuity afterward.
   Preserve owner observer unchanged. This bounded causal bridge captures both
   admins BEFORE Users/provisioning, then worker/reviewer identities and rights.
6. Capture ALL four admin/role UI Logout and original transport disposal receipts.
   Close only owned pages/browser. Finish exact descendant PID/start_ticks/pidfd
   cleanup independent of PGID/SID. Surviving or unknown children fail; parent
   guards remain held. This is local cleanup, never server absence by itself.
7. Aggregate every effect/logout/observer receipt. Only after all Loginom-capable
   children/FDs have exited, run a read-only foreground request collector with
   no account FDs/browser/Loginom. Obtain a NEW parent post-cleanup snapshot
   through the same handoff and observer, then strict one-use verification.
   Missing/stale response, changed observer/config/source, remaining exact effect
   or an unaccounted target client blocks. All partial components remain ready:false.
8. Under the SAME permanent guards, validate consumed proof and current exact
   config/marker/writer/PID identities. Archive only canonical own operation
   markers as original-byte hardlinks; permanent lock inodes never disappear.
   Only complete proof admits the pair account_state=ready transition. Failure
   retains history and UNKNOWN markers, attempts to restore original config
   values and records restoration failures; it never reports qualification.

A separate `owner-reconcile.py` route handles ONLY the two exact retained
LAB45/LAB48 marker byte hashes. It does not change old UNKNOWN facts or pretend
that missing numeric/CreateTime/helper/start/Timeout-cause facts were captured.
It requires a positively bound current sole owner account bucket, a different
comparable exact-string GUID, independently audited retained collector execution
and algorithm provenance, and a NEW operation-bound parent response. A missing
collector/source/task-chain binding returns HISTORICAL_*_NOT_ESTABLISHED before
any archive. This route cannot silently use a reconstructed helper as executed
collector proof. Historical snapshots3123/3128 remain inputs only.

## Independent qualification required

The parent bridge has the following exact read-only file interface for every
before/during/final phase. Run with the approved Node dependency and the exact
reviewed helper checkout; all inputs and the output directory must be private.

```sh
NODE scripts/parent-bridge.mjs REQUEST.json RAW.json REFRESH.json AUTHORIZATION.json RESPONSE.json
```

`REQUEST.json` is the immutable phase request produced by the foreground
harness. `RAW.json` is the full private result of `collectLoadedDispatcher()`
executed via native CUA in the SAME existing owner tab AFTER a new native
Refresh; its exact source is exported from `scripts/parent-readback.mjs`.
`REFRESH.json` contains actual action/start/completion timestamps and private
action receipt digest; no helper creates a Refresh gesture or invents that
receipt. `AUTHORIZATION.json` is the exact operation grant above. Preserve
the request filename prefix: `capture-N-PHASE-request.json` must receive
`capture-N-PHASE-response.json`; final `parent-request.json` must receive
`parent-response.json` in the same private directory. The bridge verifies
operation/source/observer/phase/freshness and writes once. Returning the private
response through the existing supplement/SSH handoff adds no callable endpoint.
Never include raw inventory, GUID, configs or credentials in a public comment.

The executable qualification interface is fixed and source-hashed:

```sh
python3 /ABS/ACCOUNT_HELPER/scripts/qualification-coordinator.py --issue ISSUE_UUID --operator /PRIVATE/operator.json --directory /PRIVATE/cards --previous-processes /PRIVATE/previous.json --evidence-dir /PRIVATE/new-operation --source-sha CLEAN_SHA --operation-id NEW_UUID --parent-binding-file /PRIVATE/authorization.json
```

It validates the clean SHA/tree/VERSION and private operation/observer plus
ALL THREE config path/device/inode/hash bindings before guarded effects. Role
configs must already exist; this route does not secretly allocate a new admin.
It invokes ONLY `qualify-preparation.mjs` under the fixed subreaper and kernel
flock barrier. The child verifies its real direct supervisor, actual coordinator
PID/start_ticks/command hash, all four inherited and parent-held OFDs, seccomp,
source/manifest and exact owner/config binding BEFORE dependency/browser work.
Direct child invocation or missing/invalid binding/guards/lineage fails UNKNOWN.
No env, ready/PASS boolean, arbitrary executable, flag or runtime source patch
opens this path. Ordinary `provision-accounts.py` / `provision-account.mjs`
remain unconditionally gated. The SAME reviewed source can execute bounded
qualification; only all-effects proof completes its pair-ready transition.
This turn runs source/offline checks only, not this command on real accounts.

The historical owner route is executable separately:

```sh
python3 /ABS/ACCOUNT_HELPER/scripts/owner-reconcile.py --authorization /PRIVATE/historical-owner-binding.json --evidence-dir /PRIVATE/new-historical-operation --source-sha CLEAN_SHA
```

The private grant schema is `lab53-historical-owner-binding-v1`, with LAB53
issue_id, fresh operation_id, exact source, expected_observer and `lock` (the
existing permanent admin path/device/inode/hash, inode2396017 for these real
attempts). `configs` contains all7 closed config bindings with the current
operator first; `locks` all5 exact bindings, including `lock`; `markers` contains
exactly both existing legacy marker paths (account.active.json and
account.lock.active.json), original issue_id/attempt_uuid, device/inode/sha256
and guid_hash. `previous_processes` contains the audited59 unique exact
PID/start_ticks records (strings for ticks). No missing original process fact
is invented to populate this list.

Each marker has `collector`: source_file/source_sha256 and
execution_receipt/execution_sha256. The private receipt schema
`lab53-retained-guid-collector-v1` binds issue/attempt, original_task_id,
source_sha256 (declared retained/API/reference representation ONLY), exact expression, algorithm `sha256-utf8-exact-guid-string`,
guid_sha256/user_sha256 and execution_bindings input/ack/readback path/hashes.
`source_role` is `api-redacted-source-representation`, `retained-created-source`
or `retained-compatible-reference`; `executed_source_sha256` remains null and
`byte_gaps` retains `physical-preexec-not-captured` plus all original redaction/
unredacted/helper gaps. Original LAB45 task input is partially API-redacted:
its representation digest is never called an executed-source digest, and a
compatible reconstructed reference never becomes executed-byte proof. The
owner's original command-chain audit can establish exact-string algorithm
comparability while these gaps stay UNKNOWN. Unavailable unredacted executed
bytes are NOT required for this separate CURRENT bucket exclusion route.
`provenance_mode=owner-audited-original-task-chain` names the explicit existing
owner audit trust boundary, not a PASS flag or byte-hash proof of execution.
Parent must first establish that these are original task/collector facts; an
unavailable source/execution chain remains NOT_ESTABLISHED. The helper verifies
retained bytes twice; it cannot independently authenticate arbitrary writers.

Under the held existing permanent OFD the route rechecks all14 target hashes,
config/operator identity and exact historical process absence. It emits
`parent-request.json` phase `historical-reconciliation`, fresh nonce and seven
config bindings; the same read-only parent bridge returns a NEW complete sole
owner bucket proof. Only afterward does it emit `fd-request.json` for the
existing privileged parent SSH channel. Run the fixed read-only collector there:

```sh
python3 /ABS/ACCOUNT_HELPER/scripts/own-fd-inventory.py /PRIVATE/fd-request.json > /PRIVATE/fd-response.json
```

Return this file only after the foreground collector ends. The route requires
both complete identical PID inventories, zero denied/racing/error FD reads,
actual positive control FD observation, ONLY that ended collector control and
the exact guardian FD as target holders, same guardian PID/start_ticks, exact
device/inode kernel locks and fresh request-bound hashes. Other holders,
unestablished access, altered source/targets or stale server/FD proof is UNKNOWN.
It then rechecks live OFD, all current hashes, collector provenance and process
absence. Both originals are durably hardlinked BEFORE either marker is removed;
receipt persistence is in the same rollback boundary. Link/unlink/fsync/receipt
failure restores exact original UNKNOWN bytes/inodes and preserves any history.
Permanent locks, configs and historical fact values are never rewritten.
Root's09:27 local59/FD receipt is historical input, not this new held-lock proof.

Offline full-harness fixtures exercise actual sandboxed Chromium, foreground
children, inherited locks, capture ordering, ALL receipts, one-use final proof,
owner archival and ready-write and second-archive failure on isolated synthetic files. The exact production qualification command is also checked through its before-request boundary and cancellation, before any browser/Loginom action. Negative
rights/identity/logout/readback, observer/tuple substitution, saved vendor
Reconnect and real forked unlock/relock probes reject. These do not qualify the
live loaded object shape, supported getters, native instrumentation, seccomp
compatibility or parent CUA timing/transport. Full independent source review
and separately admitted bounded runtime qualification on the SAME published SHA
are still required before changing either unconditional gate or installing.

The retained vendor hashes are in vendor-provenance.mjs and finite-cleanup.md.
[Primary Dispatcher help](https://help.loginom.ru/userguide/admin/dispatcher.html)
defines session Name as username plus unique session identifier and Refresh
updates active/recoverable sessions. This supports the causal mechanism as a
source interpretation, not live proof. No broader contract delta is proposed.
