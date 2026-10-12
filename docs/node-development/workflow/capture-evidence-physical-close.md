## Private capture evidence physical completion

Correction on common PATH148d. Only bridge capture evidence IO/state changes.
The fixed harness, selector, authority checks, Calculator validation, cleanup and
managed/host/launcher contracts remain unchanged. No new native scope.

Retain each original fs open/write/fsync/close operation and owned descriptor.
Only the delivered original close success callback establishes completion, not
fd=-1/status/event/returned promise/EBADF. Unknown IO prevents close/replacement.
First Error/undefined/null/false/0/empty/cause remains separate from secondary
close/persistence failure. Late genuine callbacks permit evidence-only repair.
A rejected close without completion cannot be retried on that descriptor.

Freeze checked capture bytes, source evidence reference and session/directory
binding before IO. Refuse mutation/foreign binding before repair. Write file →
file fsync → original file close → directory fsync → original directory close
before captureReceiptWritten. Journal completion precedes captureJournalWritten;
repair of the journal does not rewrite the already completed capture receipt.
Drain unresolved writers even after receipt completion, including writers used
for the diagnostic failure receipt. Do not open diagnostic/new evidence before
previous physical completion. Diagnostic storage failure never masks capture's
original rejection. No checked/native reader is replayed; the consumed grant and
unknown/capture refusal state are unchanged until evidence-only repair settles.

Addressed47 source/actual controls:32 whole bridge/kernel cases plus15 affected
transaction guards. Whole bridge tests include real FS/kernel/callbacks/MCP
InMemory requests and child message IPC. Fixed harness, native Page/services,
action runtime and fault replies are doubles. Transaction VM exposes exact
production functions; identity/pending/RUNNING/unknown and Error/falsy assertions
are retained. This is not native capture or whole retained-host admission PASS.

Parent reviewer sync0/secondaryclosefalse counterexample remains1PASS/1FAIL on
source/installed148d. Its FileHandle injection is not a callback-backend test.
No main managed/cleanup writer blob is imported. Receiving still needs exact
composition review; generic slot/result and full Import clean/read-only Close
remain NOT_VERIFIED. Ordinary/native actions stay prohibited on other known
unreviewed kernel-close paths of the common baseline.
