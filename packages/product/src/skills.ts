import { fileURLToPath } from "node:url"

// This export is Node-only. The browser-facing Product entry must not import it.
export const productSkillsDirectory = fileURLToPath(new URL("../skills/", import.meta.url))
export const reservedSkillNames = ["loginom-automation", "package-docs"] as const
export const obsoleteSkillNames = ["package_docs"] as const

export function isReservedSkillName(name: string) {
  return [...reservedSkillNames, ...obsoleteSkillNames].some((reserved) => reserved === name)
}
