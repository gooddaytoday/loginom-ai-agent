# DataPartition: execution baseline proposal

Status: approved by owner interaction8a9e0227-fb03-4848-b185-0adc05697688; implemented-source, native retest NOT_RUN.

Exact current candidate: `11ed7f7d95bf050a8f146b2803b6c538e3244708`.
Attempt: `LOG-52-public-e97416e0-3`, own slot a, qualified wrapper.
The native biased wizard creates root 3 (`Активация входов узла`),
then explicit Execute creates root 4 (`Активация узлов`). Both own children
bind the same DataPartition node. The existing driver captured roots 1/2 before
configuration and correctly rejected two new roots. The operation was inspected;
local and wrapper cleanup confirmed closure/logout. This attempt remains FAIL.

Proposed minimal shared change in `calculator-node.mjs`:
- Optional implementation flag `prepareExecutionAfterConfiguration`, only set by DataPartition.
- In openWizard, create the standard execution driver but defer its prepare when the flag is set.
- In finishGraph, after all configuration/output commits and graph selection, call the standard
  driver's prepare for execute immediately before finishConfiguredGraph.
- Other handlers retain the original timing. Close/Done do not execute.

The standard driver, opaque channel, baseline capture, single-new-root requirement,
owner/SHA/identity/deadline/journal guards, launch-once rule, stop and completed proof
remain unchanged. Never select the last process or discard arbitrary roots.
Addressed tests must prove deferred preparation follows configuration, precedes launch,
and that other handlers preserve their baseline timing. Fresh exact-SHA build/native
bias/math/recovery/CLI/cold are required after approval.

## Implemented refinement after owner approval

The original pre-configuration baseline is retained as a history checkpoint.
Only DataPartition installs an optional deferred prepare hook. After confirmed
configure/output commits, it prepares a fresh standard driver and compares both
baselines with the fully journaled native process inventory. At most one added
group is permitted: completed `Активация входов узла`, one native-model-owned
child matching the requested node. Unknown/actual Execute captions, wrong owner,
extra roots, reused/missing records, stale root and already-launched baselines fail.
Uncertain transport or missing commit proofs fail before prepare. The shared hook
can run once; its attempt flag is set before any work, including a lost reply.
The standard driver's single-new-group/launch-once/owner/completion guards remain.
Fresh native/CLI/cold acceptance is NOT_RUN; source tests do not prove product PASS.
