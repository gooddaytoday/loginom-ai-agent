Sorting receiving pre-close contract (consumer preparation)

Process: node-orchestration-v1. Runtime baseline: c4572d85bc38977994361ebb973a46fa80116525,
PR49. Owner approval: 01a12d6c. Source implementation belongs to LAB-68;
this document and its tests do not implement or grant upstream authority.
Import approval 01a12d74 belongs to LAB-68/LAB-71 and is excluded here.

The consumer accepts only the fixed readonly Sorting §3–4 audit after ordinary
RunCommand.parseAsync and before host.close/release. No caller-supplied callback,
code, resource path, new MCP tool, IPC opcode or public CLI option is accepted.
The exact selector, receipt encoding and inventory entry must come from the
independently accepted LAB-68 source; specimen field names below are test data,
not a new protocol. Source PASS does not establish receiving or native PASS.

## Existing route and missing seams

| Current source | Existing state/route | Receiving implication |
| --- | --- | --- |
| agent/src/cli/standalone-run.ts:53–60,100–101,129–136,149–169 | Original Node host, deferRelease owner and lease Set; parser completes before cleanup finally | Audit must use this owner before close, including primary Error/falsy handling. Currently there is no pre-close audit invocation. |
| loginom-host/src/adapter.ts:16–69 | Closure captures the original transport; acquire creates private run UUID and stores generation; deferred release retains lease | Do not reconnect or acquire another run for audit. Generation alone is not authority. Run/chat/deadline are not exported by this lease. |
| loginom-host/src/host-port.ts:13–27,55–73,96–123,132–195 | Host maps run→hashed session chat→actual lease; tools uses readiness child, call/admit use run.chat | tools/readiness is not the original run Page. Fixed audit must route to the actual retained run.chat under host authority. No such Sorting selector exists yet. |
| loginom-host/src/host.ts:53–93,213–224 | generation→connection/children; supervised runtime keyed by generation/chat | A new child/restart/validation/readiness Page cannot substitute for the original. Preserve journal and runtime identity. |
| loginom-host/src/node-client.ts; node-entry.ts:88–105 | Existing acceptanceCleanupPackage forwarding only | A cleanup path grants no capture authority. Do not import Calculator diagnostic admission as a substitute. |
| loginom-host/src/node-entry.ts:178–204; host-port.ts:208–221 | Outer stop awaits host.close and records acknowledgement before port.close releases runs | Fixed capture evidence must precede this sequence; failure must not bypass it. Existing records use writeFile, not an fsync proof. |
| runtime/src/start-input.mjs; managed-entry.mjs:118–220,234–269 | Private start binds generation/chat; browser context and bridge stay inside the managed child; ordinary call reports recoveryPending/activeWork | Source must mint and consume the fixed grant against these actual objects. Caller labels, GUIDs or a copied receipt cannot mint it. |
| runtime/client/lib/bridge.mjs:502–630 | Same bridge binds preparation, settled save/current tab, native cleanup and durable SUCCEEDED/journal retry | Audit failure never bypasses native cleanup gates. Classic transport receipt is not managed package/logout proof. |
| loginom-host/src/transport.ts:45–68; managed-entry.mjs:263–265 | Per-RPC default 180000 ms and SDK timeout 105000 ms | These are not the original run's absolute deadline. Current acquire/call/lease does not carry a proven upstream deadline. Missing/expired deadline must refuse, never mint Date.now()+budget. |

The acceptance binding must be host-minted and non-transferable, tying the same
run, lease, generation, chat, managed runtime, Page/context, account/connection,
document/tab/package/path, workflow/node/port/output/execution and mutation
sequence. Native identity and settled state must be freshly verified by source.
Consumer metadata and fixtures cannot replace this proof. A readonly task does
not imply Package.ReadOnly=true or dirty=false; preserve the ordinary save guard.

## Capture and cleanup consumption

1. Preserve ordinary model completion/error separately from audit/persistence
   errors, with an explicit failed flag; Error/null/undefined/false/0/empty string
   remain failures. Retain the original host/client/adapter/lease and operation.
2. Require the fixed selector and exact resource inventory/hash before dispatch.
   Require the proven original absolute deadline and sufficient remaining budget.
   Wrong/missing/foreign binding, stale Page/generation/chat, pending/RUNNING/
   unsettled/unknown, expired budget or incomplete capture must refuse.
3. Read the actual original Sorting key list, full priority/directions/string
   flags, positional schema/types/null/precision and complete ordered output
   including duplicates and execution freshness. Preserve raw cells and receipts.
   Numeric oracle remains independent; locale/Variant/NULL ordering is not inferred.
4. Capture/result/refusal and primary/persistence causes must be durably recorded
   on the existing private evidence path (file and directory fsync) before cleanup.
   A resolved write/rename or a caller boolean is not durable acknowledgement.
5. Only same-owner bound native package_closed/logged_out, discard=false and
   durable cleanup/journal receipt can permit release/transport/browser/exit.
   Wrong/missing receipt, persistence failure or unknown effect retains the owner.
   Verified SUCCEEDED retry may finish evidence, never repeat native close/logout.

## Reviewable negative specimens

The companion test has two deliberately separate sections: existing real
adapter/HostPort/transport/caller seams with service/Page doubles, and consumer
contract specimens. Specimen acceptance is not an implemented upstream guard.

| Case | Required consumer outcome |
| --- | --- |
| wrong selector/resource, missing binding/inventory | No capture admission or cleanup success inference |
| foreign run/generation/chat/Page/connection | Refuse; original client/lease remains authoritative |
| unknown/incomplete read, pending/running/unsettled | Refuse without reset/replay or new acquire |
| missing/nonfinite/expired upstream deadline | Refuse; RPC timeout does not extend the run |
| scenario or cleanup Error/falsy refusal | Preserve explicit failed state and exact rejection |
| durable capture/cleanup failure or receipt missing | Retain owner; no release/disconnect/exit acknowledgement |

Current incompatibilities are concrete: no ordinary audit entry, no host-minted
Sorting selector/binding to run.chat Page, no proven deadline propagation,
no fixed capture/durable receipt consumer. Current standalone catch converts
ordinary errors to CLI_RUN_FAILED; the source integration must preserve the
primary separately. Existing diagnostic-session persists via write/rename and
does not fsync, so it is not the promised durable upstream capture receipt.

Minimal future receiving hunks, only after applicable source PASS: ordinary
standalone-run pre-close invocation/primary preservation; existing adapter and
host-port run/lease routing; host/node-client/node-entry/start-input forwarding
only where the fixed source needs it; managed-entry fixed resource/selector and
bridge capture/proof/cleanup consumers; exact inventory entry and addressed
tests. No whole bridge/host blob, Import/Calculator/Amount, navigation/observer
changes or new source implementation belongs to this preparation.

Offline command: `bun test ./packages/agent/test/cli/sorting-preclose-consumer.test.ts`.
No native/model/setup/execute/replay is authorized by this contract. The current
product remains the clean c4572d85 product; docs/tests alone need no rebuild.
