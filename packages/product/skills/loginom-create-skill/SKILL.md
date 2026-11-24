---
name: loginom-create-skill
description: Creates, validates, installs, and revises portable Agent Skills for Loginom AI Agent. Use when asked to write a reusable SKILL.md, install a skill from a local folder or GitHub, or update and reinstall a skill. OpenCode configuration belongs to customize-opencode.
---

# Create and install a Loginom skill

- **«Создай скилл для проверки обязательных колонок»** — write a portable folder in the project or the location the user chose, run `skill_install` with `action: "validate"`, then try it on a small table with a known missing column. Leave it in the authoring folder.
- **«Установи скилл из этой папки / по этой ссылке GitHub»** — call `skill_install` with `action: "install"` and the folder or URL as `source`. Use the returned candidate and confirmation flow. Installation copies one skill to `~/.agents/skills`, shared with compatible agents.
- **«Исправь скилл и переустанови»** — edit the separate authoring copy, validate and repeat the example. Then use the same install action and let the user decide on the proposed replacement. For «создай и установи», finish the creation checks first.

## Author a folder

1. Use a concrete input, expected output and a nearby request where the skill should stay inactive. When a missing detail changes the result materially, ask with options and a recommendation. For example, test for a specific missing column and check that a plain row count needs no schema skill.
2. Write `<name>/SKILL.md` with a YAML header between `---` lines and a Markdown body. Match `name` to the folder. Use 1–64 lowercase ASCII letters, digits and single internal hyphens. Give `description` non-empty text of at most 1024 characters that says both what the skill does and when to use it.
3. Put steps, decisions and the expected output in the body. Aim for fewer than 500 lines. Move needed detail to `references/` and link it where used with a path relative to the current file. Add `scripts/` for a needed repeatable operation or `assets/` for a template the skill uses. Keep the whole folder portable.
4. Check the tools available in the actual profile. Use the normal file tools for local tables. For changes to a Loginom workflow, direct the agent to load `loginom-automation` the usual way. Package documentation and dashboards have their own limited profiles. If Python, Node, Git or another external program is necessary, document the requirement and what to do when it is unavailable. Put the requirement in `compatibility` (1–500 characters). The package-docs executor is specialized. Metadata such as `allowed-tools` grants no permission.
5. Run `skill_install` with `action: "validate"` and the folder as `source`. Fix errors and repeat the check. Separately apply the instructions to the example and compare actual and expected results. Test the positive and nearby negative requests in an isolated context when available. Report the folder, validation, actual example result and remaining requirements. State whether skill selection was observed in a chat or assessed from the description.

Optional YAML fields are `license`, `compatibility`, string-valued `metadata` and experimental text `allowed-tools`. The rules above work offline. For more detail see the [Agent Skills specification](https://agentskills.io/specification) and [authoring practices](https://agentskills.io/skill-creation/best-practices).

## Installation and product inclusion

Use the installation tool for publication. If it offers a choice, show the candidate names and folders through the standard question. Respect the user's decision on each confirmation. Once installed, try the skill in chat. It can be discovered from the next message or the next time the user opens `/`.

Inclusion in the product bundle is a separate owner decision. Give the owner the portable folder and test result. Product maintainers add it under `packages/product/skills`, reserve its name and run the source and installed resource checks.
