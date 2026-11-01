Run live acceptance without repeatedly reading live logs:

Owner-approved #612 cases for v0.3.9: `sampling-random`, `partition-random`.
Only these translate their proposal into `sampling_modes`. The unchanged task
and modes.csv go to the model; the oracle never does. Decision 1 checks two
completed executions and exact typed source membership, with every CSV compared
to the observed result. Configured sizes and seed are verified, but output sizes,
quotas, source row order and P relations are not acceptance assertions.
Cold validates the direct import → requested node → export graph and native
field names/types. Native definition order is observed, not constrained. After
Cancel, which can deselect/deactivate outputs, a fresh production execution
reselects this node and verifies completion before reading any port. Two such
rounds must match main. Field presentation permutations are normalized by
verified names/types. Save, port proofs, cancellation and cleanup remain mandatory.
Stratified, biased and uniform are not registered.
Stock expected parsing, exact matching and existing scenarios are unchanged.

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
When `expected.json` sets `null_marker`, CSV NULL cells must use that exact
marker. Otherwise, for outputs containing NULL, the CSV check uses the explicit
`parameters.null_marker` of the `exports.text` request for that exact destination.
Existing-node patches require the correlated successful configuration readback
(including retained settings), also through wait/inspect receipts. Supported
markers are `''`, `?`, `null`, and `NULL`; a marker matching any non-NULL value
in that output fails `CSV_NULL_MARKER_COLLISION`. An empty marker therefore fails
when the output contains both NULL and empty strings; it still passes when
there are no empty strings. Missing export evidence
fails `CSV_NULL_MARKER_MISSING`; unsupported markers fail
`CSV_NULL_MARKER_UNSUPPORTED`. Every NULL cell still must match the chosen marker.

For types300 only, the runner selects the private `--exact-port-windows` cold
reader. It reads every expected row through contiguous production port windows,
retaining the same document, workflow, node, port and completed execution.
Changed bindings, schema, row count, unverified precision or incomplete cleanup
refuse the result. Each window keeps the ordinary preview budgets; the assembled
cold oracle checks every cell, including signed zero, milliseconds and full text.
The offset is internal: public tool schemas and their read limits are unchanged.

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

`rest-get-plain`: один GET https://httpbin.org/status/200 без query-параметров
и входной таблицы. Задача и независимый oracle —
`docs/node-development/nodes/integration-restrequest/acceptance/plain/`;
CSV и cold проверяют одну строку ErrorCode/HttpStatusCode, Save и cleanup обязательны.

Supported names: regex-add, regex-replace, sampling, data-partition and their -null/-empty variants (sequential node acceptance), upload_only, logreg-enter, rest-get-plain, n1–n21, p1–p25, s1–s8, q1–q10, r1–r6, and
v1s1–v3s6 (three prompt variants for each s1–s6). Variants read
`stability-2026-10-20/sN-*/prompt-vK.md` and reuse the demo's data/oracle.
`join-right`, `join-full`, `join-difference` use the approved per-mode tasks,
CSV inputs and expected outputs in `docs/node-development/nodes/join/acceptance/`.
Each runs independently with the stock CSV, Save, cold and cleanup checks.
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

For the S-tamper negative case, use `outputs: []` and
`rejection: {"code":"LOGINOM_FILE_CHANGED","node_type":"transform.group_data"}`
in private `expected.json`. PASS requires a successful replacement export,
then a correlated grouping refusal with no possible effect, no execution and
no returned ports, followed by Save and normal close/logout/ACK. Synchronous,
wait and inspect receipts use the same checks. Returned ports after the refusal
fail the case. CSV and cold output readback are inapplicable to this refusal;
`--cold` still applies normally to positive cases in the batch. Rejection
expectations never reach the model.

For `--case-root` path attachments, `{{SOURCE_PATH}}` in `task.md` resolves from
`case.json`. Upload-only seeds use that configured source even when a copied
task contains an obsolete path; they never create exports or save a package.

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

| Name | Stock fixture under docs/node-development/nodes | Acceptance |
|---|---|---|
| calculator-viewport | transform-calculator/acceptance/calculator-viewport | Nine calculators, distant financial node, export then fresh port/tooltip read; CSV/Save/cold/cleanup |
| linreg-short | datamining-linregression/acceptance/linreg-short | Expected Loginom training error: two rows, four coefficients; Save/cleanup, no CSV |
| throw1 | programming-javascript/acceptance/throw1 | Expected JavaScript exception; Save/cleanup, no CSV |
| js-declared-empty | programming-javascript/acceptance/js-declared-empty | Positive declared Broken:real empty table; header-only CSV/Save/cold/cleanup |

These four names run without private fixtures or `--case-root`.
The private `execution_error: {"text": "..."}` oracle with `outputs: []`
requires the expected text in a tool's error result (or native browser error
snapshot) and in the final user response, no export request/downloaded CSV,
Save after the error, normal close/logout without discard and runtime-close ACK.
This is separate from `upload_only`: saving is required.
No output port is required for an expected execution error; any returned
ports still pass the stock native ownership/exactness/cleanup checks.
Cold readback is inapplicable to the two expected execution errors; `--cold`
continues to check all positive cases, including the declared empty table.
Oracle contents never reach the model.

`tree-repeat` and `tree-no-repeat` use the approved tasks under
`trees-jsontotree/acceptance` and `trees-treetodata/acceptance`, respectively,
and only the original `documents.csv`. Their independent expected files carry
`export_destination: tree-result.csv`; the runner adds the owned export request
when its filename is absent from the immutable task. Main acceptance checks
every typed tree instance and schema field against `proposed_tree_output`.
With `--cold`, the saved Tree-to-Table node is freshly executed and its complete
table is read with the existing completed-port reader. Repeat on/off run in
separate chats, profiles and packages; no oracle content reaches the model.

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
`python3 -m unittest test_run_check test_run_check_build test_catalog_delta -v`.

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

