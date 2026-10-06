export function bundledSkillInventory(files: { path: string; sha256: string }[]): {
  name: string
  files: { path: string; sha256: string }[]
  digest: string
}[]

export function verifyBundledSkills(resources: string): Promise<{
  name: string
  files: { path: string; sha256: string }[]
  digest: string
  directory: string
  location: string
  content: string
}[]>
