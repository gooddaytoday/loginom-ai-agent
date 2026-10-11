# Exact retired Worker45 archival

This separate accounts-only owner route changes no Host/Agent contract, public
gate, qualification admission, config, account state or historical conclusion.
It handles only marker SHA256
`a7513042bdf7319d61c02611faa4e92563441f3263e5a227457584a8c2ca466b`,
612 bytes, device 64512/inode 2396042, LAB45 issue
`01a11d36-053e-78da-b06c-e313de5319e3`, attempt
`57854c38-db97-405d-9e46-c227615c3059`. The path is derived exclusively from the
current private Worker config's `loginom.username`. The existing permanent
Worker flock is device 64512/inode 2396009; it is opened without creation and
never removed. Both role flocks stay held through the entire transaction.

The marker's exact referenced cleanup receipt SHA256
`a977c4fedc7d65e9bfa6b9e5e0e144e3de515ba66fa040bb273bbb7615c1ac87` and downloaded
stock attachment `01a11d70-f046-7a80-accf-4b3e3df28d28` (52385 bytes, SHA256
`278a58bd91a0d9b3ff6c7d0fc74d5cfc271cce3a93c08c40fe19fd5fe2e902c5`)
bind the original issue/attempt, role lock and available process records.
Neither old receipt, retired status nor completed task admits archival alone.
The marker's PID lacks historical start_ticks. Partial retained process
records, missing model-browser/parent links, historical execution-byte gaps,
old UNKNOWN/AMBIGUOUS and node NOT_PASS remain unchanged. No PID ownership is
inferred from a profile basename or temporal proximity. The original marker's
profile representation and stock attachment profile representation are
preserved as different strings, not declared exact path binding.

## Private authorization and commands

Parent prepares a NEW operation UUID and closed 0600 authorization file:

```json
{
  "schema": "lab53-retired-worker-owner-binding-v1",
  "issue_id": "01a11e17-b869-7550-8450-35e5e17119d4",
  "pair_issue_id": "01a11d36-053e-78da-b06c-e313de5319e3",
  "operation_id": "NEW-UUID",
  "source": {"sha": "REVIEWED-CLEAN-SHA", "tree": "EXACT-TREE", "manifest_sha256": "VERSION-SHA256"},
  "expected_observer": {"user_hash": "SHA256", "guid_hash": "SHA256", "session_id": 3128,
    "create_time": "EXACT-CURRENT-TIME", "stand": "EXACT-URL", "tab_binding_sha256": "SHA256"},
  "pair_configs": ["/private/current-operator.json", "/private/worker.json", "/private/reviewer.json"],
  "configs": ["SEVEN exact path/device/inode/sha256 binding objects"],
  "locks": ["FIVE exact path/device/inode/sha256 binding objects"],
  "marker": {"path": "/private/DERIVED-WORKER.active.json", "device": 64512,
    "inode": 2396042, "sha256": "a7513042bdf7319d61c02611faa4e92563441f3263e5a227457584a8c2ca466b"},
  "stock_receipt": {"path": "/private/downloaded-original-stock.json", "device": 0,
    "inode": 0, "sha256": "278a58bd91a0d9b3ff6c7d0fc74d5cfc271cce3a93c08c40fe19fd5fe2e902c5"}
}
```

The example uses placeholders, not usable authorization. Parent binds the
actual current observer/tab tuple, including any change from historical 3128.
All config/lock objects use exactly `path/device/inode/sha256`. The three pair
configs must be members of the seven current configs, with operator_file,
role, issue, stand, workspace, agent and distinct nonadmin identity checks.
Use the existing seven-config/five-lock scope; no new credentials or lock files.

```sh
python3 scripts/owner-retired-worker.py --authorization /private/authorization.json \
  --evidence-dir /private/NEW-operation-directory --source-sha REVIEWED-CLEAN-SHA
```

