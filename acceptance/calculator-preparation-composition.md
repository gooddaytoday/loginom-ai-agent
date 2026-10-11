## Offline opening composition

Baseline reproduction: `8411d226c18c470badc9b222cb91b591c0725ab1`, independently
confirmed in review `01a12cee-47af-7dec-9b62-504fb1f53ff2`. Its canonical
opening failed despite the accepted reader alias. This checkpoint fixes only
opening/deactivation consumers and adds a narrow internal fresh alias proof.

Run the addressed checks with Node 24:

```sh
node --test packages/loginom-runtime/client/test/calculator-opening-full.test.mjs packages/loginom-runtime/client/test/calculator-preparation-composition.test.mjs packages/loginom-runtime/client/test/node-wizard-open.test.mjs
```

For before controls, stage baseline client/lib bytes with the NEW full-opening
test/fixtures and run `OPENING_BASELINE=1 node --test .../calculator-opening-full.test.mjs`.
The exact-key controls succeed; canonical direct/deactivation refuse as expected.
After controls require both canonical and exact-key routes to succeed.
The old full reader/source suites are not required by this addressed checkpoint.

The fresh reader proof is emitted only after complete native package/workflow/
node/model/surface and Ext/DOM ancestry validation of a changed navigation path.
Its original_path and current path let both opening consumers verify the owner
prefix without rewriting original receipt/request/crumbs/caller binding. Exact
workflow equality remains the fallback. Each observation/dispatch reads native
binding again; cached alias alone does not authorize an operation. Alias change,
rollback and authority loss refuse. No public tool/start/IPC contract changes.

The full-opening suite executes production serialized `makeWorkspacePrepareCode`,
`makeWorkspaceUiCode`/workspaceUiCapability, readPreparedNodeContext and
`withBrowserReceipt`, together with createNodeProcedure/openPreparedWizard.
The complete observer, preconditions, interaction-point checks, post-dispatch
opening verification, child cleanup and browser receipt ledger execute.
The separate import-driver composition tests also execute the real production
preparation/session, import driver and node procedure with explicit observer/IPC
doubles. SaveCheckpoint persistence is a boundary input, not a native save run.
Target resolution and Page/DOM/Ext/native graph/tree/application transitions are
explicit doubles. The full suite does not substitute an observer or successful
capability receipt. Unknown reply/transport-loss cases deliberately use IPC
boundary doubles; the raw Error ledger test uses a separate receipt-body double.

Navigation arrays and provenance SHA256 are exactly from b073 receipts 012/020.
Native Ext/object instances were not captured there and are not inferred from
those receipts. Successful offline doubles are not native opening/cleanup proof.
Each success has one body-selection and one begin_wizard; deactivation adds one
explicit affirmative. Failure controls cover foreign identities, stale/pending,
authority/model/request and document/context drift before/after dispatch,
primary Error, falsy native getters, ambiguous/lost reply, alias rollback/change
and receipt unknown-ID refusal. They do not replay or compensate failed openings.
Child handle/mouse cleanup does not establish own-package/logout/browser cleanup.

Changed production paths are only node-context.mjs (fresh proof output),
node-wizard-open.mjs (opening/deactivation prefix checks) and opening-verification/
deactivation-owner portions of workspace-ui.mjs. Workspace preparation, observer,
Amount, coverage/collector, host/admission/lifecycle and receiving pins are
unchanged. Receiving owners must check observer pins against the final changed
workspace-ui bytes after independent PASS; this source does not edit their pins.

Live post-fix, setup/import replay, unknown-operation compensation, Calculator
capture, mapping, Done, execution, save/export/cold/model and native cleanup remain
unproved and unauthorized by this offline checkpoint. Both historical 3f and
b073 pending/journal/profile/owner resources are preserved. Full acceptance remains
open; source/offline PASS is a separate result requiring independent review.
