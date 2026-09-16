# Isolated method321 diagnostic prototype

User authorization: `node16:variant-prototype:1:direct-user-20260913`.
Only Loginom7.4.2, own test-1 browser/process/package,50rows×8columns maximum.
Not imported by public handlers; not a plugin or alternate general transport.

`raw-read.mjs` exports `readFixedVariant(page,binding,decodeVariantFrame)`.
The operator must first perform a verified UI execution, open its output Preview,
verify the fixed frontend SHA, and create a binding from that execution receipt
and the currently owned datasource identity. The binding includes document/workflow/
tab/prefix/node/output0/source object/schema/count, completed execution ID,
fixed method321/interface116 and an explicit bounded row/column selection.
The live experiment uses `collapse-live.mjs` in a separate source-runtime process.

The reader checks the original prepared workflow/package, actual Preview owner,
shared controller/table/store datasource, interface116 and fixed source object,
completed native process group and owned child, no newer execution, active node/
port, complete schema and loaded cache. These identities, process fingerprint and
cache object are rechecked before and after every read. Existing cache event
subscriptions clear/replace that cache; the prototype registers no listener.
Subscription cookie objects are NOT execution counters.

Only one explicit method is sent:321. Request Row int64/Col int32 follow the
pinned generated AsVariant implementation. No proxy AsVariant/getter/QueryInterface/
GetValues call, remote writes or exception-object unmarshalling are used.
Request/response buffers are released locally even after a failed check.
The host supplies a pure decoder; there is no installed wrapper/interceptor.

`decode.mjs` handles only observed/explicitly tested tags1/3/4/5/7/8/11/20.
Static rpc.js proves the 60-byte minimum transport frame. Padding and unused
variant-slot bytes are not scalar values. Extra bytes beyond the exact known
frame size, truncated strings, unknown codepages/tags and nonfinite numbers fail.
Signed64 never passes through Number. Float representation retains negative zero
and native width/bytes. Date preserves OADate bytes; generic timezone semantics
are deliberately not declared verified by this decoder.

`decode.test.mjs` uses synthetic protocol frames; `raw-read.test.mjs` checks fixed
method/cleanup and rejects replaced cache/new execution/stale response after the
simulated send. They are NOT live transport or full variant acceptance.
`audit.py RUN_DIR` independently decodes observed bytes and checks mixed/bounds/
local datetime cases, then performs eight destructive evidence substitutions.
Live binding negatives and stale-after-reexecute evidence are separate artifacts.

The verified run and limitations are documented in
`docs/loginom-dock/collapse-variant-prototype-result-2026-09-13.md`.
Do not invoke with a different model/provider, account, method, interface, build,
shared profile, arbitrary proxy or missing execution proof. Do not integrate this
reader or broaden its scope without a separate decision.

Hardening (isolated user authorization `node16:variant-hardening:1:direct-user-20260913`):
`readFixedVariant` accepts only `{operationId, timeoutMs, requireAtomicSnapshot}`.
The local operation latch permits one read at a time, rejects reused IDs, and retires
this diagnostic page after cancellation/deadline or a failure after RPC dispatch. `cancelFixedVariant(page,id)`
changes only that latch. `variantDiagnosticStatus(page)` returns bounded counters,
never session credentials. These are diagnostic state, not capture/transport hooks.
A late response releases its request/response buffers without decoding, publishing
or continuing to another cell. While no response arrives the native request buffer
remains owned by the callback; timeout is NOT cleanup or native cancellation proof.
Close the owned browser/process before another diagnostic session after retirement.

The result explicitly says `atomic_snapshot_verified:false` and
`consistency:observed_local_only`; requesting an atomic snapshot rejects before RPC.
Local identity comparisons cannot exclude an unobserved server ABA change. The
fixed method alone supplies no server revision/snapshot token. The public exact
variant contract remains blocked regardless of these diagnostic hardening checks.

`hardening-audit.py DATES_RUN [DISCONNECT_RUN [DEACTIVATION_RUN]]` independently
checks the new observed bytes, fresh DST/range UI, late cancellation cleanup and
optional local disconnect/deactivation evidence, with destructive substitutions.
See `docs/loginom-dock/collapse-variant-hardening-result-2026-09-13.md` for the
exact observed scope and remaining atomic/native-cancellation limitations.