This command runs in the foreground and waits at most 300 seconds per handoff.
Cancellation fails closed. It never opens a Loginom page or invokes login.
Its fixed readonly child emits `parent-request.json` after both role flocks
and known process checks. The existing parent Mac/native-CUA channel performs
a NEW native Refresh and full loaded getter/package inventory, then uses the
unchanged bridge:

```sh
NODE scripts/parent-bridge.mjs /private/NEW-operation-directory/parent-request.json \
  /private/new-raw.json /private/new-refresh.json /private/authorization.json \
  /private/NEW-operation-directory/parent-response.pending.json
python3 scripts/publish-handoff.py /private/NEW-operation-directory/parent-response.pending.json \
  /private/NEW-operation-directory/parent-response.json --bytes COMPLETE_BYTES --sha256 COMPLETE_SHA256
```

Wait for successful foreground bridge completion, parse complete private JSON,
measure bytes/SHA256 and publish the closed sibling exactly once. The awaited
final path must not exist during collection. Never redirect or write there
directly; `publish-handoff.py` links atomically without replacement.

The request has existing phase `historical-reconciliation`, a new one-use nonce,
purpose `exact-retired-worker45-current-absence`, source/config/marker/original
receipt bindings, both target user hashes and exact expected observer/tab. It
accepts complete inventory with virtual shared/pool rows retained, strictly
EMPTY Worker AND Reviewer buckets, and the preserved positive owner. Another
observer, stale receipt, changed target or partial inventory remains UNKNOWN.
There is no owner baseline exception for the two nonadmin role buckets.

After consuming this new response once, the guardian emits `fd-request.json`.
Parent runs the fixed privileged readonly wrapper through its existing SSH
access, in the guardian's PID/user namespaces, and writes closed JSON:

```sh
python3 scripts/retired-fd-inventory.py /private/NEW-operation-directory/fd-request.json \
  > /private/NEW-operation-directory/fd-response.pending.json
python3 scripts/publish-handoff.py /private/NEW-operation-directory/fd-response.pending.json \
  /private/NEW-operation-directory/fd-response.json --bytes COMPLETE_BYTES --sha256 COMPLETE_SHA256
```

Use new private sibling staging (0700 directory/0600 file, runtime-owner UID,
parent-shell noclobber/umask077). Wait for collector success AND exact control
absence, validate full JSON/bytes/hash and only then publish; retain staging.
Partial output, producer failure or cleanup uncertainty remains unpublished.
This requires actual UID/EUID 0. The wrapper calls the unchanged full collector;
its source digest and observed UID/namespaces are also bound. Both actual role
guard FDs/kernel locks plus the real transient control must be observed. All
visible proc FD directories are enumerated twice with zero denial/race/error,
stable PID inventory and target bindings, and no other target FD/kernel-lock
holders. The targets include seven configs, five locks, the exact marker and
both original receipts. A synthetic namespace test proves only fixture
visibility; it never proves mas privileged visibility.

Before removal, the guardian rechecks source/authorization/config/marker/receipt
hashes/inodes, all available exact PID/start_ticks records, numeric absence of
every missing-ticks PID (a reused PID also blocks), both live held OFDs and both
fresh proof ages. The other Worker marker spelling and both Reviewer marker
spellings must remain absent under the guards. No foreign process is signalled.

Only then the existing durable transaction hard-links the SAME original marker
inode into NEW immutable history, fsyncs, removes its canonical path and writes
`current-retired-worker-reconciled.json`. Any transaction/receipt failure restores
the exact original canonical bytes/inode/status under held guards; immutable
partial history remains. The result is `CURRENT_RETIRED_WORKER_PROOF_ONLY`,
`ready:false`, `history_state:UNKNOWN_PRESERVED`; it cannot supply pair/model/node
acceptance. Old b1d/admin reconciliation operation and artifacts remain separate.
Full pair qualification still uses the independently reviewed fixed production
coordinator, NEW UUID/nonces and NEW pre/during/final proofs on the reviewed SHA.
This source candidate executes none of those real actions before source review.