`upload_only` generates a 64 MiB CSV with the existing generator and sends only
«Загрузи <исходный путь> в Loginom». It requires exactly one delivery, verified
ready/bytes, zero Save attempts and no node creation/configuration. Main cleanup
must close the pristine draft and log out without Save or discard, with a
runtime-close ACK. CSV export and cold are not applicable, even with `--cold`.
The existing generated-source storage/disk cleanup runs afterwards. External
`case.json` may set `"upload_only": true` for the same assertions.

Pearson node scenarios: `corr-pairs` (all X/Y × Z/W pairs in native order),
`corr-null` (pairwise NULL deletion and constant field), `corr-age` (300-row
age/pressure business task). Fixtures and independent expected tables are in
`docs/node-development/nodes/research-corranalysis/acceptance`; each model run
receives only its named input CSV and user task. Other coefficients are deferred.
`outlier-sd` и `outlier-iqr` — Редактирование выбросов, detect/keep/keep,
из `docs/node-development/nodes/preprocessing-elimoutlier/acceptance/`
и его `iqr/`. Три CSV в порядке: данные, выбросы, экстремальные значения;
cold сверяет каждый output_port того же узла с отдельным expected.

`n21` — Скользящее окно (`transform.sliding_window` / `lag`): штатный
`docs/node-development/nodes/transform-slidingwindow/acceptance/task.md`, sales.csv,
независимый expected.json; точный порядок строк и полей, все значения, типы и NULL.

`logreg-enter`: Логистическая регрессия, бинарный Enter, `event=yes`, порог 0.8,
32 строки, точные типы/NULL/порядок, CSV/Save/cold. Источник —
`docs/node-development/nodes/datamining-logregression/acceptance/task.md`,
только `data/train.csv` передаётся модели. CSV проверяет независимый
`oracle.py`; холодный порт 0 — отдельный `expected.json` с допуском
вероятности abs=1e-8/rel=1e-10 и точным порядком полей.

`types300` (через `--cases`) требует `--cold`. Только для этого сценария
runner допускает два ограничения нативного CSV writer D76: текст `0` вместо
эталонного отрицательного нуля и ISO-дату вместо полуночи с ненулевыми
миллисекундами той же даты. Ячейки определяются из эталона, остальные значения
проверяются строго, включая большие целые и знак нуля. Допуск нельзя расширить
частным `check_csv.py`. При отличиях CSV и итог имеют отдельный статус
«PASS с ограничением платформы D76», а results/summary содержат количества
`negative_zero` и `midnight_date`. Точный CSV даёт обычный PASS.
Cold сверяет исходный эталон без CSV-допусков; его FAIL всегда даёт итог FAIL.
Ответ модели об ограничениях нативного экспорта проверяется по model.stdout
при составлении отчёта (отдельного машинного oracle для текста ответа нет).

`exports-excel` runs the approved XLSX sink task and cells.csv fixture from
`nodes/exports-excel/acceptance`, retains `output_port:null`, and verifies the
download with that node’s independent ZIP/XML oracle. `--cold` additionally
checks the saved Excel destination/sheet/header/general format and freshly
reads the connected table for native types, values and field order. It does
not overwrite or reexecute the existing file sink. CSV/TSV cases retain their
existing reader and `--csv` cold path.

`acf-series`, `acf-update`, `acf-one`, `acf-eight`: Автокорреляция одной числовой
серии во временной области, ЧАКФ выключена, 4/4/1/8 отсчётов включая лаг 0.
Задания и независимые expected — `docs/node-development/nodes/research-autocorrelation/acceptance`.
`acf-update` заменяет вход того же узла; остальные получают только series.csv.
CSV и cold проверяют весь выход порта 0, порядок полей и лагов, точные Boolean/NULL,
abs=1e-8 только для real, метки через label_any.

`binning-count`, `binning-width`, `binning-frequency`, `binning-frequency-ties`,
`binning-real`, `binning-integer`, `binning-apply`, `binning-retrain`, `binning-holdout`
используют утверждённые task*.md/expected*.json из
`docs/node-development/nodes/preprocessing-binning/acceptance`. Каждый запускается
с отдельными входами, двумя CSV и cold-чтением обоих портов; apply/retrain заменяют
источник того же импорта внутри одного сценария. NULL/пустая строка, типы, порядок
полей и строк точны, Real abs/rel 1e-12.

`smoothing-hp`: Сглаживание HP Lambda=1 для X/R, series → update на прежнем узле,
фиксированный порядок RowID,X,R,Tag,X_S,R_S через autosync=false;
приёмочный комплект `preprocessing-smoothing/acceptance`, ordered CSV/Save/cold.

`date-time-iso` и `date-time-iso-empty`: четыре операции ISO-календаря в «Дата и время»,
утверждённые task-iso-weeks*.md и независимый Python expected из
`docs/node-development/nodes/date-time/acceptance`. Только соответствующий CSV
из fixtures передаётся модели; 13/0 строк, 12 полей в точном порядке, CSV/Save/cold/cleanup.

`logreg-forward`, `logreg-backward`, `logreg-stepwise` проверяют нативный отбор
со стандартными критерием и порогами Loginom (Deviance, включение 0.05, исключение 0.1).
Пользовательские критерии и пороги в v0.3.9 не поддерживаются; прежние
информационные/строгий/мягкий сценарии исключены из активного каталога.
Источник — `datamining-logregression/acceptance/task-*.md`, только selection.csv
передаётся модели; полный порт 0 (64×9), независимый MLE/LR oracle, CSV/Save/cold/cleanup.
