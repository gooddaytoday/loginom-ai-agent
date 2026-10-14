Closed Amount receiver/refusal component — node-orchestration-v3 / MAS-artifacts-v1

This independent cut adapts the accepted shared startup reason/carrier state to
the closed Amount purpose. It does not implement the acquired capture provider.
FP's wrapper retains its literal purpose and existing readiness contract.

The private start frame adds `amountStartup` with exactly `purpose`,
`authorization`, `operation`, `request`, `deadline`. Purpose is only
`amount-import-type-v1`; authorization equals the fixed capture grant; deadline
equals the original outer frame's absolute deadline. Operation/request are the
original caller values; `message.id` remains the separate outer IPC request ID.
No root/run/lease/generation/chat/account is accepted in this stage-A frame.
Copies/replacement/drift refuse; cancellation also checks operation/request.
The receiver creates a child signal proxy; this never proves the parent's
AbortSignal reference. That reference is held by LAB69's staged caller9ea9.

`retainAmountStartup` and strict `retainFPStartup` use the same private reason
implementation. First and secondary reasons have separate boxed presence;
equal false/0/undefined remain independent events. Forwarded carriers and
control receipts do not fabricate events. Pending ends only at settle; a
settled adapter cannot accept another cancellation. Standard AbortSignal abort
with undefined creates AbortError, while the separate original reason box keeps
raw undefined. No timer budget is extended or recomputed from expiry.

Actual `node-entry.dispatch(start)` validates the Amount frame and refuses
`ORIGINAL_BOUND_TUPLE_PROVIDER_UNAVAILABLE` before creating the host, reading
credentials/resources, forking managed Node, acquiring a lease or capture.
The raw reason goes through the existing rejection envelope. A second start on
that retained child refuses; capture has no host and refuses. Existing legacy
Amount calls and ordinary/Calculator routes are unchanged. There is no fallback
from the staged Amount caller into a legacy launcher.

Exact missing receiving capability

LAB69 `launchStagedAmountDiagnostic` currently ends after verified inventory
with ORIGINAL_BOUND_TUPLE_PROVIDER_UNAVAILABLE. It provides neither an internal
acquisition callback signature nor a provider-owned retained root to source67.
The fixed Amount entry/builder is not selected in this source/product either.
The current HostPort `service.acquire(run)` creates its own lease only AFTER
host readiness; `bindCapture(owner,run,chat,lease)` creates the current generation
binding. Neither can establish a prelaunch acquired tuple. The available
stage-A refusal frame is now exact and independently reviewable.

The next minimal internal cut must connect the fixed LAB69 caller's original
control/grant to `launchNodeHost` without copying Amount fence logic, retain the
actual returned handle, and let HostPort's own acquire/bindCapture establish
stage B. Source67 still owns `node-client` shared provider seam, host binding,
connection.prepare, supervisor/start-input/managed startup readers. Original
purpose/operation/request/deadline must accompany that actual acquired child;
FP readiness-only validation must remain separate. Native authority and the
original caller control are never reconstructed from serialized labels.

Capture phase remains unimplemented: HostPort assertCapture → supervisor.request
→ managed acceptance/cancel → bridge's private registerAmountControlProxy and
captureControlledAmount. That cut needs the actual retained stage-B root,
original child IDs/current generation checks and original control before/after
await. UNKNOWN/pending/lost callbacks must retain it through real evidence and
cleanup settlement before matching ACK. This component has no positive grant,
capture, release, cleanup, ACK, retry or replay API.

Verification boundary: source adapter tests and actual source-compiled/installed
node-host refusal controls use real IPC and FS. No native/Page/service double
or Loginom session is needed because dispatch is refused before acquisition.
Fixture child disconnect/exit0 proves its own teardown, not native cleanup.
This is not selected embedded Amount factory/consumer/capture composition PASS,
nor native/model/current-safety/full-node acceptance. Closed487 suites are not
repeated; FP08 and Resource68 toolsd65 reviews remain independent.
