import path from "node:path"
import { cp, lstat, mkdir, readdir, rm, stat } from "node:fs/promises"
import { evalsRoot } from "./config"
import { EvalFailure } from "./fail"

export function parseArtifactSource(value: string, docker: { container: string; storageDir: string }) {
  if (value === "docker") return { kind: "docker" as const, container: docker.container, storageDir: docker.storageDir }
  if (value.startsWith("dir:")) return { kind: "dir" as const, dir: path.resolve(evalsRoot, value.slice(4)) }
  throw new EvalFailure(`EVAL_ARTIFACT_SOURCE: ожидается docker или dir:<path>, получено "${value}"`, 2)
}
export type ArtifactSource = ReturnType<typeof parseArtifactSource>

export async function checkIsolatedStorage(source: ArtifactSource) {
  if (source.kind !== "docker") throw new EvalFailure("Широкая очистка требует выделенный Docker-контейнер с маркером", 2)
  if (!/^\/workdir\/UserStorage\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(source.storageDir))
    throw new EvalFailure("Неверный корень выделенного Loginom storage", 2)
  const inspected = await Bun.$`docker inspect --format ${"{{json .}}"} ${source.container}`.quiet().nothrow()
  if (inspected.exitCode !== 0) throw new EvalFailure("Выделенный Loginom-контейнер недоступен", 2)
  const container = inspected.json() as { Id?: unknown; State?: { Running?: unknown }; Mounts?: { Type?: unknown }[] }
  if (typeof container.Id !== "string" || !/^[0-9a-f]{64}$/.test(container.Id) || container.State?.Running !== true || !Array.isArray(container.Mounts))
    throw new EvalFailure("Не подтверждено состояние выделенного Loginom-контейнера", 2)
  if (container.Mounts.some((mount) => mount.Type === "bind"))
    throw new EvalFailure("Широкая очистка запрещена: у контейнера есть host bind mounts", 2)
  const read = await Bun.$`docker exec ${container.Id} cat /workdir/.loginom-evals-isolated.json`.quiet().nothrow()
  const marker = read.exitCode === 0 ? await Promise.resolve(read.text()).then((text) => JSON.parse(text)).catch(() => undefined) as
    { kind?: unknown; version?: unknown; container_id?: unknown; storage_dir?: unknown; roots?: unknown } | undefined : undefined
  const roots = ["/workdir/UserStorage", "/workdir/SessionBackup"]
  if (!marker || marker.kind !== "loginom-evals-isolated" || marker.version !== 1 || marker.container_id !== container.Id ||
    marker.storage_dir !== source.storageDir || JSON.stringify(marker.roots) !== JSON.stringify(roots))
    throw new EvalFailure("Широкая очистка запрещена: маркер, container ID или корни не подтверждены", 2)
  const directories = await Bun.$`docker exec ${container.Id} sh -c ${'for root do test -d "$root" && ! test -L "$root" || exit 1; done'} eval-roots ${roots}`.quiet().nothrow()
  if (directories.exitCode !== 0) throw new EvalFailure("Корни выделенного storage отсутствуют или являются symlink", 2)
  return { containerId: container.Id, roots }
}

export async function cleanupIsolatedStorage(source: ArtifactSource) {
  // Validate immediately before deletion; execute by immutable ID, never a reused name.
  const storage = await checkIsolatedStorage(source)
  const script = 'find /workdir/UserStorage -mindepth 2 -maxdepth 2 -exec rm -rf -- {} + && ' +
    'find /workdir/UserStorage -mindepth 1 -maxdepth 1 ! -type d -exec rm -f -- {} + && ' +
    'find /workdir/SessionBackup -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +'
  const removed = await Bun.$`docker exec ${storage.containerId} sh -c ${script}`.quiet().nothrow()
  if (removed.exitCode !== 0) throw new EvalFailure("Очистка выделенного Loginom storage не выполнена", 2)
  await assertIsolatedStorageEmpty(source)
}

