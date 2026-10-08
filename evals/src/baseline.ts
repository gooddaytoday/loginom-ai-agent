import path from "node:path"
import { lstat, mkdir, readdir, rename, writeFile } from "node:fs/promises"
import { loadTasks } from "./task"

export type BaselinePins = {
  mode: "live" | "fixture"; harnessSha: string; corpusSha: string; cliVersion: string; cliSource: string
  cliManifestSha256: string; binarySha256: string; model: string; variant: string; judgeModel: string; judgeReasoning: string
  threshold: number; timeoutMs: number; judgeTimeoutMs: number; promptSha256: string; schemaSha256: string
  opsConfigSha256: string; isolationSha256: string; endpoint: string; containerId: string; imageDigest: string; dockRevision: string
}
export type BaselineCollection = "regular" | "analytic" | "node"
type BaselineCase = { key: string; id: string; collection: BaselineCollection; directory: string; files: { path: string; sha256: string }[] }
export type BaselineManifest = { version: 1; id: string; kind: "baseline" | "smoke"; createdAt: string; pins: BaselinePins
  cases: BaselineCase[]; jobs: { key: string; caseKey: string; attempt: number }[] }
type BaselineJournal = { version: 1; manifestSha256: string; jobs: { key: string; state: "pending" | "running" | "recorded"; runDir?: string }[] }

export class BaselineFailure extends Error {}
export const baselineHash = (value: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(value).digest("hex")

export async function prepareBaseline(directory: string, options: { checkout: string; pins: BaselinePins; smoke?: boolean }) {
  validatePins(options.pins)
  const collections = [["regular", "tasks"], ["analytic", "tasks/analytic"], ["node", "tasks/node-evals"]] as const
  const cases: BaselineCase[] = []
  for (const [collection, relative] of collections) {
    for (const task of await loadTasks(path.join(options.checkout, "evals", relative))) {
      if (options.smoke && !["regular:calc-data-double", "node:crosstable-fixed-sum"].includes(`${collection}:${task.id}`)) continue
      cases.push({ key: `${collection}:${task.id}`, id: task.id, collection, directory: `${relative}/${task.id}`,
        files: await snapshotDirectory(task.dir) })
    }
  }
  const manifest: BaselineManifest = { version: 1, id: crypto.randomUUID(), kind: options.smoke ? "smoke" : "baseline",
    createdAt: new Date().toISOString(), pins: options.pins, cases,
    jobs: (options.smoke ? [1] : [1, 2, 3]).flatMap(attempt => cases.map(item => ({ key: `${item.collection}-${item.id}-${attempt}`, caseKey: item.key, attempt }))) }
  await mkdir(directory, { mode: 0o700 }).catch(() => { throw new BaselineFailure("SERIES_EXISTS") })
  const raw = JSON.stringify(manifest, null, 2) + "\n"
  await writeFile(path.join(directory, "manifest.json"), raw, { flag: "wx", mode: 0o600 })
  const journal: BaselineJournal = { version: 1, manifestSha256: baselineHash(raw), jobs: manifest.jobs.map(job => ({ key: job.key, state: "pending" })) }
  await atomicJournal(directory, journal)
  return manifest
}

async function atomicJournal(directory: string, journal: BaselineJournal) {
  const temp = path.join(directory, `journal-${crypto.randomUUID()}.tmp`)
  await writeFile(temp, JSON.stringify(journal, null, 2) + "\n", { flag: "wx", mode: 0o600 })
  await rename(temp, path.join(directory, "journal.json"))
}

async function snapshotDirectory(directory: string, relative = ""): Promise<{ path: string; sha256: string }[]> {
  const files: { path: string; sha256: string }[] = []
  for (const name of (await readdir(path.join(directory, relative))).sort()) {
    const file = path.join(relative, name)
    const info = await lstat(path.join(directory, file))
    if (info.isSymbolicLink()) throw new BaselineFailure("CORPUS_SYMLINK_REFUSED")
    if (info.isDirectory()) files.push(...await snapshotDirectory(directory, file))
    if (info.isFile()) files.push({ path: file, sha256: baselineHash(await Bun.file(path.join(directory, file)).bytes()) })
  }
  return files
}

function validatePins(pins: BaselinePins) {
  if (!["live", "fixture"].includes(pins.mode) || ![pins.harnessSha, pins.corpusSha, pins.cliSource].every(value => /^[0-9a-f]{40}$/.test(value)) ||
    ![pins.cliManifestSha256, pins.binarySha256, pins.promptSha256, pins.schemaSha256, pins.opsConfigSha256, pins.isolationSha256].every(value => /^[0-9a-f]{64}$/.test(value)) ||
    pins.model !== "openai/gpt-6.1-sol" || pins.variant !== "medium" || pins.judgeModel !== "gpt-6-astra" || pins.judgeReasoning !== "high" ||
    pins.cliVersion !== "0.1.17" || pins.cliSource !== "fc3d97dbf695c2ed8dba942feb6fe83591a33944" || pins.threshold !== 70 ||
    pins.timeoutMs !== 1_800_000 || pins.judgeTimeoutMs !== 300_000) throw new BaselineFailure("INVALID_PINS")
}
