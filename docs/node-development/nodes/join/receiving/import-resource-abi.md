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
