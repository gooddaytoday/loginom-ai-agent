import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { buildSources, outputText, sourceFiles, type Build } from "../builder/build.ts"

export { PLATFORM_FILES, sourceFiles, outputText } from "../builder/build.ts"
export type { Build } from "../builder/build.ts"
let commits = Promise.resolve()

export async function buildDashboard(input: Parameters<typeof buildSources>[0] & {
  publication?: { operation: string; sample: { rows: readonly (readonly unknown[])[] } }
}): Promise<Build> {
  if (input.publication) {
    const listed = await sourceFiles(input.work)
    if ("error" in listed) return { ok: false, output: listed.error }
    await mkdir(input.publication.operation, { recursive: true })
    await rm(join(input.publication.operation, "src"), { recursive: true, force: true })
    await cp(join(input.work, "src"), join(input.publication.operation, "src"), { recursive: true })
    const captured = await sourceFiles(input.publication.operation)
    if ("error" in captured) return { ok: false, output: captured.error }
    const files = await Promise.all(captured.files.map(file => readFile(join(input.publication!.operation, file))))
    const found = embeddedValues(input.publication.sample, files)
    if (found.length) return { ok: false, output: outputText(Buffer.from("Опубликованная сборка будет публичной. Удалите из src/ данные образца: " + found.slice(0, 5).join(", "))) }
  }
  await mkdir(input.out, { recursive: true, mode: 0o700 })
  // A concurrent draft may prune shared hashes before this build commits.
  const staging = await mkdtemp(join(input.out, ".pending-"))
  try {
    const build = await buildSources({ ...input, work: input.publication?.operation ?? input.work, out: staging })
    if (!build.ok) return build
    const retained = input.publication && join(input.publication.operation, "dist")
    if (retained) await cp(build.dir, retained, { recursive: true })
    const installed = commits.then(async () => {
      const dir = join(input.out, build.hash)
      if (!existsSync(dir)) await rename(build.dir, dir)
      const current = join(input.out, "current")
      const previous = existsSync(current) ? (await readFile(current, "utf8")).trim() : undefined
      const temporary = `${current}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, build.hash + "\n")
        await rename(temporary, current)
      } finally {
        await rm(temporary, { force: true })
      }
      if (previous !== build.hash) await Promise.all((await readdir(input.out))
        .filter(name => /^[a-f0-9]{64}$/.test(name) && name !== build.hash && name !== previous)
        .map(name => rm(join(input.out, name), { recursive: true, force: true })))
      return { ...build, dir: retained ?? dir }
    })
    commits = installed.then(() => undefined, () => undefined)
    return await installed
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export function embeddedValues(sample: { rows: readonly (readonly unknown[])[] }, files: Buffer[]) {
  const values = new Set(sample.rows.flat().filter(cell => cell != null).map(String))
  return [...values].filter(value => [...value].length >= 6 && files.some(file => file.includes(value)))
}
