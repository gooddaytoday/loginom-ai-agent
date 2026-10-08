Stage 0 acceptance inputs and independent expectations; no historical PASS is carried forward.

`task.md` is the model task. Copy only `data/golden.csv` into the model package directory. Substitute a unique owned `{{PACKAGE_PATH}}`. Keep this directory, expectations, oracle, journals and defect history outside model context.

`row_filter_oracle.py` and `row_filter_matrix.py` retain the previous independent byte-based oracle and bounded 90-case scalar matrix. `manifest.json` pins the exact golden bytes and additional section 3 inputs. String ordering and one-based row numbering remain hypotheses until live confirmation on the assigned build.

Generate attempt expectations before running the model:

```sh
python3 oracle.py --package-path '<owned-path>.lgp' --output '<private-attempt>/expected.json'
```

Run the unchanged `scripts/node-acceptance/cold-check.mjs` for port 0. Run `cold-two-ports.mjs` separately for a fresh execution and independently read both ports, retained settings, and exact graph. Neither script reapplies conditions. Both must confirm package closure and logout. W1 is not implemented.

`audit-ports.test.mjs` rejects wrong ports, missing or duplicated rows, stale executions, foreign nodes, partial reads, NULL/empty substitution, and schema drift. This verifies the auditor; it does not establish a live execution. Full acceptance additionally requires the node plan's live matrix, negative cases, model task, regression tests, independent reviewer model task and cleanup receipts.
