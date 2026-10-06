import path from "node:path"
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises"
import { evalsRoot } from "./config"
import { EvalFailure } from "./fail"

export function parseArtifactSource(value: string, docker: { container: string; storageDir: string }) {
  if (value === "docker") return { kind: "docker" as const, container: docker.container, storageDir: docker.storageDir }
  if (value.startsWith("dir:")) return { kind: "dir" as const, dir: path.resolve(evalsRoot, value.slice(4)) }
  throw new EvalFailure(`EVAL_ARTIFACT_SOURCE: ожидается docker или dir:<path>, получено "${value}"`, 2)
}
export type ArtifactSource = ReturnType<typeof parseArtifactSource>

export function parseFindOutput(text: string) {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name = "", seconds = "0"] = line.split("\t")
      return { name, mtimeMs: Number(seconds) * 1000 }
    })
}

function findArgs(dir: string) {
  const format = "%f\\t%T@\\n"
  return ["find", dir, "-maxdepth", "1", "-type", "f", "-printf", format]
}

export async function findListing(dir: string) {
  const listed = await Bun.$`${findArgs(dir)}`.quiet().nothrow()
  if (listed.exitCode !== 0) throw new Error(`find: ${listed.stderr.toString().trim()}`)
  return listed.text()
}

export async function listStorage(source: ArtifactSource) {
  if (source.kind === "dir") {
    const names = await readdir(source.dir)
    return Promise.all(
      names.map(async (name) => ({ name, mtimeMs: (await stat(path.join(source.dir, name))).mtimeMs })),
    )
  }
  const listed = await Bun.$`docker exec ${source.container} ${findArgs(source.storageDir)}`.quiet().nothrow()
  if (listed.exitCode !== 0) throw new Error(`docker exec find: ${listed.stderr.toString().trim()}`)
  return parseFindOutput(listed.text())
}

async function copyOut(source: ArtifactSource, name: string, dest: string) {
  if (source.kind === "dir") return cp(path.join(source.dir, name), dest)
  const copied = await Bun.$`docker cp ${`${source.container}:${source.storageDir}/${name}`} ${dest}`.quiet().nothrow()
  if (copied.exitCode !== 0) throw new Error(`docker cp ${name}: ${copied.stderr.toString().trim()}`)
}

export async function unzip(lgp: string, dest: string) {
  await rm(dest, { recursive: true, force: true })
  const result = await Bun.$`unzip -o -q ${lgp} -d ${dest}`.quiet().nothrow()
  if ([50, 126, 127].includes(result.exitCode) || /Permission denied|No space left on device/i.test(result.stderr.toString()))
    throw new Error(`unzip (код ${result.exitCode}): ${result.stderr.toString().trim()}`)
  if (result.exitCode !== 0 && result.exitCode !== 1) return false
  const units = await Array.fromAsync(new Bun.Glob("Unit_*/Unit.xml").scan(dest))
  return units.length > 0
}

export async function fetchArtifact(input: {
  source: ArtifactSource
  username: string
  receipts: string[]
  instructed: string
  resultPrefix: string
  since: number
  outDir: string
}) {
  const entries = await listStorage(input.source)
  const names = new Set(entries.map((entry) => entry.name))
  const relative = (full: string) =>
    full.startsWith(`/${input.username}/`) ? full.slice(input.username.length + 2) : full.replace(/^\//, "")
  const fromReceipts = input.receipts.map(relative).filter((name) => names.has(name))
  const chosen = fromReceipts.length
    ? { origin: "receipt" as const, name: fromReceipts[fromReceipts.length - 1] ?? "", ambiguous: [] as string[] }
    : names.has(input.instructed)
      ? { origin: "instructed" as const, name: input.instructed, ambiguous: [] as string[] }
      : scan(entries, input.since, input.resultPrefix)
  if (!chosen) return undefined
  await mkdir(input.outDir, { recursive: true })
  const localLgp = path.join(input.outDir, "package.lgp")
  await copyOut(input.source, chosen.name, localLgp)
  const unpackedDir = path.join(input.outDir, "unpacked")
  if (!(await unzip(localLgp, unpackedDir))) return undefined
  const resultFiles = entries
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(`${input.resultPrefix}.`) && !name.endsWith(".lgp") && !name.endsWith(".~lgp"))
  await mkdir(path.join(input.outDir, "results"), { recursive: true })
  for (const name of resultFiles) await copyOut(input.source, name, path.join(input.outDir, "results", name))
  return {
    origin: chosen.origin,
    ambiguous: chosen.ambiguous,
    packagePath: `/${input.username}/${chosen.name}`,
    localLgp,
    unpackedDir,
    resultFiles,
    cleanupFiles: [chosen.name, ...resultFiles].filter((name) => belongsToAttempt(name, input.resultPrefix)),
  }
}
export type Artifact = NonNullable<Awaited<ReturnType<typeof fetchArtifact>>>

// Резервный поиск не должен выбирать пакет другого запуска или пользователя.
function scan(entries: { name: string; mtimeMs: number }[], since: number, prefix: string) {
  const fresh = entries
    .filter((entry) => entry.name.endsWith(".lgp") && entry.mtimeMs > since && belongsToAttempt(entry.name, prefix))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  const [first, ...rest] = fresh
  if (!first) return undefined
  return { origin: "scan" as const, name: first.name, ambiguous: rest.map((entry) => entry.name) }
}

export async function cleanupArtifact(source: ArtifactSource, artifact: Artifact) {
  if (source.kind === "dir") return
  const targets = artifact.cleanupFiles.map(
    (name) => `${source.storageDir}/${name}`,
  )
  if (!targets.length) return
  const removed = await Bun.$`docker exec ${source.container} rm -f ${targets}`.quiet().nothrow()
  if (removed.exitCode !== 0) throw new Error(`docker exec rm: ${removed.stderr.toString().trim()}`)
}

export async function cleanupOrphanResult(input: { source: ArtifactSource; name: string; outDir: string }) {
  if (path.basename(input.name) !== input.name) throw Error("Unsafe result filename")
  const entries = await listStorage(input.source)
  if (!entries.some(entry => entry.name === input.name)) return
  await mkdir(path.join(input.outDir, "storage-outputs"), { recursive: true })
  await copyOut(input.source, input.name, path.join(input.outDir, "storage-outputs", input.name))
  if (input.source.kind === "dir") return rm(path.join(input.source.dir, input.name))
  const removed = await Bun.$`docker exec ${input.source.container} rm -f -- ${`${input.source.storageDir}/${input.name}`}`.quiet().nothrow()
  if (removed.exitCode !== 0) throw Error(`docker exec rm: ${removed.stderr.toString().trim()}`)
}

function belongsToAttempt(name: string, prefix: string) {
  return !name.includes("/") && (name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}-`))
}
