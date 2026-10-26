Run live acceptance without repeatedly reading live logs:

```sh
python3 scripts/node-acceptance/run-check.py start --head dbeb10ee --scenarios n1,q7 --pair ~/.config/loginom-multica/cards/PAIR --cold
python3 scripts/node-acceptance/run-check.py wait /absolute/result-directory --timeout 4500
```

`start` returns only the result directory. The detached worker owns the run;
keep the machine available and collect it with `wait` before handing off the
task. `wait` returns 0 for all PASS, 1 for a finished failed/unknown batch, or 2
for its own timeout. A timeout does not cancel the worker; repeat `wait`.
The result directory is private (0700); `summary.md` and atomic `results.json`
contain the report. Configs, profiles and raw logs stay private there.
Results default to `~/.cache/loginom-runs/<timestamp>/`. The worker and its
children use the result directory's `tmp/` for `TMPDIR`, `TMP` and `TEMP`;
task-owned `CODEX_*` settings are not inherited. On Linux, keep an explicit
`--out` path short: Chromium creates a Unix singleton socket under `tmp/`.

The pair must contain `worker.json` and `reviewer.json` with the established
`loginom` and `package_directory` fields. Runs use the worker account. OAuth is
linked from `~/.local/state/loginom-cli-oauth/shared-oauth-v1/auth.json`, never
copied. Requires git, Python 3.9+, the pinned Bun/Node/browser bootstrap cache,
and network access for the locked dependencies. Build inputs can be overridden
with `LOGINOM_AI_AGENT_NODE_SOURCE` / `LOGINOM_AI_AGENT_BROWSER_SOURCE`.

Defaults: medium/1800 seconds per model phase, load1 and load5 ≤ 8, ≥60 seconds
between phase starts, 85 minutes total per batch including builds. `--spacing`,
`--host-load-max`, `--out` and `--build` override these where exposed by help.
Builds use a detached clean source tree and `nice -n 19`; mas2 uses `--baseline`.
A supplied build must have matching SHA and `sourceDirty=false`.
The per-host cache is `~/.cache/loginom-run-check/HOST/SHA/`; concurrent first
builds of the same SHA are unsupported. Later batches reuse its manifest.

Each n/p/s/v case starts with a new profile, chat, workspace and personal package.
q1–q10 first run their documented base; s7/s8 and p23/p24 first run s1.
r1/r2 start from the clustering task, r3/r4 from linear regression, and r5/r6
from REST. Each continuation reuses that base session/package; r3 attaches
holdout.csv and r4 attaches replace.csv only when requested. Only the business
request and referenced input CSV/XLSX files reach the model; previously attached
inputs are not attached again. p14 receives exhibits.xlsx, not its CSV copy. CSV checks consume every exported row. Node-base fixtures describe native port
order; their tasks leave CSV order free, so only those base exports map columns
by their unique names. Final continuation CSVs retain their fixture's ordering
rules. Names, widths, counts and every value remain checked.
Stock cold receives `--csv` and never reapplies node settings.
Save, main close/logout and runtime-close ACK must all be confirmed.
The table reports `port-read` and the observed path (`port`, `native`, or both).
Every delivered port must satisfy its path:

- `port`: `freshness_basis=completed_execution_port_source` and top-level
  `cleanup_complete=true` (#440).
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

Supported names: n1–n20, p1–p24, s1–s8, q1–q10, r1–r6, and
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

Offline tests: from `scripts/node-acceptance/tests`, run
`python3 -m unittest test_run_check -v`.

CSV specification audit (all 86 supported names, including variants):

| Field | Names using it | CSV behavior / stock cold responsibility |
|---|---:|---|
| `name`, `label` | 86 / 29 | Check the selected header mode; cold checks both native metadata fields. |
| `label_any` | 58 | Free labels only in labels mode; names stay bound. Native labels remain governed by stock cold. |
| `name_any` | 1 (p22) | Bind freely named columns uniquely by complete column values, then check row associations. |
| `category_labels_any` | 1 (n19) | CSV oracle owns n19; generic matching preserves a nonempty bijection of categories. |
| `type`, `types` | 86 / 5 | CSV compares serialized values, including numeric equivalents. Stock cold alone verifies native types and allowed type sets. |
| `tolerance` (`abs`, `rel`) | 20 | Preserve finite numeric values within the declared maximum absolute/relative tolerance; use complete row matching when ranges overlap. |
| `ordered` | 86 | Preserve sequence when true; otherwise match every row, including duplicates. |
| `column_order` | 48 | Exact when declared; otherwise map unique headers, as in the stock matcher. Node-base CSV override remains independent of native port order. |

Counts above describe the specifications actually loaded by the runner. All
static `expected-demo.json` files were also inspected: they introduce no extra
fields (p17 has `name_any` there, while its current oracle generates fixed names).
No additional value-set field occurs in these fixtures or generated JSON.
Native output selectors (`output_node_type`, `output_port`, `export_destination`),
metadata and precision checks stay with the unchanged stock cold checker. CSV
cannot establish native types or labels absent from its selected header mode.
Date/time normalization, nulls, full row counts and widths remain checked.
