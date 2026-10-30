Run live acceptance without repeatedly reading live logs:

```sh
python3 scripts/node-acceptance/run-check.py start --head dbeb10ee --scenarios n1,q7 --pair ~/.config/loginom-multica/cards/PAIR --cold
python3 scripts/node-acceptance/run-check.py wait /absolute/result-directory --timeout 4500
```

`start` returns only the result directory. The detached worker owns the run;
keep the machine available and collect it with `wait` before handing off the
task. `wait` returns 0 for all PASS, 1 for a finished failed/unknown/incomplete batch, or 2
for its own timeout. A timeout does not cancel the worker; repeat `wait`.
The result directory is private (0700); `summary.md` and atomic `results.json`
contain the report. Configs, profiles and raw logs stay private there.
Results default to `~/.cache/loginom-runs/<timestamp>/`. The worker and its
children use the result directory's `tmp/` for `TMPDIR`, `TMP` and `TEMP`;
task-owned `CODEX_*` settings are not inherited. On Linux, keep an explicit
`--out` path short: Chromium creates a Unix singleton socket under `tmp/`.

The pair must contain `worker.json` and `reviewer.json` with the established
`loginom` and either `package_directory` or `personal_folder` fields (when both
exist, `package_directory` wins). Unknown formats fail before detach and name
the file, required fields and supplied keys; credential values are never printed.
Runs use the worker account. OAuth is
linked from `~/.local/state/loginom-cli-oauth/shared-oauth-v1/auth.json`, never
copied. Requires git, Python 3.9+, the pinned Bun/Node/browser bootstrap cache,
and network access for the locked dependencies. Build inputs can be overridden
with `LOGINOM_AI_AGENT_NODE_SOURCE` / `LOGINOM_AI_AGENT_BROWSER_SOURCE`.

Defaults: medium/1800 seconds per model phase, load1 and load5 ≤ 8, ≥60 seconds
between phase starts, 85 minutes total per batch including builds. `--spacing`,
`--host-load-max`, `--out` and `--build` override these where exposed by help.
The scenario catalog sets `model_timeout=2700` only for private C1 and 5-REST
fixtures supplied through `--cases` or `--case-root`; other scenarios, including
node acceptance, keep 1800 seconds. The batch deadline still caps each phase.
At a phase deadline, SIGINT goes to the CLI owner first, with 100 seconds for
normal close/ACK. If it stays alive, the process group receives SIGINT and
another 40-second wait, then SIGKILL as the final fallback.
Builds use a detached clean source tree and `nice -n 19`; mas2 uses `--baseline`.
A supplied build must have matching SHA and `sourceDirty=false`.
The total budget is shared by sequential scenarios. If it expires before a
scenario starts (including its first load/spacing gate), that scenario is
`NOT_RUN` with reason `BATCH_BUDGET_EXHAUSTED`, displayed as
«не запущен (бюджет пакета)». No setup process is launched. A deadline reached
during an already started scenario retains its failed/unknown phase result.
`phase=gate:<name>` identifies load/spacing waiting; the phase name itself is
published only after the gate passes. `results.json` stores `phase_timings`
with queued/started/finished timestamps, `queue_seconds` and `duration_seconds`;
`summary.md` shows queue and execution time separately for every phase. A phase
that never starts has `started=null` and zero execution time. These durations
do not assign build time or earlier scenarios to setup.
The per-host cache is `~/.cache/loginom-run-check/HOST/SHA/`; concurrent first
builds of the same SHA are unsupported. Later batches reuse its manifest.

Each n/p/s/v case starts with a new profile, chat, workspace and personal package.
q1–q10 first run their documented base; s7/s8 and p23/p24 first run s1.
r1/r2 start from the clustering task, r3/r4 from linear regression, and r5/r6
from REST. Each continuation reuses that base session/package; r3 attaches
holdout.csv and r4 attaches replace.csv only when requested. Only the business
request and all input CSV/XLSX files in the first step's `data/` reach the model,
even when their names are absent from the request. Previously attached inputs
are not attached again. README exceptions remain: p14 receives exhibits.xlsx,
not its CSV copy; the linear-regression base receives only train.csv, and
r3/r4 attach only their new holdout.csv/replace.csv. CSV checks consume every exported row. Node-base fixtures describe native port
order; their tasks leave CSV order free, so only those base exports map columns
by their unique names. Final continuation CSVs retain their fixture's ordering
rules. Names, widths, counts and every value remain checked.
Stock cold receives `--csv` with the last checked download of the final stage
and that file's delimiter, and never reapplies node settings. A single export
is `actual.csv`; multiple exports are `actual-1.csv`, `actual-2.csv`, etc.
Every export still passes the main CSV oracle. Cold independently reads all
outputs in `expected.json`; the CSV supplies only export column order, not
cell values. Using the last download also matches the existing `export_input`
contract, whose `export_destination` is the last requested export.
Main CSV and cold use the same `csv_header` mode from the scenario contract:
s8, q6 and p24 prescribe CSV display labels and use `labels`; other exports use
`names`. Native label metadata alone does not select the CSV mode (for example,
p25 retains `names`). The s8 continuation binds Export by `export_destination` and
matches «Регион/Категория/Выручка» against saved native labels while keeping
technical names such as Region/Category/Revenue independent.
Save, main close/logout and runtime-close ACK must all be confirmed.
The table reports `port-read` and the observed path (`port`, `native`, or both).
Every delivered port must satisfy its path:

- `port`: `freshness_basis=completed_execution_port_source` and
  `cleanup_complete=true` on the receipt owning `output.ports` (#440), including
  receipts nested inside an `operation.inspect` response. Wrapper or sibling
  cleanup cannot replace that receipt's cleanup.
- `native`: the public verified binding matches the node, port and completed
  execution; `fresh=true`, `cell_precision.cells=exact_native`, complete
  `exact_table` and `read_coverage`; `cleanup_complete=true` and
  `output.workflow_returned=true`. The latter is emitted after the owned Preview
  closes. This is the existing full Collapse/CrossTable F3/raw-321 path; it has
  no `freshness_basis`.

A port satisfying neither path, or no delivered ports, is FAIL. These checks
consume existing public runtime results; they do not attest a server snapshot
or exclude the native reader's documented unobserved ABA risk. Requested field types/names remain in the cold expected.
An invalid port read marks the scenario FAIL but allows the remaining business
steps and cold check when Save and main cleanup are confirmed. For q scenarios,
this also retains failures from the base scenario in the final result.

Supported names: regex-add, regex-replace, upload_only, logreg-enter, n1–n21, p1–p25, s1–s8, q1–q10, r1–r6, and
