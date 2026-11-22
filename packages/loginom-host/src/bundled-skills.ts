// Host owns the installed-skill contract; the Node-compatible implementation is
// also staged with the runtime so classic/diagnostic bridges cannot weaken it.
import { parseDocument } from "yaml"
import { verifyBundledSkills } from "../../loginom-runtime/client/lib/bundled-skill-manifest.mjs"
import { reservedSkillNames } from "@loginom-ai-agent/product/skills"

export { verifyBundledSkills }

export async function verifyProductSkills(resources: string) {
  const skills = await verifyBundledSkills(resources)
  if (reservedSkillNames.some((name) => !skills.some((skill) => skill.name === name)))
    throw Error("LOGINOM_PRODUCT_SKILLS_INCOMPLETE")
  return skills
}

/** Verified product skills as a skill catalog shows them: the frontmatter description and the body without it. */
export async function productSkills(resources: string) {
  return (await verifyProductSkills(resources)).map((skill) => {
    // Verification has already required this frontmatter and a nonempty string description in it.
    const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(skill.content) ?? ["", ""]
    return {
      name: skill.name,
      description: String(parseDocument(header[1]).toJS().description),
      location: skill.location,
      digest: skill.digest,
      content: skill.content.slice(header[0].length),
    }
  })
}
