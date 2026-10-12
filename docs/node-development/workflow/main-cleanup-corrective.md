## Main cleanup post-await corrective

node-orchestration-v2. Separate corrective over886e; generic/readonly/pre-READY
and consumer/atomic policies are not included.

The first cleanup call retains its original shutdown tuple across retries.
A parsed successful native receipt is escrowed with that original binding,
without publishing a confirmed cache/receipt/marker. A post-await tuple refusal
occurs before those publications or IO. Restoring the same tuple promotes only
that verified receipt to storage repair; original native session identity and
nullable save operation are preserved. Native Close/logout are not replayed.

The entry guard refuses unresolved original IO/open/close callbacks. Once an
original open/write/fsync callback is delivered, it admits only the existing
writer drain before any replacement storage write. Descriptor state/EBADF does
not prove completion; the actual callback remains necessary.

Settled transport close failures are classified before the secondary binding
check. The original Error/cause and all falsy values remain the primary; safe
failure-publication refusal stays secondary on the captured original destination.
No failure IO can follow a replacement destination, including subsequent Close.

Whole-module reviewer controls exercise real FS/descriptors/original callbacks,
InMemory MCP and child IPC. Page/Loginom/helper/services/SDK/policy are doubles;
helper counts do not prove native teardown/ACK. Closed373/readiness/kernel audits
are not repeated. Minimal receiving follows applicable independent review only.
