import { describe, expect, test } from "bun:test"
import { obsoleteSkillNames, reservedSkillNames } from "@loginom-ai-agent/product/skills"
import { Skill } from "@opencode/plugin"
import type { SkillEditor } from "@opencode/plugin/promise/skill"
import { admits, apply, hub, type Hub } from "../src/skills"

// Guarantee G6, ported from 0.4 `skillSource` (`a080f7725c:packages/opencode/test/product/skill-source.test.ts`). On
// OpenCode 2 a skill has an ID (its directory) apart from its name; B2.2 grants by ID, 0.4 reserved by name, so both count.
const info = (id: string, path: string, name = id) =>
  Skill.Info.make({
    id: Skill.ID.make(id),
    name: Skill.Name.make(name),
    description: `${id} from ${path}`,
    path: Skill.Info.fields.path.make(path),
    content: path,
  })
const catalog = reservedSkillNames.map((name) => info(name, `/resources/skills/${name}/SKILL.md`))
const reserved = [...reservedSkillNames, ...obsoleteSkillNames]

// The skill catalog as the product's transform sees it after every other source.
function editor(skills: Skill.Info[]) {
  const map = new Map(skills.map((skill) => [skill.id as string, { ...skill }]))
  return {
    map,
    editor: {
      list: () => [...map.values()],
      get: (id) => map.get(id),
      add: (skill) => void map.set(skill.id, { ...skill }),
      update: (id, change) => {
        const skill = map.get(id)
        if (skill) change(skill)
      },
      remove: (id) => void map.delete(id),
    } satisfies SkillEditor,
  }
}

describe("skill sources (G6)", () => {
  test("a reserved ID or name is admitted only from the bundled catalog", () => {
    for (const skill of catalog) expect(admits(skill, catalog)).toBe(true)
    for (const name of reserved) {
      expect(admits(info(name, `/home/user/.agents/skills/${name}/SKILL.md`), catalog)).toBe(false)
      expect(admits(info("other-folder", "/project/.claude/skills/other-folder/SKILL.md", name), catalog)).toBe(false)
      expect(admits(info(name, `/resources/skills/${name}/SKILL.md`), [])).toBe(false)
    }
  })

  test("ordinary skills are admitted from every source", () => {
    for (const path of [
      "/home/user/.agents/skills/review/SKILL.md",
      "skill://opencode/SKILL.md",
      "/profile/skills/review/SKILL.md",
    ])
      expect(admits(info("review", path), catalog)).toBe(true)
  })

  test("the transform replaces impostors with the bundled skills and keeps ordinary ones", () => {
    const state = editor([
      ...reserved.map((name) => info(name, `/home/user/.agents/skills/${name}/SKILL.md`)),
      info("lookalike", "/project/.agents/skills/lookalike/SKILL.md", "loginom-automation"),
      info("review", "/project/.agents/skills/review/SKILL.md"),
    ])
    apply(state.editor, catalog, hub)
    expect([...state.map.keys()].toSorted()).toEqual([...reservedSkillNames, "review"].toSorted())
    for (const skill of catalog) expect(state.map.get(skill.id)).toEqual(skill)
  })

  test("without a verified catalog no source supplies a reserved skill", () => {
    const state = editor([
      ...reserved.map((name) => info(name, `/home/user/.claude/skills/${name}/SKILL.md`)),
      info("review", "/r"),
    ])
    apply(state.editor, [], hub)
    expect([...state.map.keys()]).toEqual(["review"])
  })

  test("Hub adds community skills under their own IDs and cannot take a product ID or name", () => {
    const community: Hub = {
      skills: () => [
        info("hub.review", "/hub/review/SKILL.md", "review"),
        info("hub.automation", "/hub/automation/SKILL.md", "loginom-automation"),
        info("loginom-automation", "/hub/loginom-automation/SKILL.md"),
      ],
    }
    const state = editor([])
    apply(state.editor, catalog, community)
    expect([...state.map.keys()].toSorted()).toEqual([...reservedSkillNames, "hub.review"].toSorted())
    expect(state.map.get("loginom-automation")).toEqual(catalog[0])
    expect(hub.skills()).toEqual([])
  })
})
