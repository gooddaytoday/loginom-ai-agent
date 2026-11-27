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

type SkillMetadata = { name: string; description: string; [key: string]: unknown }

type SkillDiagnostic = { code: string; message: string; path?: string }

export function inspectSkillFolder(directory: string, options?: {
  external?: boolean
  authorizeRead?: (paths: string[]) => Promise<void>
}): Promise<{
  data?: SkillMetadata
  errors: SkillDiagnostic[]
  warnings: SkillDiagnostic[]
}>

export function readSkillHeader(content: string): SkillMetadata | undefined

export function readSkillDocument(content: string): { data: SkillMetadata; content: string } | undefined
