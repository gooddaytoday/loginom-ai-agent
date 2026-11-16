---
name: design-cleanup
description: Clean proven remnants of abandoned designs within Branch Cleaner's fixed branch range while preserving current behavior and durable evidence.
---

# Design Cleanup

Adapted from [gjkim42/kanon-repo design-cleanup](https://github.com/gjkim42/kanon-repo/tree/main/skills/design-cleanup).

Make the implementation express the selected design directly. Remove dead paths,
transitional mechanisms, and stale descriptions only when their purpose has
actually disappeared. This is the implementation stage of Branch Cleaner, not a
general refactoring or bug-hunting pass; the role owns scope and authorization.

## Establish intent from the whole range

Use the role's fixed base and original tip. Read the complete branch-only commit
set, including side histories and merge resolutions, not just the tip diff or
first-parent log. State the selected design and the abandoned approach briefly,
grounded in the assignment, current implementation, and recorded decisions.

Scope cleanup to artifacts introduced or changed by those decisions and their
necessary references. A name, a failed experiment, or a later deletion alone
does not prove that surviving behavior is obsolete. If evidence cannot resolve
a candidate, retain it and record the uncertainty. Ask only if a material
decision needed to complete the assignment cannot be established; do not ask
again for permission to perform the assigned cleanup.

Absence of search matches does not prove that code is unused. Before removing a
candidate, inspect relevant dynamic or reflective calls, exported interfaces,
plugins, scripts, configuration, routes, and supported external consumers. Retain
the candidate when these consumers cannot be reliably established.

## Remove proven leftovers

Maintain a short removal inventory with precise selectors and evidence for each
decision. Inspect these categories within the established scope:

- **Code and configuration:** unused branches, flags, parameters, helpers, and
  config keys whose only consumer was the abandoned design.
- **Transitional machinery:** adapters, wrappers, compatibility paths, and
  indirection that no longer serve a supported contract or operational need.
- **Names and structure:** identifiers and file organization tied to an obsolete
  concept. A versioned or `legacy` name can still describe a real boundary.
- **Comments and docs:** stale explanations and development narration. Rewrite
  active descriptions for the current design while preserving the reasons for
  constraints, rejected alternatives that explain a decision, and historical
  evidence. Pass broader documentation reconciliation to the next stage.
- **Tests:** assertions that exclusively enforce abandoned internals. Preserve
  regression tests and observable behavioral guarantees, even when they were
  discovered during a rejected approach. Adapt their setup to the current design
  instead of deleting coverage or weakening expectations to obtain green tests.
- **Temporary artifacts:** superseded scratch plans, experiment files, and TODOs
  for work no longer intended. Retain useful decisions and still-open obligations
  in their canonical owner before removing a redundant document.

Delete dead code rather than commenting it out. Rename consistently across
required references and collapse indirection that has lost its purpose. Do not
add abstractions, compatibility options, or unrelated formatting. Follow the
repository's TDD requirements for code changes; use behavioral checks for
behavior-preserving simplification.

## Verify the cleaned implementation

Run the affected project's required checks and compare with the baseline. Search
for abandoned names and dangling references in the relevant tree. Words such as
`previously`, `legacy`, or `V2` are investigation hints, never automatic grounds
for deletion. Check that useful merge-resolution behavior and regression coverage
survive.

Pass the selected design, removal inventory, retained uncertainties, changed
paths, and actual validation results to the documentation stage. Record existing
failures separately; do not claim unrun or failed checks passed. This stage does
not replace refs, push, or commit a final history.
