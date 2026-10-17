# LAB-58 writer guard — offline checkpoint
Case frozen: `68161f9e34d792e82d8e92c396f76c69c17787ab`; this separate worktree is a review candidate, not an installed helper.
Assignment: Evaler comment `01a14700-df93-7911-8a79-4a7f5142b7bb`; no reference/product/provider/smoke/HEAD or stand actions.
The saved command/cwd and identical tracked source bind both writer errors to `evals/src/process-supervisor.ts`.
Pinned CLI `d6fc9c9b7b499d0a182c972815913b541e4cb81b` creates `.writer` before writing `owner` with `wx`.
The old observer interprets an initially missing owner only as release; first publication reproduces its exact error.
The controlled filesystem RED confirms this defect; saved runs have no syscall trace proving their exact interleaving.
Candidate: bounded first publication only when the guard was absent before launch, the CLI is admitted and no owner was captured.
The original device/inode, no-follow, ancestry, release and fail-closed checks remain; empty nonce never becomes an identity.
Tests cover first publication, empty/absent owner, owner/directory substitution, symlinks, EACCES and supervisor admission.
Original FAIL (one-apply requirement), both ERRORs, all three dirty flags and cumulative budgets remain authoritative.
Python checker import is verified with `PYTHONDONTWRITEBYTECODE=1 python3 -B`; no new bytecode is created.
Raw RED, later checks, immutable-evidence hashes and any environment failures are delivered in the offline evidence archive.
The broad run retained 630 PASS / 15 SKIP / 13 FAIL; all 13 failures passed an unchanged-source recheck with scoped temp configuration and the old inaccessible PID absent.
All 49 writer/supervisor/settlement regressions in the broad run passed; typecheck passed. No single all-green broad run is claimed.
The operator's pre-existing uncommitted publication candidate was inspected read-only; its checkout is preserved.
Required next decision: independent Ben review of the exact clean candidate before any installation or live work.
