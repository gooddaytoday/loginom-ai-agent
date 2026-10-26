Run live acceptance without repeatedly reading live logs:

```sh
python3 scripts/node-acceptance/run-check.py start --head 2e6f66a9 --scenarios n1,q7 --pair ~/.config/loginom-multica/cards/PAIR --cold
python3 scripts/node-acceptance/run-check.py wait /absolute/result-directory --timeout 4500
```

`start` returns only the result directory. The detached worker owns the run;
keep the machine available and collect it with `wait` before handing off the
task. `wait` returns 0 for all PASS, 1 for a finished failed/unknown batch, or 2
for its own timeout. A timeout does not cancel the worker; repeat `wait`.
The result directory is private (0700); `summary.md` and atomic `results.json`
contain the report. Configs, profiles and raw logs stay private there.

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

Each n/s case starts with a new profile, chat, workspace and personal package.
q1–q10 first run their documented base; s7/s8 first run s1. Only the business
request and input CSVs reach the model; continuations reuse the session and
package without attaching inputs again. CSV checks consume every exported row.
Stock cold receives `--csv` and never reapplies node settings.
Save, main close/logout, runtime-close ACK and delivered port freshness/cleanup
must all be confirmed. Requested field types/names remain in the cold expected.
An invalid port read marks the scenario FAIL but allows the remaining business
steps and cold check when Save and main cleanup are confirmed. For q scenarios,
this also retains failures from the base scenario in the final result.

Pilot limits: cases without a cold JSON fixture (currently n14–n17) are refused
before detach. No automatic retries or account switching. Failed and UNKNOWN
profiles/packages are retained; main cleanup never discards changes. Cold uses
its stock diagnostic cleanup. Archive evidence before deleting run directories;
never share a whole profile or `cold-config.json` (they contain credentials).

Offline tests: from `scripts/node-acceptance/tests`, run
`python3 -m unittest test_run_check -v`.
