# Accounts-only parent readback and remaining identity boundary

Status: **source components / offline fixtures only; live NOT_ACCEPTED**.
Both public entrypoints unconditionally stop with
`BLOCKED_FINITE_SERVER_CLEANUP`. No input file, receipt, flag or this plan enables
a login. The installed accounts scripts and CLI are unchanged.

The existing owner Mac Admin tab is accessible through native CUA and read-only
loaded getters. No callable mas/CDP endpoint exists. The parent supplies the
private result through the ordinary supplement/handoff on this same card.
This is an accounts-helper artifact exchange within the approved finite cleanup
scope. It adds no Host/Agent/Multica API, authentication, queue or observer.
If this private exchange cannot carry a complete bound response, the operation
stays UNKNOWN; a new general transport requires a separate owner decision.

## Implemented source components

`account-session-ui.mjs` records the effect before opening an owned page;
performs exact Login/Users/Logout controls with the original deadline; reopens
the owned account marker and all ten rights controls; reads nine corresponding
fresh server-user getters; preserves native errors privately; verifies the
original disposed connection and connector after UI Logout. Runner's checked
Users policy does not invent an unknown application-mode enum. UI/transport
cleanup never claims server absence. Raw identity facts are private.

`parent-readback.mjs` creates an immutable 0600 request only from a closed
process/transport component with exact operation/config/target bindings. It
checks actual PID/start_ticks absence, the three private config identities and
pair binding. The response reader rechecks config inode/device/hash and cleanup
hashes/PIDs, invokes the strict complete-inventory/effect validator, and consumes
the nonce with exclusive creation. Every success is `ready:false`. There is no
archive or ready-writing route.

`collectLoadedDispatcher` is a read-only function for the parent's existing
Admin tab **after standard Refresh**. It walks manager Count/SessionInfo and all
PackageInfo getters, matches exact store proxy/name/type/dates/package fields,
rejects duplicate proxies, masks or changing inventory, and positively binds
unique mstSelf to the connected RemoteSession via `$S`. The numeric suffix is
parsed from the bound self Name; no numeric RemoteSession getter is guessed.
The raw result stays private. `buildParentResponse` hashes usernames, exact
GUID strings and package names/paths, and retains normalized ID/CreateTime/type
and package metadata privately. Foreign rows have no invented GUID.

## Private request/response shapes

The following placeholders describe the format, not an executable receipt.
All hashes are lowercase SHA256 hex; source/tree are full Git SHA40; times are
ISO UTC. The request digest is SHA256 of UTF-8 `JSON.stringify(request)` after
parsing the saved request, preserving field order. The request also binds the
artifact manifest of the clean candidate.

```json
{
  "schema": "lab53-parent-readback-request-v1",
  "issue_id": "<LAB53 UUID>", "operation_id": "<new operation UUID>",
  "nonce": "<random 32-byte hex, used once>", "phase": "post-cleanup",
  "source": {"sha": "<clean published SHA40>", "tree": "<tree SHA40>", "manifest_sha256": "<manifest hash>"},
  "stand": "<exact configured stand>",
  "configs": [{"path": "<operator path>", "device": 0, "inode": 0, "sha256": "<hash>"}, "<worker binding>", "<reviewer binding>"],
  "effects": [{"user_hash": "<hash>", "guid_hash": "<exact UTF8 GUID hash>", "session_id": 1, "create_time": "<ISO>", "stand": "<stand>"}],
  "cleanup_file": "<private completed supervisor receipt>", "cleanup_sha256": "<hash>",
  "logout_file": "<private bound all-effect logout receipt>", "logout_sha256": "<hash>",
  "after": "<request time after logout/process completion>",
  "observer_access": "existing-owner-Mac-Admin-native-CUA"
}
```

```json
{
  "schema": "lab53-parent-readback-response-v1",
  "issue_id": "<same UUID>", "operation_id": "<same UUID>", "nonce": "<same nonce>",
  "request_sha256": "<request digest>", "source": "<identical source object>",
  "configs_sha256": "<bindings digest>", "effects_sha256": "<targets digest>",
  "cleanup_sha256": "<same hash>", "logout_sha256": "<same hash>",
  "access": "existing-owner-Mac-Admin-native-CUA", "owner_session_preserved": true,
  "new_browser_or_login": false, "close_actions": 0,
  "refresh": {"action": "native-Refresh", "started_at": "<after request>", "completed_at": "<after start>", "receipt_sha256": "<private action receipt hash>"},
  "readback": {
    "source": "existing-authorized-admin", "stand": "<same stand>",
    "loaded": true, "refresh_complete": true, "packages_complete": true,
    "refreshed_at": "<snapshot after Refresh completion>", "manager_count": 1, "store_count": 1,
    "observer": "<connected unique bound mstSelf ID/CreateTime/user/GUID hashes>",
    "calibration": "<same observer GUID hash and stand>",
    "rows": "<full normalized private inventory, including all packages>", "inventory_sha256": "<normalized rows digest>"
  }
}
```

The parent preserves its existing session and performs only Refresh/read.
A digest provides artifact binding, not authentication of arbitrary files.
The ordinary authorized parent handoff remains the trust boundary; source
fixtures and matching booleans never constitute runtime qualification.

## Order required before any future activation

1. Independently review this clean source candidate and resolve the identity
   boundary below. Qualify the complete runtime while preserving both gates
   until explicitly admitted. Historical effects remain separately reconciled.
