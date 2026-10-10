# Pinned card-admin preparation in LAB53

This is source/offline implementation in the approved accounts-only §2/5 scope.
It does not activate ordinary gates, install source, change central pins or
establish runtime/pair/node acceptance. Parent performs live operations only
after independent source review on the same clean SHA. Existing authorization
for the same eight cards remains; no additional launch permission is introduced.

The common admin guard spans a pair's entire lifecycle and final readback.
ACCOUNT_BUSY is fail-fast; caps8 alone cannot provide eight concurrent pair
preparations. Keep that guard behavior. Qualify the eight retained card-admin
identities separately, then explicitly migrate each own pair's operator_file.
Subsequent pair preparation uses its own distinct permanent admin flock without
changing allocation, retry, guards, qualification or Worker/Reviewer policy.

## Retained identities and admission

`scripts/card-admin-common.py` pins the existing eight card UUIDs and SHA256
UTF8 admin usernames. No new name/password is generated and no operator config
is written. A private grant binds ALL eight actual operator files by absolute
path/device/inode/SHA256, dependency/stand/workspace/agent equality to global
operator, selected card issue, exact clean source/tree/VERSION, fresh operation
UUID, current authorized parent observer/tab and three operation configs.

The three configs are global operator, selected card operator and a new closed
intent JSON. `lab53-card-admin-intent-v1` contains issue_id, card_operator binding,
full_name, action and history. history contains provenance
`owner-audited-original-task-chain`, state, prior_attempts and nonempty bound
original receipt files. This names the existing owner's audit boundary; it is
not independent authentication of arbitrary JSON claims. The owner must inspect
original task create/ack/actual commands and all retained uncertainty first.

`probe-existing` never creates a missing row, resets a password or repairs rights
or fullname. LAB46/47 are probe-only. Missing config state, creating/UNKNOWN,
previous TimeoutError or missing receipt cannot authorize create. Explicit
`create-unstarted` is admitted only outside LAB46/47 when retained card state is
planned and the owner-audited original history establishes NEVER_STARTED with
an empty prior_attempts list. A single existing exact row is always read/cancel;
ambiguous/wrong ownership/nonadmin/blocked/must-change fails UNKNOWN. A missing
probe target fails reconciliation-required. Any canonical marker blocks bootstrap
before login regardless of old status; reconciliation is separate.

No raw config/credentials/username/GUID/full inventory may be published.

## Fixed bounded bootstrap/probe command

Use the reviewed source checkout, never installed/global source replacement:

```sh
python3 scripts/admin-bootstrap.py --authorization /PRIVATE/bootstrap-owner.json \
  --previous-processes /PRIVATE/previous.json --source-sha REVIEWED_CLEAN_SHA \
  --evidence-dir /PRIVATE/NEW-bootstrap-operation
```

The owner JSON schema is `lab53-admin-bootstrap-owner-binding-v1`:

```json
{
  "schema": "lab53-admin-bootstrap-owner-binding-v1",
  "lab53_issue_id": "01a11e17-b869-7550-8450-35e5e17119d4",
  "issue_id": "SELECTED_EXISTING_CARD_UUID",
  "card_issue_id": "SELECTED_EXISTING_CARD_UUID",
  "operation_id": "NEW_UUID",
  "source": {"sha": "REVIEWED_CLEAN_SHA", "tree": "EXACT_TREE", "manifest_sha256": "VERSION_SHA256"},
  "cards": [{"issue_id": "EACH_OF_EIGHT_UUIDS", "operator": {"path": "/PRIVATE/operator.json", "device": 0, "inode": 0, "sha256": "EXACT_BYTES"}}],
  "configs": ["GLOBAL_OPERATOR_BINDING", "SELECTED_CARD_OPERATOR_BINDING", "INTENT_BINDING"],
  "intent_file": "/PRIVATE/intent.json",
  "expected_observer": {"user_hash": "CURRENT_OWNER", "guid_hash": "CURRENT_GUID_HASH", "session_id": 0,
    "create_time": "EXACT_CURRENT_TIME", "stand": "EXACT_URL", "tab_binding_sha256": "AUTHORIZED_TAB"}
}
```

Placeholders are not usable grants. previous.json maps the actual two usernames
to audited exact PID/start_ticks records, or audited empty sets; unknown history
is never silently converted to empty. Partial numeric records must first be
reconciled by the dedicated owner route.

