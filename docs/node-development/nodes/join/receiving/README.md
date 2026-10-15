# Import receiving preparation for LAB-71

Consumer-only plan, node-orchestration-v1, authorized Import scope
01a12d74-4084-7001-8db6-294572a3b341. Baseline production/product:
`0f85bff910d25d71eff716e17979bf3a2055ae8e`, PR52 → shared-oauth.
Source authority/implementation belongs to LAB-68 (running Sorting retained).
These documents, fixtures and acceptance assertions introduce no runtime gate,
public tool, IPC method, authority factory or native action. Source/actual PASS
and its reviewed private test seam are prerequisites for executing the scenarios.

## Existing routing and gaps at the baseline

| Seam | Already enforced | Import receiving requirement |
|---|---|---|
| `packages/loginom-host/src/adapter.ts:21-64` | acquired run/generation, per-lease call queue, release state | Retain the actual host/run/lease/generation/chat; no independent acquire or caller-minted binding. |
| `packages/loginom-host/src/host-port.ts:53-98,137-182` | exact run lookup, journal admission, recovery/competing-call gates, runtime from run lease | The source fixed selector must enter this retained transaction before dispatch. A post-model pre-close hook is insufficient. |
| `packages/loginom-host/src/host.ts:73-93,213-232` | retained generation/chat runtime and owner failures | No new process, rebinding to a later generation, or fake prepared object. Source branch additions are not present on0f. |
| `packages/loginom-host/src/supervisor.ts:125-156` | private request ID and timeout; acknowledged Close before awaited exit | Upstream absolute deadline must survive all awaits/retries. The request timeout is not an authority deadline. No `Date.now()+600000` renewal. |
| `packages/loginom-runtime/src/managed-entry.mjs:180-209,237-277` | same authenticated Page/MCP bridge; call serialization; accepted requests drained before Close | Fixed Import selector/resource must be host-authorized in existing private start/call seams, with no generic browser callback, model-selectable module path, public tool or IPC extension. |
| `packages/loginom-runtime/client/lib/bridge.mjs:169-186,271-324` | private serial browserGate, guarded prepare and storage binding | Source-owned fixed pre-config reader must share this bridge/Page/gate/deadline; observation and opaque clean receipt stay private. A upload receipt is not configuration/close authority. |
| `client/lib/executor.mjs:1774,2243-2272` | settled-operation check and current-owner verified uploads/history | No unknown/pending work or historical Map injection. Preserve exact destination/artifact/ordered lineage checking. |
| `client/lib/node-apply.mjs:281-309` | source→workflow→target→input_mapping→open→configure→finish→execute | **Missing on0f:** enforced fixed observation gate before configure/apply/finish/execute. `finish=close` still configures; do not use it as observation. Source must cover every route/resume, not just one UI entry. |
| `client/lib/text-import-readback.mjs:13-15` | existing readback requires applied verified finish | Keep this contract. Fixed observation is a distinct pre-config proof, never applied-settings/execution PASS. |
| `client/lib/bridge.mjs:538-582` | ordinary savedPackages/managedSave and durable cleanup receipt | **Missing on0f:** same-bridge opaque readonly-clean receipt route. Preserve ordinary Save guard; absence of save is neither dirty=true nor clean=false. |
| `client/lib/package-persistence.mjs:14-32` | actual package/connection object snapshots around awaited IsPackageModified | Current reader is post-save advice, not readonly-close authority; it does not establish the required post-await global running check. Only LAB-68 may extend this seam if necessary. |

`client/lib/` rows abbreviate `packages/loginom-runtime/client/lib/`.
There is no fixed Import symbol to import on this baseline. Do not transfer the
whole source bridge or assume that source Sorting/Amount/Calculator authority
matches Import. Do not use a second CDP/browser context. All gates below are
**source requirements pending implementation**, not enforced by these documents.

## Required fixed observation and mutation gate

Before Operations, then Details, retain host/run/lease/generation/chat and the
actual Page/document/connection/session/account/origin/build/native package/tab
objects. Package path is exact; graph labels are descriptive, not authority.
Native import GUID must equal the pinned existing node GUID and component type;
output port0 native identity must belong to that node/current workflow. Record
observed retained source_path, connection/encoding, rows_to_skip/title flag;
format delimiter/quote/decimal/null marker and other supported retained options;
all ordered columns name/label/type/data_kind/used and output binding. Require
complete inventories, unique indexes/names, no truncation, no open editor.

Pins: Operations GUID `e78dbebd-942a-4ef4-ac45-654eec157c31`, columns
LKey:string, Part:integer, LValue:string; Details GUID
`6774e6c2-a207-4293-b7ea-8db76e168f98`, RKey:string, PartR:integer,
RValue:string; all Дискретный. Preserve source UTF-8/skip0/title,
`;` delimiter, `.` decimal, `NULL` null marker and `"` qualifier. Baseline GUIDs
from XML are expectations; only fresh bound native observation can prove them.

