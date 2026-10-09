import path from "node:path"
import { constants } from "node:fs"
import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises"
import { BaselineFailure, baselineHash, checkBaseline, type BaselineReference } from "./baseline"

type AcceptedBaseline = BaselineReference & { archive: string }
type BaselineRegistry = { version: 1; current: string; accepted: AcceptedBaseline[] }

/** Operator-only promotion. A completed quality FAIL is eligible; incomplete delivery is not. */
export async function acceptBaseline(file: string, seriesDir: string, input: {
  issue: string; decision: string; expectedCurrent: string | null; archive: string; archiveSha256: string
}) {
  const report = await checkBaseline(seriesDir)
  if (report.kind !== "baseline" || report.status !== "complete" || report.coverage.expected !== 144 || report.manifest.cases.length !== 48)
    throw new BaselineFailure("BASELINE_NOT_COMPLETE")
  if (!input.issue.trim() || !input.decision.trim() || !/^[0-9a-f]{64}$/.test(input.archiveSha256)) throw new BaselineFailure("BASELINE_ACCEPTANCE_REQUIRED")
  const manifestSha256 = baselineHash(await Bun.file(path.join(seriesDir, "manifest.json")).bytes())
  await verifyArchive(input.archive, input.archiveSha256, { id: report.id, manifestSha256 })
  if (!path.isAbsolute(file) || await realpath(seriesDir) !== seriesDir) throw new BaselineFailure("REGISTRY_PATH_REFUSED")
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await privateDirectory(path.dirname(file))
  const guard = file + ".lock"
  await mkdir(guard, { mode: 0o700 }).catch(() => { throw new BaselineFailure("REGISTRY_BUSY") })
  const identity = await lstat(guard)
  try {
    const previous = await readRegistry(file, true)
    if ((previous?.current ?? null) !== input.expectedCurrent) throw new BaselineFailure("BASELINE_POINTER_CHANGED")
    if (previous?.accepted.some(entry => entry.id === report.id)) throw new BaselineFailure("BASELINE_ALREADY_ACCEPTED")
    const entry: AcceptedBaseline = { id: report.id, seriesDir, manifestSha256,
      archive: input.archive, archiveSha256: input.archiveSha256, issue: input.issue, decision: input.decision, acceptedAt: new Date().toISOString() }
    const registry: BaselineRegistry = { version: 1, current: entry.id, accepted: [...previous?.accepted ?? [], entry] }
    const temporary = file + "." + crypto.randomUUID() + ".tmp"
    const handle = await open(temporary, "wx", 0o600)
    try { await handle.writeFile(JSON.stringify(registry, null, 2) + "\n"); await handle.sync() } finally { await handle.close() }
    await rename(temporary, file)
    const parent = await open(path.dirname(file), constants.O_RDONLY | constants.O_DIRECTORY)
    try { await parent.sync() } finally { await parent.close() }
    return reference(entry)
  } finally {
    const current = await lstat(guard)
    if (current.dev === identity.dev && current.ino === identity.ino && !current.isSymbolicLink()) await rm(guard, { recursive: true })
  }
}

export async function acceptedBaseline(file: string) {
  const registry = await readRegistry(file)
  const entry = registry!.accepted.find(entry => entry.id === registry!.current)!
  await verifyBaselineReference(entry)
  await verifyArchive(entry.archive, entry.archiveSha256, entry)
  return reference(entry)
}

export async function verifyBaselineReference(value: BaselineReference) {
  if (!value || !path.isAbsolute(value.seriesDir) || await realpath(value.seriesDir) !== value.seriesDir ||
    baselineHash(await Bun.file(path.join(value.seriesDir, "manifest.json")).bytes()) !== value.manifestSha256)
    throw new BaselineFailure("ACCEPTED_BASELINE_CHANGED")
  const report = await checkBaseline(value.seriesDir)
  if (report.id !== value.id || report.status !== "complete" || report.kind !== "baseline" || report.coverage.expected !== 144 ||
    report.manifest.cases.length !== 48 || !value.issue || !value.decision || !Number.isFinite(Date.parse(value.acceptedAt)) ||
    !/^[0-9a-f]{64}$/.test(value.archiveSha256)) throw new BaselineFailure("ACCEPTED_BASELINE_CHANGED")
  return report
}

async function readRegistry(file: string, optional = false) {
  const info = await lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT" && optional) return undefined; throw error })
  if (!info) return undefined
  if (!path.isAbsolute(file) || !info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.mode & 0o077 || await realpath(file) !== file)
    throw new BaselineFailure("REGISTRY_PATH_REFUSED")
  const value = await Bun.file(file).json() as BaselineRegistry
  if (value.version !== 1 || !Array.isArray(value.accepted) || !value.accepted.length || !value.accepted.some(entry => entry.id === value.current) ||
    new Set(value.accepted.map(entry => entry.id)).size !== value.accepted.length) throw new BaselineFailure("REGISTRY_INVALID")
  return value
}

async function verifyArchive(file: string, sha256: string, expected: { id: string; manifestSha256: string }) {
  if (!path.isAbsolute(file) || await realpath(file) !== file || baselineHash(await Bun.file(file).bytes()) !== sha256)
    throw new BaselineFailure("BASELINE_DELIVERY_CHANGED")
  const checked = await Bun.$`python3 ${path.join(import.meta.dir, "../script/baseline-archive.py")} verify ${file} ${sha256}`.quiet().nothrow()
  if (checked.exitCode !== 0) throw new BaselineFailure("BASELINE_DELIVERY_INVALID")
  const proof = checked.json() as { verified: boolean; baselineId: string; manifestSha256: string }
  if (!proof.verified || proof.baselineId !== expected.id || proof.manifestSha256 !== expected.manifestSha256)
    throw new BaselineFailure("BASELINE_DELIVERY_CHANGED")
}

async function privateDirectory(file: string) {
  const info = await lstat(file)
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.mode & 0o077 || await realpath(file) !== file)
    throw new BaselineFailure("REGISTRY_PATH_REFUSED")
}

function reference(entry: AcceptedBaseline): BaselineReference {
  return { id: entry.id, seriesDir: entry.seriesDir, manifestSha256: entry.manifestSha256, archiveSha256: entry.archiveSha256,
    issue: entry.issue, decision: entry.decision, acceptedAt: entry.acceptedAt }
}
