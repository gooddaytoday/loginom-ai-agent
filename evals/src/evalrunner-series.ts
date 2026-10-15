import path from "node:path"
import { lstat, readdir, readFile, realpath, mkdir, open, link, unlink } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { loadTasks } from "./task"
import { constants } from "node:fs"

export type EvalrunnerCollection = "regular" | "analytic" | "node"
export type EvalrunnerCorpus = Awaited<ReturnType<typeof loadEvalrunnerCorpus>>
export type EvalrunnerSlot = { id: string; collection: EvalrunnerCollection; case: string; round: number }
export type EvalrunnerSeriesScope = "full" | "readiness-calc" | "readiness-node"
export type EvalrunnerSeriesManifest = ReturnType<typeof createEvalrunnerManifest>
type SeriesRoots = { root: string; results: string }

const policy = { model: "openai/gpt-6.1-sol", variant: "medium", judge: "gpt-6-sol/xhigh", threshold: 70,
  nodeJudge: "code-only", repeat: 1, infraRetries: 0, productTimeoutMs: 1_800_000, judgeTimeoutMs: 300_000, managementTimeoutMs: 600_000 }

export const evalrunnerHash = (text: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(text).digest("hex")

export async function loadEvalrunnerCorpus(evals: string) {
  const root = path.join(evals, "tasks")
  const cases = (await Promise.all((["regular", "analytic", "node"] as const).map(async collection => {
    const directory = collection === "regular" ? root : path.join(root, collection === "node" ? "node-evals" : collection)
    return (await loadTasks(directory)).map(task => ({ collection, id: task.id }))
  }))).flat()
  if (["regular", "analytic", "node"].some((collection, index) => cases.filter(item => item.collection === collection).length !== [3, 35, 10][index]))
    throw new EvalFailure("Expected accepted corpus 3 regular, 35 analytic, 10 node", 2)
  const files = await inventory(root)
  return { cases, files, sha256: evalrunnerHash(JSON.stringify(files)) }
}

export function buildEvalrunnerSlots(corpus: EvalrunnerCorpus): EvalrunnerSlot[] {
  return [1, 2, 3].flatMap(round => corpus.cases.map(item => ({ id: `r${round}-${item.collection}-${item.id}`,
    collection: item.collection, case: item.id, round })))
}

export function createEvalrunnerManifest(input: { issue: string; task: string; series: string; scope: EvalrunnerSeriesScope;
  pins: Record<string, unknown>; corpus: EvalrunnerCorpus; generation?: 1; recovery?: { file: string; sha256: string } }) {
  if (![input.issue, input.task].every(value => /^[\w-]+$/.test(value)) || !["full", "readiness-calc", "readiness-node"].includes(input.scope))
    throw new EvalFailure("Invalid series identity", 2)
  if (input.generation !== undefined && (input.generation !== 1 || input.scope !== "readiness-calc" ||
    input.issue !== "01a13fd2-a6b1-7459-b641-fb41b04eb229" || !input.recovery) || input.recovery && input.generation !== 1)
    throw new EvalFailure("Unauthorized readiness generation", 2)
  const slots = input.scope === "full" ? buildEvalrunnerSlots(input.corpus) : [{
    id: `${input.scope}-r1`, round: 1, collection: input.scope === "readiness-calc" ? "regular" as const : "node" as const,
    case: input.scope === "readiness-calc" ? "calc-data-double" : "crosstable-fixed-sum" }]
  if (input.corpus.cases.length !== 48 || input.scope === "full" && (slots.length !== 144 || new Set(slots.map(slot => slot.id)).size !== 144))
    throw new EvalFailure("Series coverage differs", 2)
  return { kind: "evalrunner-full-series" as const, version: 2 as const, ...input, slots, policy,
    nonce: crypto.randomUUID(), createdAt: new Date().toISOString() }
}

/** Registry and admissions are global to issue/scope, independent of task or output directory. */
export async function reserveEvalrunnerSeries(config: SeriesRoots, manifest: EvalrunnerSeriesManifest) {
  const expected = evalrunnerSeriesPath(config, manifest)
  if (manifest.series !== expected || path.resolve(expected) !== expected || !expected.startsWith(config.root + path.sep))
    throw new EvalFailure("Noncanonical series directory", 2)
  if (manifest.generation) await verifyEvalrunnerRecoveryLink(config, manifest)
  const raw = JSON.stringify(manifest, null, 2)
  await mkdir(path.dirname(registryPath(config, manifest)), { recursive: true, mode: 0o700 })
  await durableEvalrunnerJson(registryPath(config, manifest), { kind: "evalrunner-series-reservation", series: expected, sha256: evalrunnerHash(raw), manifest })
    .catch(() => { throw new EvalFailure("Series already reserved; inspect original evidence", 2) })
  // A crash after global reservation never permits another manifest or location.
  await mkdir(expected, { mode: 0o700 })
  await durableEvalrunnerJson(path.join(expected, "manifest.json"), manifest)
  await mkdir(path.join(expected, "slots"), { mode: 0o700 })
  await mkdir(path.join(expected, "completions"), { mode: 0o700 })
  return manifest
}

export async function readEvalrunnerSeries(config: SeriesRoots, series: string) {
  if (path.resolve(series) !== series || !series.startsWith(config.results + path.sep) || await realpath(series) !== series)
    throw new EvalFailure("Series boundary changed", 2)
  const raw = await readEvalrunnerDocument(path.join(series, "manifest.json"))
  const manifest = JSON.parse(raw) as EvalrunnerSeriesManifest
  if (manifest.kind !== "evalrunner-full-series" || manifest.version !== 2 || manifest.series !== series ||
    !["full", "readiness-calc", "readiness-node"].includes(manifest.scope) || !/^[\w-]+$/.test(manifest.issue))
    throw new EvalFailure("Invalid series manifest", 2)
  if (manifest.series !== evalrunnerSeriesPath(config, manifest)) throw new EvalFailure("Noncanonical series directory", 2)
  if (manifest.generation) await verifyEvalrunnerRecoveryLink(config, manifest)
  const reservation = JSON.parse(await readEvalrunnerDocument(registryPath(config, manifest))) as { series: string; sha256: string }
  if (reservation.series !== series || reservation.sha256 !== evalrunnerHash(raw) || JSON.stringify(manifest.policy) !== JSON.stringify(policy))
    throw new EvalFailure("Manifest changed", 2)
  const expected = createEvalrunnerManifest(manifest).slots
  if (JSON.stringify(expected) !== JSON.stringify(manifest.slots)) throw new EvalFailure("Manifest coverage changed", 2)
  return manifest
}

export async function admitEvalrunnerSlot(config: SeriesRoots, manifest: EvalrunnerSeriesManifest, slot: EvalrunnerSlot, task: string) {
  const saved = await readEvalrunnerSeries(config, manifest.series)
  if (saved.nonce !== manifest.nonce || !/^[\w-]+$/.test(task) || !saved.slots.some(item => JSON.stringify(item) === JSON.stringify(slot)))
    throw new EvalFailure("Slot identity differs", 2)
  const directory = path.join(config.root, "operations/series-admissions", evalrunnerSeriesKey(manifest))
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if (await Bun.file(path.join(directory, `${slot.id}.json`)).exists()) throw new EvalFailure("Slot already admitted; inspect original evidence", 2)
  const { inspectEvalrunnerSeries } = await import("./evalrunner-series-check")
  const progress = await inspectEvalrunnerSeries(config, manifest.series)
  if (progress.status !== "READY" || progress.next?.id !== slot.id) throw new EvalFailure("Earlier slot unresolved or slot order differs", 2)
  const admission = { kind: "evalrunner-slot-admission", version: 2, manifestSha256: evalrunnerHash(JSON.stringify(saved, null, 2)),
    issue: manifest.issue, scope: manifest.scope, slot, task, series: manifest.series, at: new Date().toISOString() }
  await durableEvalrunnerJson(path.join(directory, `${slot.id}.json`), admission)
    .catch(() => { throw new EvalFailure("Slot already admitted; unresolved admission is BLOCKED", 2) })
  const selected = path.join(manifest.series, "slots", slot.id)
  await mkdir(selected, { mode: 0o700 })
  await durableEvalrunnerJson(path.join(selected, "manifest.json"), admission)
  return selected
}

export async function durableEvalrunnerJson(file: string, data: unknown) {
  return durableEvalrunnerBytes(file, JSON.stringify(data, null, 2))
}

/** A complete fsynced inode is linked without replacement before dispatch is possible. */
export async function durableEvalrunnerBytes(file: string, bytes: string | Uint8Array) {
  const parent = path.dirname(file)
  if (await realpath(parent) !== parent) throw new EvalFailure("Persistence parent is not canonical", 2)
  const directory = await open(parent, "r")
  try {
    const parentIdentity = await directory.stat()
    const temporary = path.join(parent, `.evalrunner-atomic-${path.basename(file)}-${crypto.randomUUID()}`)
    const handle = await open(temporary, "wx", 0o600)
    const identity = await handle.stat().catch(async error => { await handle.close(); throw error })
    try {
      try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
      await link(temporary, file)
      await directory.sync()
      const current = await lstat(parent)
      if (current.isSymbolicLink() || current.dev !== parentIdentity.dev || current.ino !== parentIdentity.ino)
        throw new EvalFailure("Persistence parent identity changed", 2)
    } finally {
      const current = await lstat(temporary)
      if (current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino)
        throw new EvalFailure("Persistence journal identity changed; preserve it", 2)
      await unlink(temporary); await directory.sync()
    }
  } finally { await directory.close() }
}

export async function readEvalrunnerDocument(file: string) {
  const before = await lstat(file)
  if (!before.isFile() || before.isSymbolicLink() || before.uid !== process.getuid?.() || before.mode & 0o077 || await realpath(file) !== file)
    throw new EvalFailure("Unsafe controller document", 2)
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = await handle.stat(), raw = await handle.readFile("utf8"), after = await lstat(file)
    if ([opened, after].some(item => !item.isFile() || item.isSymbolicLink() || item.dev !== before.dev || item.ino !== before.ino ||
      item.size !== before.size || item.mtimeMs !== before.mtimeMs || item.ctimeMs !== before.ctimeMs)) throw new EvalFailure("Controller document identity changed", 2)
    return raw
  } finally { await handle.close() }
}

