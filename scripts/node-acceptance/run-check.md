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

Supported names: n1–n20, p1–p25, s1–s8, q1–q10, r1–r6, and
v1s1–v3s6 (three prompt variants for each s1–s6). Variants read
`stability-2026-10-20/sN-*/prompt-vK.md` and reuse the demo's data/oracle.
n13–n20 use their CSV-checking oracle as the CSV verdict, without rechecking
values against the separate cold JSON fixture;
n14–n17 previously lacked that fixture. Their new fixtures use the independent
`expected/reference.csv`, preserve all rows/order/nulls, and add field types.
n17 Due is a local date at midnight; the CSV oracle still requires ISO dates.
p24 uses expected-demo.json and CSV labels, as documented in the dataset README.
CSV comparison honors declared column-order freedom and checks every value.
Unknown names are refused before detach. No automatic retries or account switching. Failed and UNKNOWN
profiles/packages are retained; main cleanup never discards changes. Cold uses
its stock diagnostic cleanup. Archive evidence before deleting run directories;
never share a whole profile or `cold-config.json` (they contain credentials).

Private large/server-file fixtures can use `--cases /absolute/private/cases`
with named subdirectories passed in `--scenarios`. Each contains `task.md`,
`expected.json`, `oracle.py` and `data/` (empty for a server-only request).
Each expected output declares its CSV `export_destination`; its basename is
the export filename in the task. This keeps server-source filenames out of the
export replacement list. Only `task.md` and files in `data/` reach the model;
oracles remain private. All existing CSV, Save, cold and cleanup checks apply.

D87 large-file regression, one foreground command (from the repository root):

```sh
result=$(python3 scripts/node-acceptance/run-check.py start --head HEAD --scenarios D87 --pair "$PAIR" --cold) && python3 scripts/node-acceptance/run-check.py wait "$result" --timeout 5400
```

| Name | Input | Admission | Default D87 set |
|---|---|---|---|
| E1 | CSV ≥1,000,000,000 bytes | absolute path | yes |
| E2 | CSV ≥1,000,000,000 bytes | `--file` | yes |
| E3 | CSV ≥2³² + 1 MiB, complete final record | absolute path | **heavy; explicit `--scenarios E3` only** |
| X1 | XLSX 500,000 data rows, Sales sheet | absolute path | **heavy; ожидает LAB-413**, refused before detach |

`--scenarios E1` runs just E1. No heavy case is expanded by `D87`.
An explicit `--case-root` takes precedence over built-in names, preserving
existing external E1/X1 fixtures and their own input/cleanup ownership.
`large-dataset-gen.py` generates each input and its private manifest under the
result directory, outside Git. Grouping sums and counts come only from that
manifest. The model receives the business request, source path (or `--file`),
format and field types; it never receives the manifest or expected values.
Generation, model and cleanup respect the same load/spacing limits. After main
and optional cold, also on failure, native Files UI deletes only this run's
uniquely named source from the worker's authorized directory. Actual server
names (including product-added hash prefixes) come from completed admission/
delivery receipts matched to the manifest byte count and owned source basename;
unrecognized destinations fail closed. The runner then
deletes its local input and large copies under its own result directory;
manifest, small exported CSV and diagnostic evidence remain. `dataset-cleanup`
reports storage/disk separately; failed storage cleanup makes the run FAIL.
Storage cleanup prepares its own empty draft before opening Files (the native
Home toolbar lacks a NodeIndex), then closes that untouched draft and logs out
with the existing stock cleanup primitive, without discard. Failure DOM stays
private beside its cleanup result.
The saved package remains for inspection; after source cleanup its original
large import cannot be rerun without regenerating that source.
X1 already has the generator/oracle/task template; remove its `pending` marker
in `D87` only after LAB-413 provides the XLSX switching path and validate it live.

To add a scenario for a new node:

1. Add a fixture directory with a user-language `prompt.md` (or `prompt-demo.md`),
   `data/` and `oracle.py`; its JSON must contain `nodes` and `outputs` with
   column types, rows and order policy. Keep oracle values out of the prompt.
2. Register its name/source/base in `scenario()` and update this catalog.
   Use an existing name range only when it is free; extend the range otherwise.
   If CSV has a separate oracle, also provide its cold `expected.json` and
   register that branch in `expected_for()`/`model()` as existing n13–n20 do.
3. Add a regression that resolves the fixture and checks command inputs/oracle;
   run `node --test scripts/node-acceptance/tests/*.test.mjs`, then
   `start --head <SHA> --scenarios <name> --pair "$PAIR" --cold` and foreground `wait`.
   Add its file patterns/scenario hint to `required-checks.py`; for an additive
   contract registration set `NODE_SCENARIOS=<name>` when executing its rows.

Offline tests: from `scripts/node-acceptance/tests`, run
`python3 -m unittest test_run_check -v`.

CSV specification audit (the original 87 fixture names, including variants; D87 uses its generated manifest):

| Field | Names using it | CSV behavior / stock cold responsibility |
|---|---:|---|
| `name`, `label` | 87 / 30 | Check the selected header mode; cold checks both native metadata fields. |
| `label_any` | 58 | Free labels only in labels mode; names stay bound. Native labels remain governed by stock cold. |
| `name_any` | 2 (n18, p22) | Bind freely named columns uniquely by complete column values, then check row associations. |
| `category_labels_any` | 1 (n19) | CSV oracle owns n19; generic matching preserves a nonempty bijection of categories. |
| `type`, `types` | 87 / 7 | CSV compares serialized values, including numeric equivalents. Stock cold alone verifies native types and allowed type sets. |
| `tolerance` (`abs`, `rel`) | 20 | Preserve finite numeric values within the declared maximum absolute/relative tolerance; use complete row matching when ranges overlap. |
| `ordered` | 87 | Preserve sequence when true; otherwise match every row, including duplicates. |
| `column_order` | 50 | Exact when declared; otherwise map unique headers, as in the stock matcher. Node-base CSV override remains independent of native port order. |

Counts above describe the specifications actually loaded by the runner. All
static `expected-demo.json` files were also inspected: they introduce no extra
fields (p17 has `name_any` there, while its current oracle generates fixed names).
No additional value-set field occurs in these fixtures or generated JSON.
Native output selectors (`output_node_type`, `output_port`, `export_destination`),
metadata and precision checks stay with the unchanged stock cold checker. CSV
cannot establish native types or labels absent from its selected header mode.
Date/time normalization, nulls, full row counts and widths remain checked.
