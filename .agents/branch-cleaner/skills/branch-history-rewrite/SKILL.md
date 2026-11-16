---
name: branch-history-rewrite
description: Rebuild Branch Cleaner's complete branch-only history as verified logical linear commits and safely replace the named local branch with a recoverable backup.
---

# Branch History Rewrite

Use the role's fixed repository, branch ref, base, original tip, removal inventory,
and cleaned worktree. This stage may construct commits and replace that local
branch under the existing assignment. Keep the base and every unrelated ref
unchanged. Do not push without a separate instruction.

## Validate the expected result first

Confirm that the fixed base is an ancestor of the original tip and that the
complete original range includes every commit reachable from that tip but not
the base (`git rev-list --reverse --topo-order <tip> --not <base>`). Account for
side branches and useful conflict resolutions; first-parent patches alone lose
information. Preserve the original history for review throughout the operation.

Review the cleaned tree against the selected design and the short explicit
removal inventory. Selectors must identify actual obsolete artifacts, not words
that also occur in valid rationale, historical evidence, or regression tests.
Run required tests and checks before reconstruction. Distinguish baseline
failures from new failures; do not claim failed or unavailable checks passed.
If required acceptance cannot be satisfied, retain the prepared work and report
the remaining condition instead of replacing the original branch.

In the isolated worktree, stage only the validated result and record its exact
tree object ID as the expected tree. Preserve it under a temporary ref or commit
so reconstruction cannot lose it. Include tracked modes, symlinks, deletions,
binary changes, and submodule entries; a text diff alone is insufficient. Honor
repository hooks and secret checks for every commit, including temporary ones.

## Construct logical linear commits

Start a separate prepared history at the same fixed base, using clean worktree
transitions. Do not replay the experiment-and-revert sequence. Group the retained
result by coherent behavior or responsibility; each commit should express the
selected design and its relevant tests/docs. Build from validated content so an
obsolete implementation does not appear in an early commit merely because a
later commit deletes it. Do not collapse unrelated contributions just to reduce
the number of commits.

Preserve useful merge-resolution changes in the logical commits that own them;
the new history is linear even when the original was not. Preserve original
authorship where a change has one author; split by contribution when sensible,
or accurately retain additional contributor credit in commit trailers. Do not
attribute other authors' work to the cleaner. Use the repository's commit style.

Keep an old-to-new commit mapping with the recovery evidence outside the committed
result. Retain historical SHA references in immutable test/release evidence:
rewritten commits are not the artifacts that were previously tested. Update only
references intended to identify the current branch state, with explicit evidence.

For **every new commit**, inspect its full tree, patch, and message against the
removal inventory and selected design. Reject a history that briefly reintroduces
removed artifacts, even when its final tree is correct. Check dependencies and
run the checks required for that commit by repository instructions. Explain any
retained inventory match rather than deleting useful history or tests blindly.

At the prepared tip, rerun checks whose evidence was invalidated by reconstruction
and prove exact equality between its tree ID and the validated expected tree ID.
Verify that the complete new range is a linear chain from the unchanged base.
Keep a named prepared ref until replacement and recovery verification complete.

## Make a recoverable backup

Before replacing the original branch, create a uniquely named backup ref at the
original tip without overwriting an existing ref. Create a Git bundle containing
that backup history in durable storage outside the repository and outside
disposable worktrees or automatically cleaned temporary directories. Follow the
user's and project's storage rules; record its retained location, and never
remove it while cleaning up a working or test worktree. Verify the bundle, verify
that its listed backup ref has the exact original tip, and confirm it can supply the
original history. Prefer a self-contained bundle; a bundle that only verifies
because its prerequisites exist in this repository is not an independent backup.
Record backup ref, bundle location, base, original tip, prepared tip, expected tree,
and commit mapping in the external recovery evidence.

Do not replace the branch if backup creation or verification fails. A backup is
an intentional new recovery ref, not permission to alter other existing refs.

## Replace the branch without stale worktree state

Use `git worktree list --porcelain` to identify whether and where the original
branch is checked out. Recheck its ref against the fixed original tip immediately
before replacement. If it moved, retain the prepared result and backup; never
silently restart from the new tip or overwrite it.

- **Branch not checked out:** recheck worktree ownership, then use compare-and-swap
  `git update-ref <branch-ref> <prepared-tip> <original-tip>`. Stop on a mismatch.
- **Branch checked out:** in its owning worktree, require an empty porcelain
  status including untracked files and submodule changes, no unfinished Git
  operation, and `HEAD` attached to the expected branch at the original tip.
  Detach there at the original tip with
  `git switch --no-overwrite-ignore --detach <original-tip>`, without force.
  Recheck that no worktree owns the branch and its ref still matches;
  then perform the same compare-and-swap update. Switch that owning worktree
  back with `git switch --no-overwrite-ignore <branch>`, without force, and
  verify clean status, HEAD, index, and working tree correspond to the prepared tip.

Clean porcelain status does not include ignored local files. Ordinary switching
can overwrite them even without force; keep `--no-overwrite-ignore` on both
switches. If a renamed or added path collides with an ignored file, stop and
preserve that file, the prepared ref, and backup. If the final switch fails after
the compare-and-swap, report that the branch ref is updated while the owning
worktree remains detached; do not delete the local file to complete the switch.

Never update a checked-out branch ref while leaving its index and files at the
old commit. Never use `reset --hard`, forced checkout/switch, automatic stash,
or removal of user files to make replacement pass. A dirty owner, moved ref,
new owner, or failed safe switch is a reason to stop replacement, not to discard
work. Keep the prepared ref and backup and report the exact state reached. If
detachment or ref replacement already happened, say so and give recovery steps
for that actual state; do not claim that the branch is untouched.

## Finish and recover

Verify the target ref, owning worktree when present, expected final tree, same
base, and unchanged unrelated refs. Report completion only after those checks.
Keep the backup and prepared result available; do not delete recovery artifacts
automatically.

For an interrupted or blocked replacement, report how to inspect the prepared
ref in a separate worktree and where the old tip/bundle can be recovered. Require
the owner to preserve or resolve their dirty changes before retrying the normal
detach/CAS/switch sequence. A stale original tip requires a fresh scoped run;
never restore an old tip over a newly advanced branch. Do not execute destructive
recovery merely to finish the assignment.
