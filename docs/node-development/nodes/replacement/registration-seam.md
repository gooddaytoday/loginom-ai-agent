## Fixed Replacement registration: prepared ABI and missing seam

Prepared on `599ef7b8bedc4350acacdea14c2e045d0cddac2d` in separate
`replacement-admission` worktree/branch. Runtime/product remains
`9c4da2d30af26ff2aef2dde83cedab1463eef736` / 202610120237.
Process: node-orchestration-v2. This is a private contract proposal, not a
registration/admission implementation or native safety proof.

The executable proposal is `scripts/node-acceptance/replacement-fixed-abi.mjs`.
Its compiler calls the existing `makeReplacementCaptureCode(request)`;
it rejects supplied authority, callback/module/Page operands and accessor data.
Its result check binds native before/after and both actual observer projections
to the same request, with effect=false/admission=false and every existing gate
not_verified. It cannot authorize capture, release, close or replay.

### Fixed binding/context/result

Kind: `replacement-input0-readonly-v1`; fixed runtime resource:
`runtime/src/acceptance/replacement-input0-readonly-v1.mjs`.
Only `transform.replace_columns`, input port 0. No request-selected resource,
user script, public opcode or callback. Resource/node/host canonical inventory,
hash and realpath checks remain in the existing generic launcher, not here.

Host-minted envelope must retain original owner/run/lease/generation/chat,
admission, account, packagePath, session and the original expires/deadline.
It must reject duplicates, stale/foreign grants, cancel and late dispatch;
it must not renew an expired deadline. This envelope is absent on PR55.

Inside managed runtime the fixed branch must receive the original actual
startupOwner/context/Page, session, original AbortSignal/deadline, and the
bridge's existing executor. They stay process-local; never serialize handles
or let IPC/request data provide them. No new registry/retention mechanism.

Node identity comes from the current native preparation/opening receipt and
the original local request owned by that same run, not from labels, supplied
verified objects, Calculator/Amount authority or the package path alone.
Required raw references: document/package/workflow/node/input0/connection,
epoch, opening receipt, original request. Every await must recheck the same
references and current pending/RUNNING/unsettled/known dirty/resource state
before another read or dispatch. Unknown/missing observations refuse.

The consumer request is exactly binding, account, package_path, origin, build,
port_guid, opening_operation_id; optional scoped output_column_page.
The read result is DIAGNOSTIC_READ or NOT_APPLIED, linked raw observations,
effect=false and no settings/execution/close authority. A valid diagnostic
result is neither native admission nor a successful teardown receipt.

### Concrete receiving gaps

PR55 `599ef7b8`: node-client.ts has only launchNodeHost; host.ts has no
bindCapture/authorizeCapture; start-input drops unknown acceptanceCapture;
managed-entry has no fixed loader/capture dispatch. No generic grant can be
minted or transported by adding only a Replacement branch to these bytes.

Read-only inspection of LAB-68 `ba2dfd457724ba4b273be2f621892adb54801b10`
finds the generic launcher/grant/loader in its source, but not an applicable
accepted series for this receiving branch. Its bridge captureAcceptance passes
only `{binding, identity, browser, record}` (sorting additionally ordinary),
not original Page/context/owner or retained node/input proof. The default
receipt requires Calculator cancellation, while Import has a special PARTIAL
branch. Replacement must not inherit either authority. Capture-writer remains
under LAB-68 with unresolved P2; common PATH under LAB-71. Neither is copied.

### Exact requested bridge seam (proposal, not applied)

On the reviewed generic bridge base, the only extra process-local field is an
owned `retained` slot on acceptanceCapture for the fixed Replacement kind.
The managed-entry producer supplies original startupOwner/context/Page/session
and signal; the bridge supplies its actual actionRuntime/executor and raw
preparation/local-node receipt. No structural request flag can create this slot.
The fixed module performs fresh native reads and returns only a partial,
read-only diagnostic result. The two bridge additions are:

```diff
@@ captureAcceptance: fixed harness arguments
 const receipt=await acceptanceCapture.harness({binding, identity, browser, record:recordExecution,
+  ...(binding.harness==='replacement-input0-readonly-v1'
+    ? {retained:acceptanceCapture.retained, runtime:actionRuntime,
+       session, prepared:session.metadata.workspacePreparation} : {}),
   ...(sorting?{ordinary:structuredClone(sortingResult)}:{})});
@@ after assertBound(), BEFORE Calculator cancellation receipt check
+ if(binding.harness==='replacement-input0-readonly-v1') {
+   // Static fixed module validates linked request/native/projection identity.
+   // Missing gates/current resources refuse; never satisfy cancel/close proof.
+   captureEvidence={binding,identity,receipt};
+   await persistCapture(); // existing sole LAB-68 writer, no replacement copy
+   throw Error('LOGINOM_REPLACEMENT_ADMISSION_NOT_CONFIRMED',{cause:receipt});
+ }
```

These are proposed hunks, not a ready-to-apply fix: admission checks and
receipt validation belong before persistCapture, and its current unknown/
persistence state transitions must be preserved by the sole writer author.
In particular the snippet must NOT let a fabricated/foreign receipt reach IO.
Registry must assign/approve this bridge seam and identify the minimal reviewed
generic grant/launcher/start/dispatch prerequisite series. Then LAB-73 implements
the allowed Replacement branches and fixed resource against that actual ABI.
No whole LAB-68 branch/shared blob, generic writer or PATH correction is copied.

### Addressed prepared checks and remaining acceptance

New tests exercise compiler/result ABI with the real serialized native reader
and observer on labelled native/DOM doubles, including accessors/foreign
projections and supplied affirmative authority. They do not repeat the old
14/58/40/284 suites or claim registration-to-retained-host composition.

Host/IPC registration, run/lease/generation ownership, deadline/cancellation,
actual original Page/context/executor, current resources/dirty/pending/RUNNING,
writer durability/unknown and same-owner cleanup remain NOT_READY. Error/falsy
and no-replay controls for those paths must run after the applicable seam exists.
No native/Loginom/model/Save/replay/download/cleanup is authorized by this
proposal. Historic UNKNOWN/pending/journal/Typed FAIL/profiles/LGP are preserved.
