Acquired capture phase component · node-orchestration-v3 / MAS-artifacts-v1

This first Stage-B cut closes the accepted FP08 acquired-chat forwarding gap.
It does not enable Amount's fixed factory or its capture proxy. StageA328's
closed Amount receiver/refusal and both original startup reason wrappers are
unchanged. No Resource purpose or public API is added.

The actual connection service returns an internal lease capability with
`assertCurrent()`. It checks the original map entry, active/recovery state,
connection generation, readiness and ongoing connection work. Released or
reacquired same-run/same-generation labels cannot revive that original object.
The service also retains the exact returned object and original callbacks in a
private WeakMap; assertLease checks its owner/run and currentness without ever
consulting a substituted callback on a structural clone. bindCapture uses this
provider check before creating the root and on every later guard.
This is host lease currentness, not native Page/document/mutation authority.

Only the existing HostPort acquire route passes its actual lease to
`host.bindCapture(owner,run,chat,lease)`. For the original controlled FP startup,
the host privately retains that exact lease, current generation/connection and
capture binding, and compares them before/after runtime awaits. The original
receiver control/request/auth/deadline and first-reason implementation are used.
Capture expiry is bounded by that original deadline; no new budget is minted.
Capture admission checks the same retained capability before/after journal and
runtime awaits, including cached children. These roots remain retained after
unknown effects; no new settle/release/cleanup/ACK operation is introduced.

Readiness keeps its original four-key `fpStartup` packet and readiness-only
schema. Acquired FP chat uses the separate exact six-key packet:
`authorization,binding,deadline,harness,phase,requestId`, phase=`capture`.
Binding must equal the existing strict acceptanceCapture tuple in all fields;
the harness remains only field-parameters-preservation-v1, acquired chat is not
readiness, and capture expiry cannot exceed original startup deadline.
Amount and Resource cannot relabel themselves as this FP authority.

Host launch supplies this packet only from the retained provider; supervisor
checks its original references and passes the same lineage to the original
managed child. Startup cancel includes managed requestId, original outer
startupRequestId/auth/deadline and exact capture binding/phase. The managed
reader retains its original received packet/binding and checks drift before
and after owned awaits, then binds its actually created Page/context owner to
that child signal proxy. The proxy is distinct from the parent's original
AbortSignal reference. Imported control primary and genuinely equal subsequent
owned rejection stay separately boxed; no propagation event is fabricated.

Readiness qualification is still not mutation admission. Without an owned
configure/editor/store, the real bridge/executor must retain its existing
LOGINOM_FP_DRAFT_UNKNOWN refusal, journal and recovery lease before collector
or mutation. No native authority is inferred from fixture Page/SDK labels.

Open source67 remainder

The Amount original caller/control/fence9ea9 needs the internal common provider
seam to link its StageA grant into actual host acquisition. Its receiver still
refuses ORIGINAL_BOUND_TUPLE_PROVIDER_UNAVAILABLE; neither a test-supplied root
nor an FP packet bypasses that gate. This cut supplies actual lease currentness
and the strict FP acquired-phase shape, not the closed Amount purpose reader.
That next reader must reuse common guards/reasons while retaining Amount
operation/request/startup auth and original absolute deadline separately.
HostPort capture → supervisor → managed acceptance/cancel → Amount consumer
proxy plus evidence/cleanup settlement before ACK also remains unimplemented.
Source69 owns only its fixed entry/builder/fence integration; source68 owns
only its separately assigned native/Resource-specific inputs, and Import71's
accepted private capture hunks are not overwritten here. Full native, current
safety, source proof, model isolation and node acceptance remain NOT_VERIFIED.

New addressed controls: actual fixed FP launcher → actual receiver/host and
HostPort acquisition → source-compiled or installed supervisor/managed phase
→ real bridge/executor refusal. IPC/FS are real; SDK/Page/native/session/catalog
are explicitly labelled doubles. Hold/fault controls affect only native login
await, not production factory/grant/provider/capture callbacks. Same original
pending reply is checked before held await settlement; child exits are fixture
finalization, not native Close or cleanup/release/ACK proof. Closed328/487/FP37
suites are not rerun.
