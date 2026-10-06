# Near-miss calibration implementation checkpoint

Goal: 35 analytic tasks, 113 near-misses, green gpt-6-astra/high acceptance (183 rows).
Base: evals f4fe4224825fab2f894a4b792951771cfd081c89; branch calibration-near-miss.
Spec: ../specs/2026-09-18-evals-design.md, calibration section.

- [x] TDD tracer: missed sort is rejected despite oracle failure.
- [x] Expected checklist/oracle gates, corpus validation and compatibility.
- [x] 35-task corpus: sort 35, aggregate 34, threshold 6, filter 3, column 35.
- [x] Independent CSV reproduction.
- [ ] Final full test/typecheck/diff-check.
- [ ] Live full acceptance; general judge prompt tuning if necessary.
- [ ] Final single-prompt run and acceptance report; Goal completion audit.

Boundaries: harness/corpus/docs only, no external task edits or Loginom execution.
Do not weaken rubrics, expected failures or thresholds. Semantic misses are not retried for a lucky pass.

## Verified checkpoint — 2026-10-06

- Worktree: /home/kiselev/.codex/worktrees/calibration-near-miss/loginom-ai-agent.
- Independent reproduction: 35 tasks, 113 cases, exact saved mutant CSV matches.
- Public prepareCalibrationCases: 113 prepared; oracle true only low-liquidity-companies/filter.
- Initial corpus SHA256: 72e7b163ea881bbbf4ce614529a69925f118dde81501529127ca07e9eb880e0f.
- Corrected corpus SHA256: 00f59c212eb01a2e0dde4ea7441629538cc3f20e2fca904dc103ca98a32a8450.
  first-last-touch/aggregate now preserves the unchanged downstream Round(..., 2).
  Its original six-decimal mean was within oracle tolerance but was corrected for XML/CSV agreement.
  Expectations were not changed. Independent reproduction and public preparation passed again.
- First full suite: 314 pass, 0 fail, 1419 assertions, 21 files, 352.17s; typecheck exit 0.
  Additional strict-gate tests were added afterwards; final full suite is still required.
- Live full initial run: results/near-miss-live/20261006-063149-calibrate.
  It started from d12be3912 with the original judge prompt. Reporting/validation
  changes made afterwards did not alter its imported code. Stopped with exit 143
  after 12 positive/foreign pairs (all 100/0) to correct corpus rounding.
  It is an incomplete diagnostic, not acceptance. Log /tmp/calibration-live-initial.log.
- New full run from clean c1e606017: results/near-miss-final/20261006-065028-calibrate.
  Session 68631, log /tmp/calibration-live-final.log. Original prompt remains fixed
  (SHA256 1aa36ad41f999d999526edd387b014f2b232d27617fba2d9503787b8fbbf287c).
  Do not edit the prompt while a full run is active.
- Intermediate full tests: 319 pass, 0 fail, 1431 assertions, 21 files, 362.08s; typecheck exit 0.
  Final full checks restarted after the rounding fix: session 6428,
  /tmp/calibration-c1e606-full-tests.log and /tmp/calibration-c1e606-typecheck.log.
- Latest targeted tests: 22 pass, 0 fail. Missing XML now reports corpus exit 2.
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
