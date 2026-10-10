## Diagnostic boundary

`diagnose-editing.mjs` checks Calculator expression editing and native syntax refusal in a newly created, separately named diagnostic package. It does not open a saved acceptance result, execute Calculator, enter output mapping, validate calculated values, or replace model/cold acceptance. It leaves its empty bootstrap and uploaded input as evidence; it closes the owned package and logs out.

Run with the Node bundled in the candidate being checked:

```sh
<candidate>/resources/loginom/bin/node docs/node-development/nodes/calculator/acceptance/diagnose-editing.mjs \
  --resources <candidate>/resources/loginom \
  --config <private-worker-or-reviewer.json> \
  --output <new-private-directory>
```

The config must name the role's personal package directory. Credentials are read from that private config and redacted from the durable journal. Each output directory must be new. The script verifies the resource manifest, requires an empty owned session, uses the candidate's guarded target and wizard procedures, and never retries an unknown effect under another ID.

The matrix records complete baseline and changed inventories. Renaming/reordering must retain both record and expression identity, formulas, labels, types, replacement flags, cached/intermediate/description values, all other expressions and input fields. A deliberately incomplete formula must produce Loginom's own error while retaining that exact formula. Wizard cancellation must return to the same unlocked node with discarded drafts. Package closure and logout are separate required receipts.

`execution-events.jsonl` contains the durable before/after browser receipts; `baseline.json`, `edit-preservation.json`, `syntax-step.json`, `syntax-refusal.json`, `cancel.json`, `cleanup.json`, and `result.json` expose the bounded checks. A zero process exit alone is insufficient: result status and both cleanup flags must pass. A failure preserves the pending history and receives no automatic acceptance credit.

Before diagnosing a previous ambiguous attempt, inspect its original saved-profile journal and current resources. A terminated process has no restorable in-memory Dock operation registry: do not construct a new registry and treat its unknown-ID result as recovery. Preserve the original AMBIGUOUS/effect_possible/cleanup_complete facts independently of a later empty-session/logout observation. If the original operation is still running, use its original live wait before cleanup or new work.
