// Skill sources of the product plugin (guarantee G6, the `skillSource` seam of 0.4). The product's transform runs last,
// so it sees the skills of every OpenCode source: built-in ones, the `skill(s)` directories of the profile and project
// config, `.agents`, `.claude` and the config's `skills[]` (paths and URLs). Ordinary skills from all of them stay, as in
// 0.4. A reserved product ID or name comes only from the verified bundled catalog; a skill from any other source that
// claims one is dropped, so it neither replaces a bundled skill nor grants Loginom access (B2.2 grants by skill ID).
import { isReservedSkillName } from "@loginom-ai-agent/product/skills"
import { Skill } from "@opencode/plugin"
import type { SkillEditor } from "@opencode/plugin/promise/skill"

/** Whether a skill may stay in the catalog: it is a bundled one, or neither its ID nor its name is reserved. */
export function admits(skill: Pick<Skill.Info, "id" | "name" | "path">, bundled: readonly Skill.Info[]) {
  if (bundled.some((item) => item.id === skill.id && item.path === skill.path)) return true
  return !isReservedSkillName(skill.id) && !isReservedSkillName(skill.name)
}

/**
 * The verified bundled skills of an installation, under `LOGINOM_AI_AGENT_RESOURCES` as in 0.4. None without that root
 * or when its catalog cannot be verified: a reserved name then comes from nowhere (fail closed), and the rest of the
 * product plugin keeps working.
 */
export async function bundled(resources: string | undefined): Promise<Skill.Info[]> {
  if (!resources) return []
  return verified(resources).catch(() => [])
}

async function verified(resources: string) {
  // The verifier needs the runtime client's npm dependencies, so only a run with a resource root loads it.
  const { productSkills } = await import("@loginom-ai-agent/loginom-host/bundled-skills")
  return (await productSkills(resources)).map((skill) =>
    Skill.Info.make({
      id: Skill.ID.make(skill.name),
      name: Skill.Name.make(skill.name),
      description: skill.description,
      path: Skill.Info.fields.path.make(skill.location),
      content: skill.content,
    }),
  )
}

/**
 * Community skills from Hub (В-41, stage E): ones the user installed and accepted as not checked by Loginom. Each has
 * its own ID; one that claims a reserved ID or name is dropped like any other non-bundled skill.
 */
export interface Hub {
  readonly skills: () => readonly Skill.Info[]
}

/** Hub arrives in stage E; until then it contributes nothing. */
export const hub: Hub = { skills: () => [] }

/** The product's skill transform: Hub skills, then bundled ones over any skill with the same ID, then `admits`. */
export function apply(editor: SkillEditor, catalog: readonly Skill.Info[], community: Hub) {
  community.skills().forEach((skill) => editor.add(skill))
  catalog.forEach((skill) => editor.add(skill))
  editor
    .list()
    .filter((skill) => !admits(skill, catalog))
    .forEach((skill) => editor.remove(skill.id))
}
