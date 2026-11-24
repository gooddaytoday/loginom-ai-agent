export function bundledSkillInventory(files: { path: string; sha256: string }[]): {
  name: string
  files: { path: string; sha256: string }[]
  digest: string
}[]

export function verifyBundledSkills(resources: string, options?: { mode?: "installed" | "source" }): Promise<{
  name: string
  files: { path: string; sha256: string }[]
  digest: string
  directory: string
  location: string
  content: string
}[]>

type SkillDiagnostic = { code: string; message: string; path?: string }

export function inspectSkillFolder(directory: string, options?: { external?: boolean }): Promise<{
  data?: { name: string; description: string; [key: string]: unknown }
  errors: SkillDiagnostic[]
  warnings: SkillDiagnostic[]
}>
