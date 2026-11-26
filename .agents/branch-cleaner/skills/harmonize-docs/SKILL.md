---
name: harmonize-docs
description: Reconcile documentation affected by Branch Cleaner's branch cleanup, preserving durable rationale, delivery status, and historical validation evidence.
---

# Harmonize Docs

Adapted from [sjunepark/agent-scripts harmonize-docs](https://github.com/sjunepark/agent-scripts/tree/main/skills/harmonize-docs).

Make the affected documentation a coherent account of implementation, intent,
and remaining work. Give each durable fact and mutable status one canonical owner;
link from other reader paths. Prune stale or duplicate material while preserving
detail needed for understanding, rationale, operations, and decisions.

## Scope

Use Branch Cleaner's fixed range, selected design, changed paths, and removal
inventory. Follow their necessary documentation consequences: owning documents,
affected plans and status records, navigation, and cross-references. Do not
substitute all working-tree changes or inventory the whole repository.

Include documentation-specific navigation and configuration. Source code supplies
evidence but stays outside this stage's edit boundary. Generated output, vendored
files, and dependencies are excluded. Preserve immutable historical records and
real release or test evidence, including the versions, paths, and historical
commit IDs actually tested; correct active status framing or routes to them.
Record unrelated conflicts without expanding scope.

## Separate the claims

Keep these states independently legible:

- **Implementation reality:** behavior and operational boundaries verified in
  code, configuration, tests, commands, or releases.
- **Target design:** selected, proposed, or unresolved future behavior supported
  by the latest confirmed direction.
- **Delivery status:** completed, active, blocked, deferred, and next work in the
  repository's existing planning convention.

Accepted design is not implemented behavior. Source implementation alone does
not prove validation, publication, support, authorization, or production
readiness. Use clear framing, tense, or a concise status map rather than repeating
qualifications in every sentence.

## Reconcile the documents

Read each in-scope document and verify material claims against the appropriate
evidence. Recover decisions and useful rationale; expose unresolved conflicts
rather than inventing intent. Retain uncertain removal candidates. Explanations
of why a constraint exists or why an alternative was rejected remain valuable
when they explain the selected design.

Choose a purpose, audience, scope, and lifecycle for each document. Retain concise
documents that already work. Rewrite, merge, split, move, or remove material when
its ownership or reader path warrants it; create a document only for a distinct
durable responsibility. Preserve tool-recognized instruction discovery and
precedence when changing instruction files.

When creating, rewriting, splitting, merging, or moving `ARCHITECTURE.md`, read
the [architecture documentation guide](guides/architecture-docs.md). Keep target
architecture visibly framed, and let plans own delivery order and remaining work
instead of making architecture a second roadmap.

Apply the coherent result directly. Integrate updates where they belong, prune
superseded active statements and unnecessary development narration, and repair
affected links, commands, terminology, and navigation. Preserve useful intent
even when its wording or location changes. Extend the removal inventory with
proven obsolete documents or fragments; do not treat all historical mentions as
removal matches.

This stage edits documentation only: it does not stage, commit, replace refs, or
push. Branch Cleaner's history stage has the existing authorization to construct
commits and replace the named local branch after its checks; it does not need a
second permission request from this skill.

## Completion

Read the final documents together. Check affected links, paths, examples, and
commands; search for stale terms and conflicting claims. Replace volatile counts
with stable facts or source pointers where the counts serve no durable purpose.

Check transitions in both directions: completed work reaches current-state docs
and progress records, while unfinished design stays visibly unimplemented.
Direct-entry overviews must route to the same authoritative state as detailed
plans. Run relevant available checks and fix failures caused by the rewrite.

Pass meaningful corrections, canonical ownership, the removal inventory, actual
validation, and unresolved limits to the history stage. Finish when the scoped
documents agree and readers can find what exists, what is intended, and what
remains.