export async function assertIsolatedStorageEmpty(source: ArtifactSource) {
  const storage = await checkIsolatedStorage(source)
  const checked = await Bun.$`docker exec ${storage.containerId} sh -c ${
    'find /workdir/UserStorage -mindepth 2 -print -quit && ' +
    'find /workdir/UserStorage -mindepth 1 -maxdepth 1 ! -type d -print -quit && ' +
    'find /workdir/SessionBackup -mindepth 1 -print -quit'
  }`.quiet().nothrow()
  if (checked.exitCode !== 0) throw new EvalFailure("Проверка пустоты выделенного Loginom storage не выполнена", 2)
  if (checked.stdout.length) throw new EvalFailure("В Loginom остались материалы прошлой попытки; admission запрещён", 2)
}

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

export async function storageEntryExists(source: ArtifactSource, name: string) {
  if (path.basename(name) !== name) throw Error("Unsafe result filename")
  if (source.kind === "dir") {
    if (!(await stat(source.dir)).isDirectory()) throw Error("Storage directory unavailable")
    return lstat(path.join(source.dir, name)).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false
      throw error
    })
  }
  // The normal file listing excludes links/directories; it cannot prove absence.
  const found = await Bun.$`docker exec ${source.container} sh -c ${'test -d "$2" && test -r "$2" && test -x "$2" || exit 2; test -e "$1" || test -L "$1"'} eval-entry ${`${source.storageDir}/${name}`} ${source.storageDir}`.quiet().nothrow()
  if (![0, 1].includes(found.exitCode)) throw Error(`Storage entry inspection failed: ${found.stderr.toString().trim()}`)
  return found.exitCode === 0
}

export async function cleanupOrphanResult(input: { source: ArtifactSource; name: string; outDir: string; existingNames: readonly string[] | null; processesConfirmed: boolean }) {
  const evidence: { status: string; name: string; existed_before: boolean | null; removed: boolean;
    verified_absent: boolean; archived?: { path: string; bytes: number; sha256: string }; error?: string } = {
    status: "failed", name: input.name, existed_before: input.existingNames?.includes(input.name) ?? null,
    removed: false, verified_absent: false,
  }
  try {
    if (!input.processesConfirmed) throw Error("Process cleanup unconfirmed; orphan result preserved")
    if (path.basename(input.name) !== input.name) throw Error("Unsafe result filename")
    if (input.existingNames === null) throw Error("Storage ownership baseline unavailable")
    if (evidence.existed_before) throw Error("Result ownership unconfirmed: pre-existing filename")
    if (await storageEntryExists(input.source, input.name)) {
      if (input.source.kind === "dir") {
        const info = await lstat(path.join(input.source.dir, input.name))
        if (!info.isFile()) throw Error("Result is not a regular file")
        if (info.nlink !== 1) throw Error("Result ownership unconfirmed: hardlink")
      } else {
        const regular = await Bun.$`docker exec ${input.source.container} sh -c ${'test -f "$1" && ! test -L "$1" && test "$(stat -c %h -- "$1")" = 1'} eval-orphan ${`${input.source.storageDir}/${input.name}`}`.quiet().nothrow()
        if (regular.exitCode !== 0) throw Error("Result ownership unconfirmed: expected singly linked regular file")
      }
      await mkdir(path.join(input.outDir, "storage-outputs"), { recursive: true })
      const local = path.join(input.outDir, "storage-outputs", input.name)
      await copyOut(input.source, input.name, local)
      const bytes = await Bun.file(local).arrayBuffer()
      evidence.archived = { path: `storage-outputs/${input.name}`, bytes: bytes.byteLength,
        sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") }
      if (input.source.kind === "dir") await rm(path.join(input.source.dir, input.name))
      else {
        const removed = await Bun.$`docker exec ${input.source.container} rm -f -- ${`${input.source.storageDir}/${input.name}`}`.quiet().nothrow()
        if (removed.exitCode !== 0) throw Error(`docker exec rm: ${removed.stderr.toString().trim()}`)
      }
      evidence.removed = true
    }
    if (await storageEntryExists(input.source, input.name)) throw Error("Result storage cleanup unconfirmed")
    evidence.verified_absent = true
    evidence.status = "confirmed"
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    await mkdir(input.outDir, { recursive: true })
    await Bun.write(path.join(input.outDir, "storage-cleanup.json"), JSON.stringify(evidence, null, 2) + "\n")
  }
}

function belongsToAttempt(name: string, prefix: string) {
  return !name.includes("/") && (name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}-`))
}
