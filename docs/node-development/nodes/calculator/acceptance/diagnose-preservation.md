## Nondefault property preservation diagnostic

Run this separate diagnostic after the editing/syntax matrix. It covers preservation of existing nondefault expression properties, not execution semantics or full Calculator acceptance.

Use the bundled Node and resources from the exact clean candidate, an existing role configuration, and a new output directory:

```sh
<candidate>/resources/loginom/bin/node \
  docs/node-development/nodes/calculator/acceptance/diagnose-preservation.mjs \
  --resources <candidate>/resources/loginom \
  --config <role-config.json> --output <new-private-directory>
```

The script requires the authenticated role's exact personal package directory and zero open packages. It creates and canonically reopens a separate empty diagnostic package, imports its own one-row CSV, and creates four expressions. It never opens an acceptance result or replays a prior operation.

Fixture preparation uses only the candidate's existing observed UI contracts: `set_checked` on native checkbox display refs, `fill` on the uniquely owned description textarea, and `apply_expression_parameters`. It does not add `cached`, `intermediate` or `description` to the node.apply parameter contract. Each dialog is bound to the selected expression and every applied value is checked through the complete native Calculator readback.

| Expression | cached | intermediate | description |
| --- | --- | --- | --- |
| Revenue | true | false | Cached revenue preservation fixture |
| Adjusted | false | true | Intermediate adjustment preservation fixture |
| Note | true | true | Cached intermediate note preservation fixture |
| UnitPrice | false | false | empty |

These combinations must be observed as available and confirmed after native Apply; an unavailable control or readback mismatch fails the diagnostic. There is no fallback that writes UI models or widens guards.

After recording the complete baseline, the normal `configureCalculator` procedure renames Note to ReportNote and Adjusted to AdjustedInternal, then orders expressions as ReportNote, Revenue, UnitPrice, AdjustedInternal. The comparison requires exact record/expression identity, formulas, types, labels, replace, cached, intermediate, descriptions and all input fields. It then confirms that the wizard still shows Calculator, cancels the draft and closes the exact owned package and session on the original live page.

The output contains fixture inventories before/prepared/after native Apply, `baseline.json`, `edit-preservation.json`, `before-cancel.json`, `cancel.json`, `cleanup.json`, `result.json` and the durable execution journal. PASS requires confirmed cancellation (`draft_discarded=true`, `settings_applied=false`) and cleanup (`package_closed=true`, `logged_out=true`). Failures and their receipts remain in the output. Keep browser profiles and secrets private.

No Calculator Next, output mapping, calculation, accepted save/export, shared-folder transfer, cold-check or model run is performed. A PASS here proves preservation only; the previous syntax matrix and full node acceptance remain separate evidence.
