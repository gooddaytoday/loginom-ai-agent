## Cleanup receipt physical completion

Correction of the receipt writer only, based on ba2dfd457. The previously
confirmed native cleanup receipt, identity binding and lifecycle guards remain
unchanged. Native cleanup is never repeated for evidence repair.

The bridge owns receipt and directory descriptors from Node's callback fs API.
Only success from the original close callback establishes completion. Descriptor
retirement, FileHandle fd=-1, close events, status, a projected promise and EBADF
are not proof. Open/write/fsync each retain their original pending operation.
A lost/unknown callback prevents closing that descriptor, opening a replacement,
setting cleanupReceiptWritten, closing transport or releasing uploads/owner.
A genuine late callback permits evidence-only repair on the same owner.

The completed sequence is receipt write → receipt file fsync → original file
close callback → parent directory fsync → original directory close callback →
cleanupReceiptWritten → transport/release. First Error/undefined/null/false/0/
empty/cause remains separate from secondary persistence/close failure. Binding
is checked before retry; foreign directory/session cannot write evidence.

Addressed test: client/test/cleanup-physical-close.test.mjs forks the exact whole
bridge support fixture, receives 29 message-IPC reports and awaits child exit.
FS, descriptors, kernel queue/fstat, fs callbacks and child IPC are real. MCP
InMemory request preparation/save is exercised. Page/Ext/native/services and
injected fault replies are doubles. No Loginom/native teardown or kernel IPC
release/ACK claim follows from these fixtures. Missing native close callback
cannot be repaired by EBADF or repeating that close. Callback-error disposal
closes only the fixture descriptor after assertions; it is not production ACK.

Legacy FileHandle fault-injection tests require callback-backend adaptation;
no broader unchanged suite PASS is claimed. The unchanged reviewer counterexample
against the parent remains 1 PASS / 2 expected FAIL. The new original-callback
controls replace its backend injection without weakening the completion guard.
