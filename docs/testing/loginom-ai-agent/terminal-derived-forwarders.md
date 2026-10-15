Bounded CODE/OFFLINE derived-forwarder custody, from accepted `fe6f1799`.

The existing capsule provider retains Task.js `toPromise`, `then`, `catch`,
`finally`, the original secondary-task reader, and Promise prototype methods
before creation. Immediately after the already observed secondary birth it
invokes these four originals on that same secondary task. Temporary own
`toPromise`/`then`/`getAwaitedResult` overlays delegate once to the captured
functions. They preserve the original returned promises and original reader
outcomes; none replaces a promise or completes a native task.

Four base promises and four forwarder returns remain private capsule refs.
`then`, `catch`, and `finally` return their original chained promises. Observer
callbacks consume their own observer results and record settlement, including
raw falsy rejection. Read and settlement inspection arrays are frozen snapshots.
Forwarder overlays survive the earlier primary completion restoration and are
removed only after their four settlements. Restoration is scoped to those
patches, so it cannot remove overlays of a later storage operation. Foreign
slots are never overwritten. Pending drift remains sticky and prevents native
reader/resolver continuation. No additional RPC, controller, timer, deadline,
Save, Close, release, or cleanup was added.

Targeted controls (`^derived forwarders`) execute whole pinned mscorlib.js and
Task.js in one VM. They cover original returned Promise/receiver/reader identity,
all four forwarders, getter-blind pending drift, Promise/method/prototype
substitution, raw first Error/falsy versus subsequent drift, and the existing
packet/control storage route `[0,907,909,910,911]`, writes zero. Page, native
session, dispatch task, SDK, PID, and catalog are doubles. Native Promise, VM,
AbortController, MessageChannel, and FS are real. No native Loginom or model
operation ran. The early setup FAIL (VM builtin Promise is not an own external
context property) is retained in diagnostics.

This observes the defining surface and the promises returned by these retained
functions. It does not observe hidden lexical callee identity or prove that a
matching function text has a particular opaque closure. `lexicalCalleeIdentityQualified`
remains false. Source execution/closure/source bytes/native receiver and four
authorities remain false. `NATIVE_LEXICAL_QUALIFICATION_MISSING` and stock H0
refusal remain. Closed birth26, completion52, H0, ordinary, SRI, boot, 86/76 were
not repeated. Extra3 host response receipts remain the next separate step.
