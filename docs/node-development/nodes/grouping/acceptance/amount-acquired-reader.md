The common Amount reader is a separate private protocol component. It does not
select the staged Amount entry, register a native owner or admit capture.

Stage A retains the accepted original operation/request/auth/deadline in
`retainAmountStartup`. Only a trusted early receiver may bind that object with
`bindAmountHostStartup`; JSON fields cannot populate either private WeakMap.
The fixed Amount receiver currently refuses before host creation with
`ORIGINAL_BOUND_TUPLE_PROVIDER_UNAVAILABLE`. This gate remains until the original
Source69 staged launcher connects its retained control/handle to the receiver.
No test-supplied grant is an end-to-end qualification of that route.

After supported acquisition, host `bindCapture` uses the original service lease
(`service.assertLease(lease, owner + ':' + run)`), actual generation/connection,
account and chat. It retains the same lease object and current connection
reference, immutable capture fields, original startup guard and absolute budget.
Before/after runtime awaits, the capture guard refuses replaced/released/recovery
leases, foreign tuples, lost/stale chats and deadline drift. It never reacquires
or derives a new startup deadline from expiry. Legacy Amount remains unchanged.

Supervisor serializes `amountStartup`, never `fpStartup`: readiness has exactly
`authorization,deadline,operation,purpose,request,requestId`; capture adds only
`binding,phase`. Purpose is literally `amount-import-type-v1`. Capture requires
an exact matching Amount binding, account/generation/chat/lease/path and an
expiry no later than the original deadline. Both packets cannot coexist. FP
retains its existing four/six key contract.

The managed Amount wrapper uses the one original child controller, request IDs,
operation/request and full binding for authenticated cancellation. It retains
raw primary and a genuinely new owned late secondary, including equal false or
undefined. Original start stays pending until owned await settlement. The shared
managed implementation applies the existing owner/context/Page identity guards
and never substitutes a copied parent signal or native authority.

`amount-start-phase.test.mjs` qualifies the reader only. The IPC diagnostic uses
an explicitly labelled protocol child, actual Node/FS/IPC and installed defining
reader bytes; its valid packet is routing compatibility, provider/native
Authority=false. It does not run the selected factory, actual managed native
startup, Amount collector, journal or cleanup. Fixture close/exit is orderly
protocol finalization, not native cleanup/release.

Remaining exact seams: Source69 `launchStagedAmountDiagnostic` → common trusted
receiver binding (`node-entry.ts` still refuses); actual fixed launcher/acquire
route qualification; private same-child capture cancellation proxy from HostPort
through supervisor/managed to accepted694 `registerAmountControlProxy` and
`captureControlledAmount`; evidence/cleanup settlement before ACK. The immutable
694 helper input manifest is available but no bridge/consumer blobs are copied
in this component. Import f421 closure inputs are a separate receiving cut;
`privatecaptureNodeOperation` is not an exported symbol. Native/current safety,
values/persistence/full writer union/full-node remain NOT_VERIFIED.
