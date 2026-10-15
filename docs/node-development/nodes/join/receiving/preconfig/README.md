# Import pre-config consumer contract preparation

Consumer-only code on accepted PR52 base45d37e1f99b2cbe3f9184398f285cbb456ba3700.
Process node-orchestration-v2. No shared/public/runtime implementation changes.
The tests are executable assertions over a proposed source-owned trace adapter,
using the existing preparation parser and typed node-context validator. They
neither implement the production gate nor construct an accepted native owner.

`historical-pins.json` projects measured Files/XML/source_only left-copy evidence:
9480-byte b34c33d2… package, CSV77/72, permanent Import GUIDs and exact old paths.
Source file hashes identify the projection inputs. These are HISTORICAL pins,
not current GUID refs, prepare/upload receipts, workflow IDs or private Map data.
No old ephemeral identities are included in a positive test. Synthetic samples
use fresh random identities and explicitly synthetic paths and classifications;
they are never passed to Page/host/private actions. Equal digest never adopts an
old retained path. Tests contain no ready runtime contexts or allowed_actions.

## Executable checks

From `packages/loginom-runtime`:

```
node --test ../../docs/node-development/nodes/join/receiving/preconfig/*.test.mjs
PRECONFIG_RUNTIME_ROOT=<absolute-installed-runtime-root> node --test ../../docs/node-development/nodes/join/receiving/preconfig/*.test.mjs
node ../../docs/node-development/nodes/join/receiving/preconfig/check-adapter.mjs
```

Default CLI exits2/SEAM_PENDING/dispatch0. A reviewed source-owned test adapter
can be selected with `--adapter <absolute-file>`; this is local test plumbing,
never a user module path/IPC/public callback. Adapter exports `source_sha`,
`path_kind` synthetic/source/installed and zero-argument `readPreconfigSample`.
No expected pins, historical refs or context are supplied to the adapter.
The trace contains prepare response, before/after owner tuple, original deadline,
ordered read times, settled source_only scope, exact two native imports and
instrumented configure/apply/finish/execute/activate/create/save counters.
Each item binds current typed node ref/output0, current delivery receipt and
ordered writes, full retained settings/schema, same-node activity and current
read freshness to one sample. Freshness means read lineage, never execution PASS.

Compatible synthetic and source-shaped traces return only contract compatibility:
complete=false/configure_authority=false/close_authority=false/native_proof=false.
Boolean trace claims are assertions to verify in the source adapter, not opaque
proof or authenticated authority. A trusted adapter must derive these from the
actual retained source seams and preserve refusals; JSON cannot substitute for
host grant, native ownership, source gate or same-bridge opaque clean receipt.
Adapter counters show only its instrumented routes, not all production routes.

`partial-resource.test.mjs` invokes real captureImport and awaited record through
an explicitly synthetic transport response on source/installed module paths.
It demonstrates that this existing PARTIAL event cannot be consumed as a complete
pre-config trace. It does not exercise the serialized native reader or repeat
accepted resource suites. No negative consumer assertion is claimed as a tested
production refusal. dispatch0 is an assertion of absent effects in these probes.

## Minimal receiving map and exact missing seam

| Existing path | Consumer use | Remaining source requirement |
|---|---|---|
| client/lib/workspace.mjs parseWorkspacePreparation | parse READY existing package/document/workflow/account | actual successful prepare and current owner must come from retained host run, not fixture JSON |
| client/lib/node-context.mjs validatePreparedNodeContext | validate exact typed node/document/workflow shape | current native node/output0 pointer/inventory proof, no cached refs |
| src/acceptance/import-before-configure-v1.mjs captureImport | consume awaited fixed read/record PARTIAL diagnostics | reader currently only PARTIAL/REFUSED, raw codes, unknown activity/freshness; complete proof absent |
| client/lib/workspace.mjs workspaceObserveTool | bounded rendered observer candidates | UI refs/labels do not prove full schema, enum association or execution freshness |
| client/lib/text-import-node.mjs verifyTextImportSource; executor verifiedUploads/uploadHistory | future current-owner exact ordered delivery | current host Map/receipts, not archived Files/hash or injected state |
| client/lib/text-import-readback.mjs textImportConfigurationReadback | incompatibility documented | requires configure/output_mapping/verified finish; cannot be used before configure |
| host node-client / managed-entry / bridge private retained transaction | absent on accepted base | reviewed fixed grant/start/loader/dispatch/result and original deadline/admission before adapter wiring |

Current base exports no closed `readPreconfigSample` adapter. Its resource returns
complete=false and has no independent canonical Import enum association, wizard
output0 authority, same-node activity/current freshness or opaque clean proof.
Do not obtain these by configure/finish/execute. Sorting/Amount/common source
branches are not a prerequisite substitute. Await LAB-68 exact reviewed generic
source/corrections01a12fe6-83d8, then inspect minimal prerequisites and receive
only accepted hunks under Registrar coordination. Connect this consumer to the
reviewed private seam without weakening assertions and review the receiving SHA.

No new live/login/model/prepare/upload/rebind/Save/replay/cleanup; accepted origin,
prototype/matrix/resource/lifecycle suites not repeated. Product45d/202610121131
is separately identified; consumer-only SHA needs no rebuild. Stock missing
resource/structural PLAN_ONLY/hash equality are not native upload-lineage proof.
Storage pre-READY refusal/full Import/readonly Close/full Join remain open;
UNKNOWN/.writer/pending/originals/accounts/profiles and inner36onlyf262 preserved.
