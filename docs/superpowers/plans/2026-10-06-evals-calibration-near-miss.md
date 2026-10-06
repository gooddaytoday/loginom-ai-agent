# Near-miss calibration implementation checkpoint

Goal: 35 analytic tasks, 113 near-misses, green gpt-6-astra/high acceptance (183 rows).
Base: evals f4fe4224825fab2f894a4b792951771cfd081c89; branch calibration-near-miss.
Spec: ../specs/2026-09-18-evals-design.md, calibration section.

- [ ] TDD tracer: missed sort is rejected despite oracle failure.
- [ ] Expected checklist/oracle gates, corpus validation and compatibility.
- [ ] 35-task corpus: sort 35, aggregate 34, threshold 6, filter 3, column 35.
- [ ] Independent CSV reproduction; full test/typecheck/diff-check.
- [ ] Live full acceptance; general judge prompt tuning if necessary.
- [ ] Final single-prompt run and acceptance report; Goal completion audit.

Boundaries: harness/corpus/docs only, no external task edits or Loginom execution.
Do not weaken rubrics, expected failures or thresholds. Semantic misses are not retried for a lucky pass.
