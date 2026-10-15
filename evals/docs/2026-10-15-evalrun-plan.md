# Evalrun: execution plan

Approved 2026-10-15. Branch `evalrun-runtime`, harness base `51459ab905d4151ee4cf8d15521ac46ce0497102`.

- [x] Inspect memory, both related chats, Multica API, source/target hosts and local images.
- [x] Add and test standalone EvalRunner admission/execution/check/export without baseline registry.
- [x] Pin zero infrastructure retries, strict recovery, external skill isolation and management budget.
- [x] Preserve target registration/auth/old agents; clean verified obsolete artifacts only.
- [x] Install Docker and prepare clean Loginom 7.4.2 from LOCAL images plus verified libxml2/Python-disabled config.
- [x] Install official CLI 0.2.0, own profile/catalog/auth, judge home, bwrap/AppArmor.
- [x] Configure proxy/systemd using existing Multica registration and both existing providers.
- [x] Qualify environment without product model calls; transfer EvalRunner and verify actor memory.
- [x] Two distinct smoke admissions consumed: calc-data-double PASS100; crosstable-fixed-sum BLOCKED/recovery. Exactly one attempt each, infraRetries=0.
- [ ] Acceptance remains BLOCKED: actual model verified in both; calc release/archive round trip PASS; node has no RELEASED. Separate BLOCKED diagnostic archive round trip PASS.
- [x] Verify service restart/reboot with empty task queues; publish runbook/checkpoint and retained blocker.

Target `kartai@10.200.9.134`; R=`/home/kartai/.local/share/loginom-evals-runtime`.
Existing daemon `01a0f90f-27cd-723e-a37e-56bfa34b0e8d`, Codex runtime `9f8907d3-de44-4f7f-bfa3-a2a2f94db70b`.
Keep Spamiель/Cursor available, shared daemon concurrency=1; preserve managed Codex 0.162.1.
EvalRunner `5218b92b-71e0-4197-8225-4c30521a3467`: management gpt-6.1-sol/xhigh, no squad/schedules.
Product CLI 0.2.0/source `0c975a73676d9aba556085dbda97e1a9ceb23cc6`, OpenAI gpt-6.1-sol/medium.
Release tar SHA256 `82e99934dd6dc56e5b549207c9f70e12fc207af081d56f825b6b1edced3fd42f`.
Judge gpt-6-sol/xhigh, threshold70, product30m/judge5m, management10m.
No full corpus/baseline promotion/cross-host comparability changes. Historical comparisons remain INCOMPARABLE.
New judge is not fully calibrated; smoke does not establish judge quality.
Source eval-tests and all other worktrees remain untouched. Credentials stay private.
Operator temporary files only under `/home/kiselev/storage/tmp/`; namespace /tmp is private tmpfs.
