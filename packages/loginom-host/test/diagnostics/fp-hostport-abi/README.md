This diagnostic identifies the ordinary transport → retained HostPort ABI gap on runtime d7a0c936aedf432150397867e7167a15da81d256. It does not implement or accept FP caller qualification.

Run `python3 run.py --product EXACT_PRODUCT --out NEW_EVIDENCE_DIRECTORY --bun BUN --node NODE` from this directory. It runs six addressed controls for each HostPort phase. The source phase compiles the unchanged whole HostPort and dependencies. The installed phase imports the exact compiled HostPort/errors/crypto section of `resources/loginom/host/node-host.mjs` in a real Node child without recompiling that section. Parent transport is the unmodified SOURCE transport in both phases, explicitly not a new installed CLI caller claim. IPC and journal file writes are real; services, leases, runtime/read/native inputs are labelled doubles. Children exit with recorded code 0; fixture directories and ledgers are retained.

Expected/actual boundary:

| Control | Expected actual observation |
|---|---|
| Ordinary `readonly.preReady` / cancellation request | HostPort rejects, internal read=0/runtime dispatch=0 |
| Submitted authorization/deadline/ready/storageBinding | Capture rejects, no authority minted |
| Aborted signal and expired absolute deadline supplied as fourth request argument | Existing transport ignores the unsupported argument; read-only `call` dispatches without that control. This is a proven ABI gap, not a successful cancellation guard. |

The private installed supervisor has `readPreReady({signal,deadline})`, but HostPort has no route to it. The fixed diagnostic launcher exposes only `capture(run)` and ordinary `transport.request(method,input,timeout)` serializes `{id,method,input}`. Model JSON cannot provide an AbortSignal; a submitted deadline/nonce/boolean is not retained owner authority. PRE_READY_CLOSED_READ cannot substitute preparation/storageBinding/FP admission.

Minimal additional internal seam to approve: `packages/loginom-host/src/transport.ts` needs a private controlled-request ABI tied to its existing request ID, original AbortSignal and absolute deadline, exact-ID cancellation and disposal after settlement. This file was not included in the agreed host-port/node-client/supervisor seams. Merely placing controls in JSON or creating a new controller in HostPort would fabricate authority. A parallel custom Node-client RPC would duplicate this shared mechanism; it is intentionally not implemented.

After that scoped approval, the fixed FP diagnostic launcher can retain the private authorization from its existing WeakMap, forward the original control through the controlled request, and HostPort can resolve its current run/lease/generation/chat and original supervisor runtime before/after await. The managed qualifier remains the authoritative original owner/Page/context/session/metadata/directory/session-ID checker. No public tool/schema/execute exemption is required. A positive pre-READY read still yields ready=false/cleanupComplete=false and holds recovery; it does not authorize subsequent FP capture on the unprepared runtime. Prepared admission/native resource guards remain a separate gate.

Late replacement/dirty UNKNOWN/pending/unsettled checks at the final FP delivery boundary are unchanged, not revalidated by these ABI controls. No production file is modified. Main47/managed/custody/origin/FP/observer bytes remain unchanged. Native authority/isolation/current safety/values/persistence/cold/full writer union/full-node acceptance are NOT_VERIFIED. No login/model/native/cleanup/release/replay operation is performed.
