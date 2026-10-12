## Main cleanup binding and failure publication closure

node-orchestration-v2. Main source parent `c9b5a916a`; accepted callback writer
is `a0eab9d8013352ac7ed7a3bcd7e86e7064a4b683`. This is separate from common
capture IO and retained/readonly branches. No consumer algorithm, new atomic
policy or public interface is included.

The writer snapshots the original receipt/cache references, serialized bytes,
directory, metadata object and session ID before awaits. Every asynchronous
operation rechecks the same binding before another IO or marker. Paths and bytes
come from that captured binding. Descriptor closing still uses the original
callbacks and closes the owned descriptor even when its parent binding changes.
Pending IO/close refuses a replacement writer; concurrent Close shares the
original closing promise. A binding refusal leaves the marker false.

The caller captures its original shutdown destination before async cleanup.
Cleanup journaling, transport shutdown and publication recheck this scope.
Failure evidence uses the captured destination only when its original binding
and outstanding callbacks are confirmed. Otherwise it keeps the primary cause
and original custody, recording the evidence refusal in original metadata.
Failure publication does not follow a replacement directory. Restoring the same
owned tuple permits storage repair of the cached native receipt; Close/logout
are not repeated. Unknown native cleanup remains unqualified.

Addressed tests exercise the writer and actual whole bridge with real callback
FS, descriptors, MCP InMemory and child IPC. Page/Loginom/helper/services/SDK
are doubles; a Close/logout count is not native teardown acceptance. The caller
counterexample from LAB-66 is retained with its assertions unchanged and only
local fixture paths normalized. Existing accepted readiness/source audits and
receiving196 writer suites are not repeated.

Receiving applies only the writer binding/guard and closeBridge destination /
failure catch hunks over each card's stronger lifecycle code. LAB-66/67 keep
their direct writer policy; LAB-72's atomic adapter is not copied to main.
Receiving/native/current-resource/result-release readiness remains separate.
