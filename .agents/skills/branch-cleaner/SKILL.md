---
name: branch-cleaner
description: Explicitly launch an isolated agent to clean a branch and rebuild its local history while preserving useful decisions.
---

# Launch Branch Cleaner

Run only when the user explicitly invokes `$branch-cleaner`. This is a launcher;
the cleanup and its internal skills belong in a separate agent's context.

1. Resolve the target repository from the request or current working directory.
   Prefer its `.agents/branch-cleaner/AGENT.md` when present. Otherwise resolve
   `../../branch-cleaner/AGENT.md` **from this SKILL.md's directory**, including
   when this skill is installed globally. Check existence without reading the
   role or internal skills into this conversation. If neither exists, report the
   missing installation; do not substitute another cleanup workflow.
2. Spawn one general-purpose child with a fresh context: explicitly disable
   conversation inheritance using the available tool's parameter (for example
   `fork_turns: "none"` or `fork_context: false`). Do not use a full-history fork.
   If the platform cannot spawn a fresh child, report that limitation.
3. Pass only the resolved role path, repository path, the user's branch/base and
   requested mode, and material constraints already supplied by the user. Tell
   the child to read that role, obey the target repository's instructions, and
   read internal skills only when their stage requires them. State any explicit
   permission for publication; otherwise this invocation permits local cleanup
   and history replacement only. Do not attach this conversation's transcript.
4. Wait for the child and relay its verified result and limitations. Route any
   essential missing-input question to the user. Do not run cleanup in the parent
   or start a second worker against the same branch.

If the user requests only an audit, pass that restriction unchanged. An explicit
audit does not authorize changes. Do not infer a repository, branch or base from
unrelated conversation history.
