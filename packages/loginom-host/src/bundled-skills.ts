// Host owns the installed-skill contract; the Node-compatible implementation is
// also staged with the runtime so classic/diagnostic bridges cannot weaken it.
import { inspectSkillFolder, verifyBundledSkills } from "../../loginom-runtime/client/lib/bundled-skill-manifest.mjs"
import { isReservedSkillName, reservedSkillNames } from "@loginom-ai-agent/product/skills"

export { verifyBundledSkills }

export async function verifyProductSkills(resources: string) {
  const skills = await verifyBundledSkills(resources)
  if (reservedSkillNames.some((name) => !skills.some((skill) => skill.name === name)))
    throw Error("LOGINOM_PRODUCT_SKILLS_INCOMPLETE")
  return skills
}

export async function validateSkillFolder(directory: string, options?: { external?: boolean }) {
  const result = await inspectSkillFolder(directory, options)
  if (result.data && isReservedSkillName(result.data.name.toLowerCase())) {
    result.errors.push({
      code: "LOGINOM_SKILL_NAME_RESERVED",
      path: "SKILL.md",
      message: "This name is reserved for a bundled Loginom skill.",
    })
  }
  return result
}
