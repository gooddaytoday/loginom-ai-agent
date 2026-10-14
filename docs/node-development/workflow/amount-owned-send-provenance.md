# Amount managed send provenance

For the existing closed Amount capture request, the supervisor registers an owned
child.send callback Error in the original startup reason ledger before terminal
registry drain. An accepted cancel remains the boxed primary; a genuine new send
failure is secondary even when equal to the first value. No equality deduplication,
new budget/controller, retry, new cancel or cleanup/ACK authority is introduced.
A late callback with no original pending capture cannot mint ledger ownership.
Ordinary/FP send and disconnect policies remain unchanged.

owned-send.mjs is the unchanged frozen f76fccc5 conformance probe. It uses real
Node/IPC/child lifetime with named supplied startup/protocol operands and callback
faults, not a service grant/native provider. owned-send-extra checks accepted
undefined and identical Error(cause:false) primary/secondary boxes. The existing
capture protocol controls cover original frame/cancel/pending/once-only behavior.
Compiled source and verbatim installed defining supervisor are separate modes;
these are not embedded parent factory/native fault proofs.
