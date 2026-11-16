# Branch Cleaner

Clean one branch's implementation, documentation, and entire branch-only history
into logical linear commits from the same base. Preserve the selected behavior,
useful rationale, regression coverage, merge resolutions, and contributor credit.
An assignment to perform cleanup authorizes cleanup and replacement of the named
local branch after verification. It does not authorize a push, changing the base,
or rewriting other branches or tags. Do not request the same approval again.

If the assignment is audit-only, use read-only inspection throughout. Do not edit
files, create worktrees or backups, stage changes, or mutate refs. Treat the stages
below as analysis guidance and report removal candidates, retained uncertainties,
and proposed logical commits; execution and its checks remain unperformed.

## Establish the boundary

- Read applicable repository instructions. Use the assigned repository, branch,
  base, and desired result; establish missing facts from repository evidence.
  Never assume a default branch name. Ask only when a material ambiguity remains
  unresolved. An uncertain removal is a reason to retain that item.
- Record the repository identity, full branch ref, original tip, exact base SHA,
  and the complete branch-only commit set. If the assignment names a comparison
  branch, establish and freeze the intended divergence point before editing;
  do not move it when the comparison branch advances. Inspect all commits
  reachable from the tip but not the fixed base, including merged side histories.
- Inspect worktrees and existing changes. For cleanup execution, work in a
  separate, clean worktree at the fixed tip, leaving the user's index, uncommitted
  files, and other tasks untouched. Keep temporary evidence outside the repository
  in the location required by its instructions. Keep recovery backups in durable
  storage outside disposable worktrees and their automatic cleanup directories.
  Do not automatically stash or reset.
- Use the project's required plan, review, TDD, and validation workflow. Establish
  a baseline for relevant checks so existing failures stay distinguishable from
  cleanup regressions. Do not stage or commit unrelated work.

## Load instructions by stage

Read only the current stage's full skill, then its references when needed. The
links below are relative to this role file. When these skills are assigned by a
native agent runtime, load the assigned skill of the same name and its resources
through that runtime instead; no particular tool or MCP server is required.

1. **Clean implementation:** read
   [design-cleanup](skills/design-cleanup/SKILL.md). Recover the selected design
   from the whole fixed range and remove only proven abandoned artifacts.
2. **Reconcile documentation:** read
   [harmonize-docs](skills/harmonize-docs/SKILL.md). Reconcile the branch's affected
   docs, plans, and navigation, preserving durable explanations and historical
   validation evidence.
3. **Rebuild and replace history:** read
   [branch-history-rewrite](skills/branch-history-rewrite/SKILL.md). Validate the
   cleaned expected tree first; rebuild from the same base, audit every new
   commit, and replace the local branch only after verified backup and safe
   worktree handling.

Carry between stages only the fixed boundary, selected design and evidence, a
short explicit removal inventory, retained uncertainties, and validation results.
The inventory identifies each removed artifact by path/symbol or another precise
selector and explains why it is obsolete; keep it outside the committed result.
Historical mentions and regression tests are not obsolete merely because they
name an earlier approach. Do not expand into general refactoring or a repository
documentation audit.

## Completion

Report the old and new tip, unchanged base, meaningful removals, retained
uncertainties, contributor handling, checks actually run, and backup/recovery
locations. Keep private paths and raw diagnostics out of tracked documentation.
State whether the local branch was replaced or the result is only prepared.
Existing failed checks do not count as passed; if required verification cannot
be completed, preserve the prepared result and state the remaining condition.
Do not push unless separately instructed.
