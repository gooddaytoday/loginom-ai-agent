## Generic retained/read-only capture ABI — bounded contract, not a PASS

Process node-orchestration-v2. Common basis: 87e1afa5 → 1b3ec12e →
913d3f1397b35e54009d9b71cd4a7aa0357f8ecd (CHANGES_REQUESTED).
Replacement consumer contract: 2fe1bc46eb0c64fd32c0ffa5d168420ea1f93bf1,
receiving 599ef7b8. Main cleanup a0eab9d80 is a separate correction; none of
its main-branch files is a generic receiving prerequisite.

### Ownership of exact hunks

LAB-71 owns node-client fixed-resource preflight and managed fixed loader
path/export. LAB-73 owns its fixed kind/factory/compiler/result validator,
resource, host/host-port/node-client/start-input registration branches and
Replacement loader branch. LAB-68 owns existing bridge persistCapture IO,
managed retained-slot producer and bridge retained/diagnostic branches. Do not
modify either transferred loader branch or import the main branch wholesale.

### Process-local slot

The managed producer supplies one frozen slot to createBridge after successful
login and frozen startupBinding. It contains the actual startupOwner,
startupBinding, original context/Page, actual session, original capture signal
and immutable original absolute deadline, together with the trusted frozen
start envelope. These are references, not JSON operands. The existing host
WeakMap grant/retained lease/run/generation/chat authorizes the envelope before
private forwarding; a caller cannot mint authority by copying that envelope.
The bridge captures that same slot, its own actionRuntime, its own original
expanded node request and corresponding local preparation/opening receipt.
No public getter, callback, registry, new holding process or serialized handles.

The caller-visible request cannot supply or replace any slot member. The fixed
module receives only the trusted slot and the bridge-owned context. Freeze the
containers, not owner/Page/runtime/native objects. Assert pointer identity,
owner id/account/origin/context/Page, session, run/lease/generation/chat and
original deadline before the gate, after every await and before IO. Refuse
missing/replaced/closed owner, expired/aborted signal, pending/RUNNING/unsettled,
unknown effect or receipt, and changed request/opening. Never renew the deadline.

The current 913d capture handler has no active controller while dispatching
acceptance.capture. Do not label a fabricated new signal as an original signal:
link that dispatch to the existing managed interrupt/controller lifecycle and
retain its actual signal for the slot. The current bridge only retains workflow
references; it does not yet retain an acceptance-linked original node request/
opening receipt. Capture these from the existing node dispatch's own operands
and validated return, not IPC verified proof or an unrelated latest node.
These two wiring requirements remain unimplemented, not native input proof.

### Fixed registration and linked result

A read-only diagnostic branch is enabled solely by a verified, compile-time
fixed module registration from the trusted loader. Its result validator is the
fixed module's export; neither request nor receipt can provide a validator or
select a resource. LAB-73 supplies the Replacement algorithm and validator.
Require that registration and a fully linked receipt BEFORE persistCapture:
run/lease/generation/chat/account/package/document/session/workflow/node/input0/
connection/epoch, original request and opening operation, exact resource/build
pins and original deadline. Missing/unknown/foreign/stale/accessor/spoofed fields
refuse before capture IO. Revalidate the retained owner and binding after the
module/validator await; receipt never creates or upgrades authority.

A checked DIAGNOSTIC_READ/NOT_APPLIED with effect_possible=false is persisted in
a separate branch before Calculator cancellation validation. It cannot satisfy
Calculator cancel_verified, Import PARTIAL/opaque-clean proof or cleanup/ACK.
A validated diagnostic result remains a refusal of admission/release. Same-owner
guarded cleanup is an independent stage with its own durable receipt. Unknown
capture consumes the grant and forbids replay; checked-result storage retry
only rewrites evidence and does not rerun the reader or native cleanup.

### Required corrections and evidence before delivery to 73

1. LAB-71 independent PATH correction: same canonical inventory/path/hash/export
   from real launcher preflight through exact managed loader. No resource
   algorithm or whole source blob transfer.
2. LAB-68 common persistCapture correction: retain original writer operations;
   first sync=0 separately from close=false; original kernel callback completion,
   not fd/status/EBADF. No new writer/release/ACK while physical close unknown.
3. Slot producer and diagnostic branch above, composed with LAB-73 fixed validator
   and registration on exact receiving bytes. No fabricated successful proof.

Tests must include genuine host lease/journal and whole-module child IPC/FS,
labelled Page/native doubles: original and foreign/spoofed/stale/duplicate grants;
changed owner/request/deadline after await; missing slot; invalid linked receipts;
Calculator/Import receipts on the diagnostic branch; Error/falsy/undefined with
independent persistence failures; no native/reader replay; durable capture and
same-owner cleanup before release/exit. Stock missing-resource refusal and
consumer ABI tests do not prove this positive composition. Current generic
registration/retained-host PASS and native capture remain NOT_VERIFIED.
