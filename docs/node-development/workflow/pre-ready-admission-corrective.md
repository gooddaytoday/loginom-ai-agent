## Pre-READY admission boundary corrective

node-orchestration-v2. Separate narrow corrective over2cd4875d; main768769 and
genericdbac are not included. Original public HostPort/model gap remains.

Managed admission increments a private in-flight counter before its first await
and retains it through inputs publication and reply, with a finally decrement.
Pre-READY handler and original owner qualification refuse while that counter is
nonzero, before controller/held-state mint or fixed read dispatch. Multiple
original admissions remain protected until all finish. Cached synchronous
admissions have no asynchronous crossing.

Busy refusal does not cancel/discard/replay the original admission or mint read
held/ACK/release authority. Original owner, work and Error/falsy handling remain;
caller original signal/absolute deadline forwarding is unchanged. No allowance,
public tool/schema, model/rights, lease/cleanup or serial scheduler is added.

Production managed/bridge/admission checks and real private caller child IPC use
real FS/InMemory MCP/Node IPC. Artifact-store service/Page/auth/resources/native/
SDK/policy are doubles. Native/FP/current-safety/full acceptance remain open.
