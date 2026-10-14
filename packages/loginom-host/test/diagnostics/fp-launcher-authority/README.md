# FP installed launcher applicability diagnostic

Exact product: `36c11431ab923e09b0528d8046fd079c93589dfc`, artifact `437a9137b55ea8bd4083a901a210c40b910686247fe726f62e7259681f14fbdb`.

This is a capability/contract diagnostic, not FP authority admission or native readiness. It does not execute the product Node-host/browser entry. `child_process.fork` is explicitly substituted at that boundary with real Node child IPC to a labelled stub. Inventory reads/hash checks and receipt writes use real FS. Authorization is minted only by the actual SOURCE fixed factory and recorded as length/digest, never as a raw token.

Expected/actual at exact36:

| Boundary | Expected | Observed |
|---|---|---|
| SOURCE fixed FP inventory | Exact node/host/FP component/native-context entries before private grant | Reaches labelled startup with FP grant, then intentional refusal; child exit0 |
| SOURCE wrong package/node/host/resource root and submitted capability | No child dispatch | Five addressed refusals, forks0 |
| INSTALLED fixed FP factory | Required private constructor must exist | Absent: `FP_FIXED_LAUNCHER_NOT_INSTALLED`, forks0 |
| INSTALLED submitted `acceptanceCapture` | Must not confer authority | Refused, forks0 |
| INSTALLED ordinary caller with extra harness/authorization/package fields | Ordinary transport only | Labelled ordinary start; no grant/readPreReady/capture, child exit0 |

Nine controls: six SOURCE +three INSTALLED. Successful ordinary mocked handshake is not FP/native readiness. The two stub child exits are awaited; no native login/browser/model/prepare/Apply/Done/save/replay/cleanup/release occurs.

The installed minified Node-client defining block is 3136 bytes, SHA256 `a1861d8312bac0cf910a834f6cbbc73eb1855ba8ed78a42d6b362f464054d2b7`. It exports only the ordinary launcher, has a private WeakMap with no writer, and lacks the inventory/grant-mint implementation. SOURCE exports `launchFieldParametersDiagnostic`; production roots `packages/agent/src/cli/standalone-run.ts:4,52` and `standalone-command.ts:2,76` consume only `launchNodeHost`. Closed-read transport existing code cannot populate this WeakMap from submitted JSON.

Use the evidence runner `prepare-and-run.py` under MAS `use` to extract installed defining bytes and remap only the internal transport import/export names. `inspect-installed.py` and `run.ts` are the checked-in consumer. Keep fixture output outside checkout using `FP_AUTH_OUT`. The SOURCE factory is imported separately; it is never presented as the installed factory. No accepted 11+11+4 or closed component suites are repeated.

The proposed additional build/inventory seam and the future native contract are in `required-intersection.md` and `native-preflight-contract.json`. Runtime helpers, public schemas and generic caller routing are unchanged. Missing original owner/Page/resources remain NOT_VERIFIED; a pre-READY projection cannot manufacture preparation, storage binding or mutation authority.
