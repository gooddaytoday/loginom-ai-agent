Amount stock control — receiving prerequisite proposal, NOT implemented

Receiving runtime: 694c9ab4a3ec47b522562ce1ab61191e6f149fce / 202610131639.
Accepted FP source: 48733e42c6d6cf2f1b3e735649e8279b59d9823c / 202610131641.
Common carrier source author remains LAB-67; Amount-only integration author LAB-69.

Exact non-applicability

- `node-client.ts:launchAmountDiagnostic` accepts only the original input and returns
  `capture(run)` with `{run,authorization}`. The run is supplied after launch;
  no original caller control is retained by this Amount closure before inventory
  awaits. `launchFieldParametersDiagnostic` is a separate FP-only factory.
- `fp-startup-control.ts:retainFPStartup` accepts only the FP harness; its private
  startup tuple is requestId/authorization/harness/deadline, without the Amount
  original operation/run/lease/generation/chat/account binding. Amount purpose
  refuses before a timer. Its controller is the IPC receiver proxy, not the
  parent's actual original signal.
- `node-entry.ts:dispatch` binds startup only for the FP harness. The existing
  earliest cancellation branch uses `state.fpStartup`; do not impersonate FP.
- `supervisor.ts:FPStartupControl` has an FP-only literal harness. Its cancellation
  and pending/carrier semantics are accepted; that does not qualify an Amount
  capture control. Its startup relay is not a retained capture-phase proxy.
- `start-input.mjs:validateStartInput` permits fpStartup only on readiness and
  refuses simultaneous acceptanceCapture. Existing Amount binding is strict and
  has no operation/request/deadline/proxy fields; adding them is refused.
- `managed-entry.mjs:acceptance.capture` accepts no input and creates a local
  controller. `bridge.mjs:captureAcceptance` sends four fields to legacy Amount;
  neither is the original caller signal/deadline or the new child registry grant.
- The installed FP private export provides only launchFieldParametersDiagnostic.
  Receiving694's full inventory has no fixed Amount private factory or its build
  metadata. An opaque ordinary embedded CLI binary/source facade is NOT a
  substitute selected Amount private ABI proof.

Minimal proposal requiring Registry scope/order BEFORE shared writes

1. LAB-69-only fixed `amount-private-launcher-entry.ts` and Amount launcher closure
   in node-client.ts: integrate the already qualified amount-caller-control fence,
   retain the actual caller AbortSignal by reference and established absolute
   deadline + original operation/request BEFORE inventory/host await. Publish one
   fixed private bundle and its compiler metadata, inventory-hash it, no new CLI
   tool/public route/arbitrary module callback. Exact builder hunks in
   build-node-host.ts/build-cli.ts must be ordered with author67; do not copy FP
   entry or export its factory as Amount. Keep ordinary/Calculator paths unchanged.
2. Common startup consumer/supervisor seam from author67: a closed Amount purpose
   adapter to the existing corrected carrier/provenance implementation, with
   exact immutable original request/authorization/deadline and original-child
   cancellation, not a permissive harness string or fpStartup disguise. Modified
   symbols: retainFPStartup's shared implementation/binding accessors,
   node-entry dispatch/start/cancel, getFPHostStartup/createLoginomHost,
   connection.prepare, supervisor control/start relay, strict start validator and
   managed startup reader. Preserve all FP wrappers and original owned-await vs
   propagated-primary handling; genuine equal false/undefined remains secondary.
3. Capture-phase extension is separately missing, not supplied by FP startup:
   Amount capture closure/HostPort admission must retain and verify the original
   bound operation/request/run/lease/generation/chat/account against existing
   host lease authority BEFORE capture dispatch. Supervisor + managed acceptance
   branch carry ONLY a closed bound cancellation proxy and original absolute
   deadline scalar; same original child/control operation through pending and
   settlement. Bridge privately registers it with amount-caller-control.mjs and
   invokes captureControlledAmount. Preserve original generation guards,
   pending cross-name publication, atomic IO, cleanup and deferred ACK.
   Shared symbols: HostPort acceptance.capture/assertCapture, supervisor.request,
   managed acceptance.capture/cancel, bridge.captureAcceptance. No generic
   registration/public opcode/DTO relaxation, no remint/replay/replacement.

Original tuple/provider gate

Stock capture(run) obtains its run AFTER launch. A requested tuple/string label
cannot be called an acquired original lease before the first launcher await.
The integrating private caller must supply a genuinely already-retained own
root/lease binding if that prelaunch tuple is required, or Registry must specify
the distinct startup-control and later capture-binding stages explicitly.
Missing original root/tuple is ORIGINAL_BOUND_TUPLE_PROVIDER_UNAVAILABLE; no
late binding/expiry/new timeout is silently relabelled as original authority.

Qualification after approved implementation

Actual fixed installed Amount export -> existing host/HostPort/supervisor/managed
-> bound proxy -> unchanged controlled Amount read/record -> evidence/cleanup
settlement. Parent original signal object identity separately from child proxy.
Preabort/expiry/foreign/substitution/late/pending/lost/UNKNOWN/deferred ACK and
genuine equal-value rejection tests on real IPC/FS; Page/preparation/native
drivers labelled doubles. Source facade/standalone compiled helper or a replaced
capture callback cannot satisfy selected embedded private ABI.

Current result is applicability/refusal only. No shared runtime hunks written;
no positive Amount wiring/native/mutation/release proof. Independent component
PASS694 and historical UNKNOWN/pending/journals/old pins remain intact.