The parent coordinator checks admission before effects, holds pair plus both
permanent account OFDs, fsyncs source/nonce/config/origin intent and canonical
UNKNOWN effects before any potential Loginom action. Only the fixed
qualify-preparation.mjs child under exact parent lineage, command/source hashes,
inherited OFDs and deny-all-flock seccomp reaches runAdminBootstrap. Direct,
wrong-parent, missing-guard, stale-source or invalid-grant entry refuses; no flag,
PASS/ready boolean, arbitrary executable or runtime patch admits it.

The child requests complete fresh parent BEFORE snapshot before browser/login,
captures positive global admin and its new causal ID/CreateTime/GUID BEFORE
Users. The one exact pre-existing calibrated owner tuple is the only allowable
global baseline; no username-only exclusion. It inspects/creates only the pinned
card row. Global Logout/Disconnect is recorded, then the next fresh BEFORE
snapshot must prove that exact effect absent and the card bucket empty. The
child logs into the same retained card credential once, verifies native own
connection/GUID/CurrentUser continuity and effective Admin, captures its NEW
positive tuple against full parent inventory, then Logout/Disconnects. Every
session effect contributes a receipt; reconnect/error/duplicate/observer change
or missing rights/identity/logout remains UNKNOWN.

Parent retains all three guards through own browser/descendant cleanup. A NEW
post-cleanup request includes both exact effects, cleanup/logout file hashes,
same source/configs and observer/tab. Both effects must be absent, the card
bucket empty and exact owner preserved in complete loaded manager/store/package
inventory. Historical snapshots are never accepted for this operation.

Finally a NEW privileged full FD census observes all three actual guardian
FD/kernel locks and real ended control, all target configs/intent/origins/new
markers, stable complete PID inventory and zero denial/race/error/foreign holders.
Only current complete proof archives the two NEW own markers into same-inode
immutable history with rollback. It writes card-admin-qualified.json containing
exact target operator/source and linked all-effects/process/FD/server provenance,
ready:false. This is a bootstrap component, not pair readiness or node acceptance.

## Existing parent Mac/SSH handoff

Observe files in the NEW evidence directory:
ui/capture-1-before-operation-request.json, capture-2-while-connected,
capture-3-before-operation, capture-4-while-connected, then
final/parent-request.json and fd-request.json. Each response keeps its matching
prefix and uses the new request UUID/nonce/source/configs/observer/tab.
No observer, endpoint, dispatcher, queue, auth pool or Host/Agent contract is added.

The owner performs native Refresh/read-only complete loaded remote getters in
its existing authorized Mac tab, preserves that tab/session and returns the
raw private data plus actual Refresh receipt through the existing handoff.
The existing bridge is unchanged:

```sh
NODE scripts/parent-bridge.mjs /PRIVATE/REQUEST.json /PRIVATE/RAW.json \
  /PRIVATE/REFRESH.json /PRIVATE/bootstrap-owner.json /PRIVATE/RESPONSE.pending.json
python3 scripts/publish-handoff.py /PRIVATE/RESPONSE.pending.json /PRIVATE/RESPONSE.json \
  --bytes COMPLETE_BYTES --sha256 COMPLETE_SHA256
```

NEW sibling staging only, runtime-owner UID, directory0700/file0600. Wait for
the foreground bridge to succeed, parse full JSON and independently measure
bytes/hash before atomic no-overwrite publication. For fd-request.json run
the fixed held-fd-inventory.py through existing privileged SSH in the guardian's
PID/user namespaces, returning stdout to a NEW sibling fd-response.pending.json
(parent shell noclobber/umask077). Wait for collector/control completion,
validate full bytes/hash, then publish to fd-response.json with the same utility.
Readers must never see a partially written final path. Errors remain UNKNOWN;
staging and attempted evidence survive.

## Explicit operator_file-only migration

```sh
python3 scripts/migrate-operator.py --authorization /PRIVATE/migration-owner.json \
  --previous-processes /PRIVATE/previous-four-accounts.json --source-sha REVIEWED_CLEAN_SHA \
  --evidence-dir /PRIVATE/NEW-migration-operation
```

`lab53-operator-migration-owner-binding-v1` binds selected issue/new UUID/source,
ALL eight current card operator bindings, configs=[current global operator,
worker,reviewer], target_operator, bootstrap_receipt (new same-source completed
card-admin-qualified.json binding) and expected_observer. Configured pair role,
agent/workspace/stage/stand and distinct usernames are revalidated. No fallback
to historical global grants/ready/receipts proves the new operator.

Under the pair OFD and four permanent account guards (old/new admin and two
roles), the route issues a NEW parent before-operation request. The complete
fresh inventory must have empty worker/reviewer/new-admin buckets and preserve
the exact owner. A NEW privileged full five-guard FD proof plus audited exact
previous process absence, unchanged files/source/markers and live OFDs is required
before writing. Migration has no browser/login/Users action.

