import { randomUUID } from "node:crypto"
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { buildSources, type Build } from "../builder/build.ts"
import { withDashboardStage } from "./folder.ts"

export { PLATFORM_FILES, sourceFiles, outputText } from "../builder/build.ts"
export type { Build } from "../builder/build.ts"
type InstalledBuild = Extract<Build, { ok: true }>

export async function buildDashboard(input: Parameters<typeof buildSources>[0] & {
  install?: (commit: () => InstalledBuild) => InstalledBuild | undefined
}): Promise<Build> {
  async function compile(staging: string): Promise<Build> {
    const build = await buildSources({ ...input, out: staging })
    if (!build.ok) return build
    const commit = () => {
      const dir = join(input.out, build.hash)
      if (!existsSync(dir)) renameSync(build.dir, dir)
      const current = join(input.out, "current")
      const previous = existsSync(current) ? readFileSync(current, "utf8").trim() : undefined
      const temporary = `${current}.${randomUUID()}.tmp`
      try {
        writeFileSync(temporary, build.hash + "\n")
        renameSync(temporary, current)
      } finally {
        rmSync(temporary, { force: true })
      }
      if (previous !== build.hash) {
        for (const name of readdirSync(input.out)) {
          if (/^[a-f0-9]{64}$/.test(name) && name !== build.hash && name !== previous)
            rmSync(join(input.out, name), { recursive: true, force: true })
        }
      }
      return { ...build, dir }
    }
    return input.install ? input.install(commit) ?? { ok: false, output: "Черновик остановлен." } : commit()
  }
  if (input.install) return withDashboardStage(input.work, compile)
  await mkdir(input.out, { recursive: true, mode: 0o700 })
  const staging = await mkdtemp(join(input.out, ".pending-"))
  try {
    return await compile(staging)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
