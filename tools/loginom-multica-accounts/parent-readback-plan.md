# Bounded accounts-only capture and final readback

Status: source candidate for independent review; runtime qualification NOT_RUN.
Both public entrypoints unconditionally stop with BLOCKED_FINITE_SERVER_CLEANUP.
No receipt, input flag or config enables a Loginom operation. Installed helpers
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

The owner archival route cannot bind historical legacy attempts with missing
ownership facts. They remain blocked/immutable, including LAB45 executed-helper
and LAB48 original numeric/CreateTime/Timeout-cause gaps. The separate historical
account-bucket validator requires independently proven exact GUID hash algorithm
and never substitutes for the new ID/CreateTime/GUID validator or archives state.
Historical snapshots3123/3128 are inputs only, not fresh operation responses.

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

The future production coordinator interface is `prepare_pair(issue,
operator_path, directory, previous_processes, evidence_dir, source_sha,
parent_binding_file=authorization_path, operation_id=new_uuid)`. It implements
the full guarded operation and final admission transition; the public CLI gates
remain unconditional in this source result. Direct invocation is NOT authorized
now. A subsequent independently admitted qualification must use this exact
reviewed source and complete parent bridge, with its entry/admission audited;
there is no flag waiver or historical-receipt shortcut. Offline callers use
isolated test files, never the real paths. Root's current local59 PID/FD receipt
is historical input, not the required new held-flock proof or final response.

Offline full-harness fixtures exercise actual sandboxed Chromium, foreground
children, inherited locks, capture ordering, ALL receipts, one-use final proof,
owner archival and ready-write failure on isolated synthetic files. Negative
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
