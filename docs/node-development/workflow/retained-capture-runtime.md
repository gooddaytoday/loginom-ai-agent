## Retained capture runtime ABI

node-orchestration-v2. Separate composition on frozen readonly candidate
`a689a6810122295dc32c0d608704db223f5e7672`. Its readonly CHANGES_REQUESTED
and queued correction remain separate; this component does not accept that lane.
Accepted generic inputs: PATH `148d0b9430deda1f220f2421f698d50d78cee4e5`,
capture IO `6d9745c0e2a414c396e9780c2d796e7740820e47` →
`cc10568f0cdda6bc46dae30cac336c7ecc006a32`.

The executable implementation is `src/retained-capture.mjs`, managed startup /
capture dispatch, executor's private `retainCaptureNode`, bridge capture branch,
and HostPort's retained runtime / post-await admission checks. It introduces no
public CLI, tool, IPC operation, dynamic resource path or caller callback.

### Fixed loader and producer

The existing closed launcher WeakMap, host owner/run/lease mint, start envelope
and fixed canonical resource loader remain the authority. Stock resource absence
still refuses before login. A verified fixed module can export
`captureMode = 'readonly'` and `validateCaptureResult(receipt, context)` alongside
its existing fixed capture export. Mode/validator come from that loaded module,
never the start envelope or tool operands. Missing validator or another mode
refuses before startup IO; no new consumer kind is registered here.

Managed captures an independent `captureStartupBinding` at successful login.
`retainCaptureOwner` binds its actual owner/context/Page/session/resource; a
one-time `bindCaptureRuntime` binds the newly created bridge and client before
their connection awaits. Containers are frozen; native handles remain mutable.
Missing, substituted, closed, multiple-Page or expired ownership refuses.

The bridge remembers the ID from its own admitted node.apply dispatch. Its
executor retains the original job signal, state.request, verified open phase,
node identity and absolute state.deadline. `retainCaptureNode` reads its existing
operation Map, never an IPC supplied proof. It refuses unknown/pending/running/
unsettled/cancelled/expired work. It hashes the retained request/opening and
checks their reference, bytes, node and deadline again after awaits. The node
deadline is not derived from launcher expiry or an RPC timeout.

Managed acceptance.capture now owns its original AbortController for the entire
dispatch. Interrupt reaches it through the existing operation. Fixed code gets
`{binding, identity, browser, record, retained, runtime, session, node,
publication, signal, deadline}`. `node.signal` is the original node job signal;
`signal` is the original capture dispatch signal. Call `node.assertCurrent()` and
`assertCaptureOwner(retained)` around every native await; consumer algorithms
must respect both signals and the supplied original deadline.

### Result and persistence

`publication` contains exact owner/run/lease/generation/chat/admission/session,
document/package/account/workflow/node/build/origin/runtime revision, verified
resource path/hash, original local request/opening IDs and hashes, and deadline.
Receipts are plain JSON with status DIAGNOSTIC_READ or NOT_APPLIED,
effect_possible=false, admission_confirmed=false, settings_applied=false,
exact publication and a root bound to its document/workflow/node/session/
account/package. Getters, cycles, foreign prototypes and non-JSON fields refuse.
The fixed validator must additionally verify its raw native root/port/connection/
epoch and before/after projections against this original context. It must return
exactly true. Generic checks run before and after that await, before IO and before
projection. Only validated JSON is frozen, never the Page or native objects.

The existing sole callback writer persists the checked receipt and journal.
Original pending callbacks retain the writer; first Error/falsy/cause remains
separate from persistence/close faults. No diagnostic result is returned until
both writes are confirmed and the retained tuple is still valid. The reply is
`{receipt, diagnosticRead:true, cleanupComplete:false}`: host retains the exact
runtime and strict journal/lease. It cannot satisfy Calculator cancel, Import
PARTIAL, cleanup/ACK or release. Capture is consumed once. Unknown reader outcomes
cannot be replayed. A checked-result write failure permits evidence-only repair
on the same stored directory/session/bytes, then preserves the original refusal;
reader/native/teardown are never repeated by that repair.

### Receiving boundaries

LAB-73 owns its Replacement kind/factory/mint/loader registration, adapter and
serialized reader/validator (`2fe1bc46eb0c64fd32c0ffa5d168420ea1f93bf1` is the
input contract). It must validate input0/port GUID/connection/epoch and its own
original native opening receipts using the retained context. LAB-71 owns its
Import consumer/fixed pre-config/opaque-clean contract. No resource or algorithm
for either consumer is implemented by this generic component.

Minimal receiving: existing closed grant/launcher/start/dispatch seams from
`1b3ec12eb97e2308cfd0af7e399511b70c9e40d3` + launcher extraction
`913d3f1397b35e54009d9b71cd4a7aa0357f8ecd`, corrected PATH148d, IO6d→cc,
then this runtime delta. Those old precursor commits are not independently PASS;
use only their named seams with the reviewed corrected composition. Preserve
each receiver's stronger lifecycle/writer code. Apply the generic delta against
cc with the independent captureStartupBinding hunk; readonly db5→a689 and main
cleanup a0/ba2 are not required generic receiving changes. Resolve context hunks
sequentially, with one bridge author; do not copy an entire common branch.

### Evidence limits

Linked tests exercise exact managed/capture functions and callback writer in VM
with real HostPort, transport, connection lease, strict journal and FS. Whole
bridge tests use its real executor/node runner/phase verification and callback FS;
external SDK/service, Save, Page/native drivers and fixed reader/validator are
labelled doubles. Loader tests use genuine launcher/child IPC and exact verified
loader, with a fixed resource double. Native consumer registration, actual native
root/port proof, model acceptance, cleanup/release and receiving PASS are separate.
Inherited readonly CHANGES_REQUESTED is not a generic result permission.
