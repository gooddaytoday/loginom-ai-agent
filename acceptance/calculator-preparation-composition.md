## Offline composition checkpoint

Base: `f9916486dcefade04a17f1351bc518aea2f64125`, accepted navigation reader.
The addressed test is `packages/loginom-runtime/client/test/calculator-preparation-composition.test.mjs`.
Run with Node 24:

```sh
node --test packages/loginom-runtime/client/test/calculator-preparation-composition.test.mjs
```

The fixture preserves navigation inputs from b073 receipts 012/020 and their
original SHA256 values. The SaveCheckpoint persistence result is a boundary
input, not a newly executed save. Production `makeWorkspacePrepareCode` and
`prepareWorkspaceSession` execute on a VM Page double, creating the real
verified receipt/request. Production `readPreparedNodeContext`,
`createTextImportNodeSupport`/`nodeApplyDriverFactory.openWizard`,
`createNodeProcedure` and `openPreparedWizard` then compose against that receipt.
Native object instances, node-target resolution, Page/Ext bindings, UI observer
results, IPC and gesture receipts are explicit doubles. Serialized capability
and browser-receipt bodies are not executed by the driver transport double.

Twenty assertions pass, including expected refusal reproductions. This is
**not a successful canonical opening route**. The existing-target driver opens
once (one body selection plus one `begin_wizard`), then the real wizard opener
rejects with `Opened wizard owner differs from the prepared node`. The reader
has meanwhile verified native-object authority and retained its canonical alias;
the original caller binding, receipt request/crumbs, package/workflow objects
and node/model identity remain unchanged. An unchanged-key control passes.

The new-target driver passes only with a deliberately successful UI receipt
double. It does not prove the native opening capability. A separate probe
executes the exact opening-verification block extracted from production
`makeWorkspaceUiCode`, granting all lifecycle/GUID preconditions. Its unchanged
path control passes; its canonical path refuses `WIZARD_OPEN_NOT_CONFIRMED`.
This isolates the remaining path conjunct without executing the full capability
or asserting native behavior. VM predicates are distinct from native evidence.

Foreign package/workflow/node, stale document/receipt and pending surface reject
before dispatch. Post-gesture loss of Ext authority, receipt request authority
or model identity rejects without another gesture. AMBIGUOUS and primary IPC
error retain unresolved cleanup/transport state and do not replay or cancel.
Preparation admission callbacks are doubles; production ordering and unresolved
preparation-ID conflict are checked, not full host/action-runtime admission.
Child-step cleanup receipts do not establish package/logout/browser cleanup.

## Proposed shared intersection, not applied

The independent composition reproduction identifies these exact locations:

- `packages/loginom-runtime/client/lib/node-wizard-open.mjs`,
  `openPreparedWizard`: final exact equality of `owner.path.slice(0,-2)` with
  `binding.opening.workflow_path`; `wizardDeactivationDialogOwner` has the
  corresponding old-path check for the question branch, not exercised here.
- `packages/loginom-runtime/client/lib/workspace-ui.mjs`,
  `workspaceUiCapability`: opening-verification block for `open_wizard`,
  `begin_wizard`, `confirm_wizard_deactivation`, final path conjunct.
- `packages/loginom-runtime/client/lib/node-context.mjs`,
  `readPreparedNodeContext`: any narrowly scoped internal proof carrier needed
  by both consumers must originate after its full alias/ancestry validation.

Minimal direction for coordination: consume a freshly revalidated internal
navigation proof from this reader in both opening consumers, retaining original
receipt/caller identity and exact comparison when no verified alias exists.
Never accept matching path/label/GUID alone, remove the workflow predicate, or
rewrite the original request/crumbs. Revalidate before and after the gesture;
stale/pending/foreign/unknown-effect and deactivation guards remain mandatory.
The exact proof representation and resulting diff require assignment agreement
before editing these shared paths. No shared production file is changed here.

Live post-fix, setup/import replay, unknown-operation compensation, Calculator
capture, mapping, Done, execution, save/export/cold/model and native cleanup
remain unproved and unauthorized by this offline checkpoint. The historical
3f and b073 pending/journal/profile/owner resources are preserved.