2. Under permanent account/pair flocks, record UNKNOWN effects before potential
   Loginom actions. Capture every new effect's exact ID/CreateTime/GUID and
   all required rights/identity/logout facts. Original deadlines are retained.
3. Complete exact owned descendant/PID/start_ticks cleanup and verify own FD
   release. The guards stay with the parent; failure retains UNKNOWN/history.
   `run_foreground` now binds production cleanup records to issue/operation/SHA.
4. Produce the new request with all admin/worker/reviewer effects, exact configs
   and complete logout/process receipts. Parent then performs fresh Refresh and
   full getter/store readback; historical3123/3128 snapshots cannot satisfy it.
5. Consume the once-bound response through the existing strict new-effect
   validator. Owner archival remains a separate route requiring current
   permanent-flock/config/marker/PID/FD identities and a new bound receipt.
   This candidate does not implement or perform that archival transition.

## Owner-approved causal identity capture; runtime boundary

The owner and independent root source review supplied a bounded causal route.
The absence of a direct numeric getter does not exclude supported causal capture.
`account-identity.mjs` implements the proposed component validator, returning
an exact new effect tuple and separate `own_session_positive` and
`observer_positive`. The child is never assigned the parent's mstSelf count.
The lifecycle now requires these separate facts plus exact ID/CreateTime/GUID,
role, rights and cleanup; it rejects synthetic parent-as-child identity.

For each owned admin/worker/reviewer under its permanent exclusive flock:

1. Persist a new operation UUID, one-time capture nonce, clean SHA, exact private
   config hash and account lock device/inode. Parent performs a complete fresh
   Refresh **before the new login**, with empty exact target account bucket.
2. Perform one fresh owned login without retry. Privately capture CurrentUser,
   connected state, exact GUID and the owning connection/transport references.
   Keep that connection and the flock throughout the bounded capture window.
3. Parent performs another complete fresh Refresh while this child is connected.
   The same positively bound owner observer must remain; exactly one new active
   target row supplies its numeric ID/CreateTime. No proximity-to-time or opaque
   RPC object ID is used. All parent tuples/packages must be fully calibrated.
4. Re-read the child's same GUID/CurrentUser/connected state. Reject extra
   transports, errors/closes/reconnects, duplicate/recoverable target rows,
   changed observer, partial inventory, changed configs/guard, or mismatched
   issue/operation/nonce/role. Then preserve this causal proof privately.
5. After exact own UI Logout/Disconnect and descendant/PID/FD cleanup, request
   a **new** final parent snapshot as described above. Identity capture alone
   does not establish absence or ready.

The private capture envelope uses schema `lab53-causal-binding-v1`,
`issue_id`, `operation_id`, `nonce`, `source_sha`, `config_sha256`, `user_hash`,
`role`, `stand`, `after`, and `account_lock:{device,inode}`. `before` and `during`
repeat those exact bindings with phases `before-operation` / `while-connected`
and full calibrated `readback` objects. Child before/after receipts repeat the
bindings with their own GUID/connected/CurrentUser hashes and observation times.
The after receipt includes a private continuity receipt digest, one transport,
zero disconnect/reconnect/guard releases, and the same config/lock identities.
The component rejects missing continuity; matching flags are not live proof.

The UI adapter exposes an internal bounded `captureCausalIdentity` hook for this
source component. It observes WebSocket lifecycle events before Login, retains
exact connection/remote/connector/transport references, checks the inherited
account FD's kernel FLOCK and config hashes, and rereads its actual client after
capture. No frames/credentials are logged. It does not accept caller-supplied
child identity in place of its actual getters. The production entrypoint has
**no admitted phase/handoff provider**; absent it, identity fails closed with
`ACCOUNT_NUMERIC_IDENTITY_NOT_EXPOSED`. Complete admin capture before provisioning,
private all-effects logout receipt aggregation and pre/during/post handoff routing
remain incomplete. These require separate independent runtime qualification
before any gate admission; this source candidate does not claim their completion.

The independently rehashed retained vendor interfaces are
`bg.model.js` SHA256 `d3ab87a3aca82985d41a8b9d4b3502c9d8d662204c67c07fb3ff2156d802407a`
and `bg.model.rpc.js` SHA256 `53d043e4a7ee9dcc8006aa8915ca43d83a1df427fa0d73d8ea403357ec61a28f`.
OwnRemote declares GUID/CurrentUser but no numeric ID/CreateTime getter;
ManagedSession declares Name/CreateTime/type/packages but no GUID getter.
[Primary Dispatcher documentation](https://help.loginom.ru/userguide/admin/dispatcher.html)
defines Name as username plus unique session identifier and includes active and
recoverable sessions. Refresh updates opened/closed entries. Those semantics
support the proposed causal route; they do not constitute executed proof.

## Historical reconciliation boundary

Owner-approved `verifyHistoricalAccountBucket` is a separate read-only
component: a complete calibrated inventory can exclude old effects when its
account bucket contains only the positively bound current owner self with a
different **comparably hashed** GUID (or the bucket is empty). It requires
independently established old exact-string hash algorithm provenance. It never
repairs old missing numeric IDs or executed-helper history, never closes a
session, and never replaces the new ID/CreateTime/GUID validator.

The root's shared-oauth checkpoint `fafacd15848ea5ac1943deae76380c75fe368e6a`
binds historical snapshot3128 SHA256
`ce2545af4b5d61811b06b73d752dd41f2311b614ffdaff11c7f0df7647832471`.
It is an input to historical reconciliation only. LAB45/LAB48 remain
NOT_RECONCILED here; no real marker, config or history has been changed.
