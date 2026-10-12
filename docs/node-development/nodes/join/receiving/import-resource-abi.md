# Fixed Import resource ABI, revision 1

LAB-71 owns only `src/acceptance/import-before-configure-v1.mjs` and its tests.
LAB-68 owns the retained host routing, enforced gate, opaque clean proof and
cleanup. No shared host/start-input/managed-entry/bridge/observer/import handler
is changed here. Source integration remains dependent on the LAB-68 PASS.

The export is `captureImport({binding,identity,browser,record})`, matching the
closed acceptance invocation in LAB-68 `992d1e991` (Amount/Calculator are ABI
references only, not dependencies or authority). Fixed harness/resource name:
`import-before-configure-v1`; fixed file path is chosen by the existing private
host branch, never model/IPC-supplied code, module, getter or callback.

Binding revision1 contains the existing owner/run/lease/generation/chat/session/
account/admission/packagePath/expires tuple. Resource checks consistency and the
original absolute expires; it never mints or authenticates that tuple. The source
host must mint and validate it and provide the actual same Page/browserGate.
Identity uses existing session_id/document_id/account/package_path/tab_tid/
loginom_build. Browser is the retained MCP callTool seam; record is its existing
awaited durable execution journal. No new runtime/public callback is introduced.

The resource reads cached native preparation receipts, tree ancestry, exact
native import GUID, WizardModelComponentForm ownership, fixed Import controls
and Ext native definition store. No click/open/select/Next/configure/finish/
execute/save/native server load is performed. Numeric native type/data_kind
codes are returned as codes; canonical mapping is not guessed. Missing or
partial store/header values are unknown. Cached idle or schema is never fresh
execution evidence. Record failure and expiry/identity changes propagate.

Result revision1 has harness/session/document/account, REFUSED or PARTIAL,
complete=false/settings_applied=false/effect_possible=false/close_authority=false,
node role/GUID/workflow (when observed), raw bounded source/format fields and
ordered native column codes, explicit output0/activity/freshness unknown states
and missing list. A current owned Import wizard can expose settings and codes;
this does not prove canonical schema, output-port binding or execution freshness.
This conservative first resource does not synthesize a complete proof from pins
or cached XML. The host gate must refuse any remaining required unknowns. No
opaque clean receipt or successful native lifecycle is returned by this component.

Current technical limit: baseline native wizard supplies no independently
verified execution identity/freshness or canonical code mapping in this fixed
reader. These facts remain partial until a reviewed native read route establishes
them. That gap is part of this result, not replaced by a model expectation.
Resource tests must preserve it, including on clean actual bundle.

Test with pinned Node from packages/loginom-runtime:
`node --test test/import-before-configure.test.mjs`.
For actual bundle set IMPORT_RESOURCE_MODULE to its absolute resource file path.
Page/Ext/native objects are doubles; resource and serialized functions are real.
This checks the component's observed/partial/refused boundaries, not host gate,
53-case lifecycle, clean-close, native Loginom or full Join acceptance.

## Retained binding revalidation and remaining proof

After cached reads the resource revalidates the current controller/tree record/
data/node and every retained ancestor link, native wizard model pair and root.
Graph observations retain both fixed GUID nodes, graph/root/cells/DOM, native
port groups/collections and port GUID/data/cell/parent bindings. Changed bindings
return REFUSED with no observed node/columns/imports. Counterfactual late getter
controls run through captureImport, its serialized Page reader and awaited record.

Existing sources identify possible proof routes, but do not provide current
same-owner observations for this reader:

- `client/lib/workspace-ui.mjs:3290` uses numeric type mapping only with owned
  Ext records and rendered row/record identities plus matching type icons. This
  is a table-format page, not sufficient authority for Import definition codes.
  Import `DataKind` needs its own native enum/label binding; raw integers and
  pinned XML are insufficient. Synthetic test codes are deliberately raw codes.
- `client/lib/workspace-ui.mjs:2837` binds output ownership through prepared
  node/port tree objects, native data, cells and graph. A wizard's FModelNode
  alone does not establish its current output0 socket/tree binding.
- `client/lib/workspace-ui.mjs:2773` infers activity only for the unique selected
  graph node with matching native toggle and rendered tooltip/icon. This route
  is unavailable inside the current wizard. HasRunningNodes=false proves only
  the guarded absence of running work; it does not prove node activation.
- `client/lib/node-execution-evidence.mjs:21` requires a complete before/after
  process inventory, root incarnation, new group and independently bound child
  owner. A single cached status/idle/schema read cannot prove fresh execution.

Historical native capture `cold-before-wizard-native.json` (2026-10-11 cold
materializer evidence) records FStatus=2 / 'Порт частично сконфигурирован' and
FPortIndex undefined. It is a different historical output context, not current
Import output0 or activation/freshness authority. No old refs are reused.
Until these current native bindings are available via the approved read route,
canonical types/kind, wizard output0, activity and execution freshness remain
unknown; complete and close_authority stay false. No live or extra preparation
was performed for this proof analysis. Shared host gate/clean proof remains LAB-68.
