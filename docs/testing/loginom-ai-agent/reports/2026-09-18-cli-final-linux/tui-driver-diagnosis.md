# TUI acceptance driver: stale observation refusal

The first final installed headed TUI run, evidence
`/tmp/loginom-linux-oracle-CkdyxG`, completed A including cold readback 55.
B reached grouping/save 101 but its close gesture returned `UI_EPOCH_CHANGED`:
`NOT_APPLIED`, `phase=preconditions`, `effect_possible=false`,
`cleanup_complete=true`. Both CLI children exited 0, released their guards and
closed their PTYs without forced termination. The oracle driver exited 1;
B cold readback was not completed, so this run is not a full PASS.

The runtime epoch check precedes dispatch in workspace-ui.mjs. The driver treated
this safe pre-dispatch refusal exactly like uncertain execution. This is a test
harness deficiency, not evidence that the mutation failed after dispatch. A single
live occurrence does not establish a flaky runtime regression; bisect is not
justified by this evidence.

The extracted observed-click helper accepts only this exact refusal with matching
operation ID and action key. It obtains a fresh observation and checks origin,
authentication, Loginom build, document, workflow/tab and package identity before
using a fresh reference and new operation ID. At most two refreshes are permitted.
Uncertainty, incomplete cleanup, other errors and identity changes stop the test.
The existing settling delay after each successful gesture is preserved. Numerical
and cold-readback assertions are unchanged. Runtime/product binaries are unchanged.

Validation: four focused Bun tests, 20 assertions PASS; Desktop `bun typecheck`
PASS. The signal collector ran the two existing runtime pre-dispatch/diagnostic
checks three times with explicit individual results, all PASS. No live mutations
were retried by that investigation. A fresh full installed headed TUI run uses
`/tmp/loginom-linux-oracle-uwsU99`; its outcome is recorded separately on completion.
