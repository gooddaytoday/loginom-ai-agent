# Near-miss calibration implementation checkpoint

Goal: 35 analytic tasks, 113 near-misses, green gpt-6-astra/high acceptance (183 rows).
Base: evals f4fe4224825fab2f894a4b792951771cfd081c89; branch calibration-near-miss.
Spec: ../specs/2026-09-18-evals-design.md, calibration section.

- [x] TDD tracer: missed sort is rejected despite oracle failure.
- [x] Expected checklist/oracle gates, corpus validation and compatibility.
- [x] 35-task corpus: sort 35, aggregate 34, threshold 6, filter 3, column 35.
- [ ] Independent CSV reproduction; full test/typecheck/diff-check.
- [ ] Live full acceptance; general judge prompt tuning if necessary.
- [ ] Final single-prompt run and acceptance report; Goal completion audit.

Boundaries: harness/corpus/docs only, no external task edits or Loginom execution.
Do not weaken rubrics, expected failures or thresholds. Semantic misses are not retried for a lucky pass.

## Verified checkpoint — 2026-10-06

- Worktree: /home/kiselev/.codex/worktrees/calibration-near-miss/loginom-ai-agent.
- Independent reproduction: 35 tasks, 113 cases, exact saved mutant CSV matches.
- Public prepareCalibrationCases: 113 prepared; oracle true only low-liquidity-companies/filter.
- Corpus SHA256: 72e7b163ea881bbbf4ce614529a69925f118dde81501529127ca07e9eb880e0f.
- First full suite: 314 pass, 0 fail, 1419 assertions, 21 files, 352.17s; typecheck exit 0.
  Additional strict-gate tests were added afterwards; final full suite is still required.
- Live full initial run: results/near-miss-live/20261006-063149-calibrate.
  It started from d12be3912 with the original judge prompt. Reporting/validation
  changes made afterwards do not alter this in-flight evaluation; do not edit
  judge-prompt.md while it runs. Session 5243, log /tmp/calibration-live-initial.log.
- Targeted live sales missing-column diagnostic: result in
  results/near-miss-column-diagnostic/result.json. gpt-6-astra/high:
  score 57, export-columns=false, result-rows=false; other supplied items true.

## Remaining completion gates

1. All 35 positive >=90 and oracle=true; all 35 foreign <=40.
2. All 113 near-misses detect every expected_failed and match oracle.
3. Zero judge errors/warnings, exit 0; all judge PROMPT.md hashes identical.
4. If the prompt changes, rerun the entire 183-case suite under that final prompt.
5. Final tests/typecheck/diff-check and acceptance report with tested source,
   model/reasoning, rubric/corpus/prompt hashes.
6. Mark remaining-work item 4 closed only after these gates pass; then complete Goal.

No Loginom or agent baseline was run; mutated packages are not execution-certified.