Both original role file inodes/bytes/hashes are durably hard-linked before ANY
change. The transaction replaces ONLY the sole top-level operator_file string
span, preserving every other byte including credentials and ready/status values.
Duplicate keys, wrong old path or changed bytes reject. Any second-file,
fsync/history or receipt failure restores original bytes AND inodes under all
guards; immutable originals remain. A receipt explicitly invalidates old
global-bound grants/ready/receipts for the migrated pair. Unchanged old state
fields do not confer readiness; new qualification grants must bind the new
operator and role config hashes. Ordinary entry gates remain closed.

## Exact retained LAB47 observer owner route

The route is source/offline now; real archival remains parent-owned after review.
owner-card-observer.py only accepts the4533-byte SHA0b61b8d5… marker on dev64512,
inode2398118, derived from the actual card operator username, and permanent
card-admin lock inode2398072. The card config SHA140782d3… and admin identity are
pinned. It never accepts an arbitrary target or canonical guard bypass.

```sh
python3 scripts/owner-card-observer.py --authorization /PRIVATE/card47-owner.json \
  --source-sha REVIEWED_CLEAN_SHA --evidence-dir /PRIVATE/NEW-card47-reconciliation
```

`lab53-card47-owner-binding-v1` binds LAB53 issue/new UUID/source, seven current
config bindings (including exact card_operator), marker, lock, origins and
expected_observer. The current approved existing owner3128 tuple is explicitly
pinned: GUIDhash8d9e536e…/CreateTime2026-10-09T04:14:57.984Z; changed owner/tab
fails closed. A fresh response is mandatory; historical3128 snapshots are inputs
only, not this proof. Origins are exact retained observer result, two original
process collectors, publication record, secret GUID file and observer source
from marker.private_evidence; file digests are pinned in source. The secret GUID
and seven owner-copied original47 inputs are byte-bound. The original770-byte
root-final manifest SHA540fd195… binds all three receipt/cleanup/resources
artifacts; its scope excludes observer3119/server/node acceptance. The retained
cleanup supplies11 available exact records, deduplicated against the observer
collectors. previousObservedOwnTreeCount15 and uncaptured-old-tree TRUE remain
unknown historical limits, never invented PID trees/ticks or a transferred PASS.
The old root cleanup's2174-byte marker SHAce1b94… and the current4533-byte
checkpoint SHA0b61b8… are different retained stages, not interchangeable proof.
All originals are included in the NEW held-flock FD/hash checks. The secret GUID
is hashed as its actual UTF8 string and compared privately with captured hash;
no normalization or opaque ID substitution. This never establishes executed
source bytes or replaces old unknown causes.

The helper acquires the existing card-admin OFD without creating or unlinking
the lock, rechecks exact marker/config/origin facts and all available original
PID/start_ticks plus partial numeric absence (reused numeric PID also blocks).
It requests a NEW historical-reconciliation response with marker/origins and
exact3119/CreateTime/GUID. Complete current private bucket must be EMPTY and
3119 tuple absent while positive owner is preserved; no Close/login is attempted.
The fixed read-only card-observer-readback.mjs validator retains virtual rows,
counts and packages. Then NEW privileged full FD/control proof under that OFD,
fresh age/source/config/marker/authorization/origin/process checks precede durable
same-inode archive. Failure restores exact originals. Historical status/UNKNOWN,
missing ticks/bytes/causes remain immutable; current-card47-reconciled.json is
CURRENT_CARD47_PROOF_ONLY, ready:false, never old or pair acceptance.

## Offline coverage and activation boundary

Python fixtures execute actual production bootstrap until the pre-login request,
then cancellation/exact descendant cleanup/FD release. A separate fixed offline
Chromium driver exercises bootstrap capture-before-Users, existing probe and
single permitted create, both logout receipts, process cleanup and fresh final
one-use response; incomplete identity/rights/logout/readback rejects. Migration
checks exact bytes/inode rollback and eight concurrently held distinct pair guards.
Privileged collector/validator positives run in an isolated own user/PID/mount
namespace with 1/3/5 actual guards and real controls; injected errors and actual
extra holders reject. They do not establish host/server or runtime acceptance.

After independent source review, parent supplies fresh operation-bound proofs,
qualifies bootstrap/migration and the complete original pair harness on the SAME
source, then obtains independent runtime review. Central pin/installation and
ordinary-gate activation remain separate from this source-only result. Existing
eight node runs remain held until complete common preparation/cleanup/review.
