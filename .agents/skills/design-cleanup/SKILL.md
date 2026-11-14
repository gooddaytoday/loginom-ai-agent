---
name: design-cleanup
description: >-
  Sweep the current branch for leftovers of an abandoned design after a
  significant mid-work decision change, and rewrite the affected code,
  comments, tests, and docs so the result reads as if it had been designed
  this way from the beginning. Use when the user says "design cleanup",
  "clean up the old approach", "erase the journey", says a design decision
  changed and asks to clean up after it, or after a pivot in approach
  mid-branch. This is a rewrite pass over the code touched by the decision
  only — not a general refactoring or bug-hunting pass.
---

# Design cleanup — make the tree read as designed-this-way

## Why this skill exists

When a design decision changes mid-work — a different approach, a renamed
concept, a replaced mechanism — the branch tends to keep fossils of the
abandoned design: dead branches, shims that only served the old path, names
shaped by the old concept, comments narrating the change, tests pinning
behavior that no longer matters. The diff may show the journey; the final
tree must not. This skill hunts those fossils down and rewrites the result
as if the current design had been there from the beginning.

## Step 1 — Establish the decision

State the decision as one line: "the design is X; the abandoned approach
was Y". Take it from the user or the session context. If it is not stated,
reconstruct it from the branch diff and commit messages, then confirm the
one-line summary with the user before making sweeping edits — cleanup
against a misread decision destroys correct code.

## Step 2 — Determine scope

- Compute the branch diff: `git diff $(git merge-base HEAD origin/main)...HEAD`
  (fall back to `origin/develop`, then `develop`).
- The cleanup covers only code touched by the decision: the changed files
  that implement it, plus files that reference the renamed or removed
  concepts (find them by grepping for the old names).
- Everything else is out of bounds. This skill is not a license for
  unrelated refactors, formatting passes, or opportunistic improvements.

## Step 3 — Hunt the leftovers

Check each category against the in-scope files:

- **Dead code**: branches, parameters, feature flags, config keys, and
  helpers that only the abandoned path used.
- **Shims and indirection**: adapters, wrappers, and abstraction layers
  that existed only to bridge the old design to the new one.
- **Names and structure**: identifiers, files, and modules shaped by the
  old concept — `newParser`, `handleV2`, `legacyFoo`, or a module layout
  organized around a concept that no longer exists.
- **Comments and docstrings**: anything describing the old design or
  narrating the change — "previously", "instead of", "now we", "changed
  from X to Y". Descriptions must state only the current design.
- **Tests**: tests that pin the abandoned behavior, transitional states,
  or the shape of the old API. Rewrite them for the intended behavior of
  the current design; do not keep them green by accident.
- **Docs**: README sections, ADRs, diagrams, and examples that describe
  the old mechanism. Update in place — no "migration note" additions.
- **TODOs**: items left for the old plan.

## Step 4 — Rewrite, don't patch

- Rename to the current concept everywhere, not just where it is cheap.
- Delete dead code outright; never comment it out or gate it "just in
  case". Git history holds the old version.
- Collapse indirection that no longer earns its keep.
- Rewrite affected comments, docstrings, and docs to describe only the
  current state.

## Step 5 — Verify and report

- Run the project's build and tests; the cleanup must not change behavior
  of the surviving design.
- Grep the resulting branch diff for history words as a smoke check:
  `previously|instead of|no longer|old |new |V2|legacy` — hits are
  candidates to fix, not automatic violations; judge each.
- Grep the whole tree for the abandoned names to confirm no dangling
  references remain.
- Report what was removed, renamed, and rewritten, grouped by the
  categories above, and call out anything suspicious that was left alone
  because it fell outside the decision's scope.
