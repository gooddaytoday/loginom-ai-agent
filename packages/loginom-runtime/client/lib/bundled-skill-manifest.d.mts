export function bundledSkillInventory(files: { path: string; sha256: string }[]): {
  name: string
  files: { path: string; sha256: string }[]
  digest: string
}[]