function registryPath(config: SeriesRoots, manifest: Pick<EvalrunnerSeriesManifest, "issue" | "scope" | "generation">) {
  return path.join(config.root, "operations/series-registry", `${evalrunnerSeriesKey(manifest)}.json`)
}

export function evalrunnerSeriesKey(manifest: { issue: string; scope: string; generation?: 1 }) {
  return `${manifest.issue}-${manifest.scope}${manifest.generation ? "-g1" : ""}`
}

export function evalrunnerSeriesPath(config: { results: string }, manifest: { issue: string; scope: string; generation?: 1 }) {
  return path.join(config.results, `v02-${manifest.scope}-${manifest.issue}${manifest.generation ? "-g1" : ""}`)
}

export async function verifyEvalrunnerRecoveryLink(config: { root: string }, manifest: EvalrunnerSeriesManifest) {
  if (manifest.generation !== 1 || manifest.scope !== "readiness-calc" || manifest.issue !== "01a13fd2-a6b1-7459-b641-fb41b04eb229")
    throw new EvalFailure("Unauthorized readiness generation", 2)
  const file = path.join(config.root, "operations/series-recovery", manifest.issue + "-readiness-calc/receipt.json")
  const raw = await readEvalrunnerDocument(file)
  const receipt = JSON.parse(raw)
  if (manifest.recovery?.file !== file || manifest.recovery.sha256 !== evalrunnerHash(raw) ||
    receipt.status !== "RECOVERED_PRE_INFERENCE" || receipt.newSeries !== manifest.series ||
    receipt.newPinsSha256 !== evalrunnerHash(JSON.stringify(manifest.pins)) || receipt.productInferenceCalls !== 0 || receipt.judgeCalls !== 0 ||
    receipt.issue !== manifest.issue || receipt.scope !== manifest.scope || receipt.generation !== 1 || receipt.originalReleased !== false ||
    !Array.isArray(receipt.preserved) || receipt.preserved.length < 5)
    throw new EvalFailure("Recovery link differs", 2)
  const { requestedAt, ...audit } = JSON.parse(await readEvalrunnerDocument(path.join(path.dirname(file), "request.json")))
  if (!requestedAt || JSON.stringify(audit) !== JSON.stringify(receipt.audit)) throw new EvalFailure("Recovery request differs", 2)
  for (const item of receipt.preserved as { file: string; sha256: string }[]) {
    if (!item.file.startsWith(config.root + path.sep) || await realpath(item.file) !== item.file ||
      evalrunnerHash(await readFile(item.file)) !== item.sha256) throw new EvalFailure("Recovered original evidence changed", 2)
  }
  if (!receipt.audit.archive?.startsWith(config.root + path.sep) || await realpath(receipt.audit.archive) !== receipt.audit.archive)
    throw new EvalFailure("Recovered history boundary changed", 2)
  for (const source of receipt.audit.sources as { name: string; sha256: string }[]) {
    if (!["loginom-ai-agent.db", "loginom-ai-agent.db-shm", "loginom-ai-agent.db-wal"].includes(source.name)) throw new EvalFailure("Recovery source differs", 2)
    const file = path.join(receipt.audit.archive, "data", source.name)
    if (await realpath(file) !== file || evalrunnerHash(await readFile(file)) !== source.sha256) throw new EvalFailure("Recovered history changed", 2)
  }
}

async function inventory(root: string, relative = ""): Promise<{ path: string; sha256: string }[]> {
  if (await realpath(root) !== root) throw new EvalFailure("Corpus boundary changed", 2)
  const entries = await readdir(path.join(root, relative), { withFileTypes: true })
  const files = (await Promise.all(entries.map(async entry => {
    const file = path.join(relative, entry.name)
    const info = await lstat(path.join(root, file))
    if (info.isSymbolicLink()) throw new EvalFailure("Corpus symlink refused", 2)
    if (info.isDirectory()) return inventory(root, file)
    if (!info.isFile()) throw new EvalFailure("Corpus entry refused", 2)
    return [{ path: file, sha256: evalrunnerHash(await readFile(path.join(root, file))) }]
  }))).flat()
  return files.sort((a, b) => a.path.localeCompare(b.path, "en"))
}