Keep activity/execution identity/freshness separate from rendered output0 and
cached table data. Unknown must remain explicit partial/refused. Fresh upload
lineage proves only that exact delivery in its live owner; identical hash cannot
prove retained path, ownership, schema or freshness. Ordered upload history must
include later writes; stale receipts/new identifiers cannot repair lost authority.

The enforced source gate must stop **all** configure/apply/finish/execute dispatch
when binding, ordered settings, source lineage, completeness, freshness required
by the requested next action, original deadline or settlement is unproved.
Read-only observation must never configure, commit or execute to obtain proof.
A positive observation grants no rebind/execute permission; those remain separate
future assignments. Resumes, delayed calls and alternative private routes must
hit the same gate. A serialized receipt or copied native object is insufficient.

## Readonly-close proof and ordering

The opaque receipt can only be minted/consumed in the same bridge over the same
native owner and settled fixed read-only transaction. Consumer JSON is never the
opaque authority. Strict native dirty === false is required; null/undefined/0/
empty string/"false" are refusals. Read-only task wording does not imply native
Package.ReadOnly=true; preserve the existing native flag policy and test both.

Capture actual owner/document/connection/session/tab/package/path/inventory
before dirty read. After **awaited** IsPackageModified, reread the entire identity,
global AND package running state, settlement, dialogs and original deadline
immediately before native close. Any change/refusal/unknown denies close/ack/
release and retains owner/Page. No save/discard may be used to make it clean.
Persist complete proof and cleanup/evidence with write+sync before release/ack/
exit. Lost native reply is uncertainty, not permission to repeat. A confirmed
native success with persistence refusal permits only evidence retry on the same
confirmed receipt: native close/logout counter must remain1, without new IDs or
renewed deadline. Dirty/unknown ordinary model runs still require the original
Save guard. Historical forced reaping is not teardown PASS.

## Minimal receiving sequence

1. Wait for LAB-68 exact source SHA, accepted source/actual offline result,
   reviewed fixed selector/test seam and dependency list. Inspect source diff.
   Do not cherry-pick the entire source branch, Sorting/Amount or whole bridge.
2. Recheck PR52 head. Compose only approved source hunks and necessary private
   caller wiring; retain current managed drain/startup/owner/retention/receipt
   and Join/provenance guards. Submit any newly required shared intersection to
   Регистратура before writing it. No production edit is authorized by this plan.
3. Connect `run-cases.mjs` to the source-owned test adapter using the exact
   source/native lifecycle/guard functions, real filesystem and labelled native
   doubles. Assert negative cases before any configuration/native close and
   positive ordering. Repeat against the actual receiving bundle; no substitute
   gate implementation in the consumer harness. Require upstream absolute deadline.
4. Publish receiving SHA; build clean exact-SHA product and verify canonical
   source/capabilities/manifests. Address only composition tests and newly changed
   source authority. Preserve first failures and untouched fixture assertions.
5. Handoff to Ловец exact source/receiving/product SHAs and boundary. Native/model
   test is not authorized here. A future native run needs fresh full own inventory,
   new owner/delivery, proof before mutation, durable native cleanup→managed/outer
   ack and contemporaneous PID/starttime/daemon/signal/awaited exit/reaped receipts.

## Commands and interpretation

From `packages/loginom-runtime` (never repository-root tests):

```
<baseline-product>/resources/loginom/bin/node ../../docs/node-development/nodes/join/receiving/run-cases.mjs --check-plan
<baseline-product>/resources/loginom/bin/node ../../docs/node-development/nodes/join/receiving/run-cases.mjs --adapter /absolute/source-owned/test-adapter.mjs
python3 ../../docs/node-development/nodes/join/receiving/matrix-check.py
```

`--check-plan` checks only scenario specification coverage. Without an adapter,
the runner reports SOURCE_PENDING and exits2; no scenarios count as PASS. The
adapter is local test plumbing, not a production API/IPC/callback. It must return
actual instrumented source/bundle lifecycle traces, not modelled expected output.
Negative fixtures must attempt all four guarded phase routes/resumes and report
refused_phase_attempts; idle observation alone cannot pass gate assertions. The
adapter receives fixture changes only, never the expected counters/order.
Positive fixture results do not certify native Loginom. Matrix checker is a new
independent grouped-join cross-check and adversarial 78-cell sensitivity audit;
it imports no handler/runtime/oracle. Its PASS is offline expectation integrity,
not live left42/freshness/persistence/inner36/current full Join acceptance.
