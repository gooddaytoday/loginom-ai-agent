import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import path from "node:path"
import { EvalFailure } from "./fail"
import { summarizeResourceSamples } from "./parallel-resource-summary"

export async function writeResourceSummary(input: { samplesFile: string; out: string }) {
  await assertResourceDirectory(input.out)
  const receipt = resourceReceipt(input.samplesFile, await readResourceSource(input.samplesFile))
  const output = await open(input.out, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    .catch(() => { throw new EvalFailure("RESOURCE_OUTPUT_PRIVATE", 2) })
  try { await output.writeFile(JSON.stringify(receipt) + "\n"); await output.sync() }
  finally { await output.close() }
  const directory = await open(path.dirname(input.out), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try { await directory.sync() } finally { await directory.close() }
  return receipt
}

export async function readResourceSummary(input: { file: string; samplesFile: string; runId: string | null; phase: "before" | "run" | "after" | null }) {
  await assertResourceDirectory(input.file)
  const { readLeaseReceipt } = await import("./lease")
  const saved = resourceObject(await readLeaseReceipt(input.file).catch(() => { throw new EvalFailure("RESOURCE_RECEIPT_INVALID", 2) }))
  const source = resourceObject(saved.source)
  if (saved.version !== 1 || saved.kind !== "resource-summary" || typeof source.file !== "string" ||
    typeof source.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(source.sha256)) throw new EvalFailure("RESOURCE_RECEIPT_INVALID", 2)
  if (source.file !== input.samplesFile) throw new EvalFailure("RESOURCE_SOURCE_PATH_MISMATCH", 2)
  const bytes = await readResourceSource(input.samplesFile)
  if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== source.sha256) throw new EvalFailure("RESOURCE_SOURCE_HASH_MISMATCH", 2)
  const expected = resourceReceipt(source.file, bytes)
  if (saved.run_id !== input.runId || expected.run_id !== input.runId || saved.phase !== input.phase || expected.phase !== input.phase)
    throw new EvalFailure("RESOURCE_RECEIPT_CONTEXT_MISMATCH", 2)
  if (JSON.stringify(saved.summary) !== JSON.stringify(expected.summary)) throw new EvalFailure("RESOURCE_SUMMARY_MISMATCH", 2)
  return expected
}

async function assertResourceDirectory(file: string) {
  const directory = path.dirname(file)
  const info = await lstat(directory).catch(() => { throw new EvalFailure("RESOURCE_OUTPUT_PRIVATE", 2) })
  if (!path.isAbsolute(file) || file !== path.resolve(file) || !info.isDirectory() || info.uid !== process.getuid?.() ||
    (info.mode & 0o777) !== 0o700 || await realpath(directory) !== directory) throw new EvalFailure("RESOURCE_OUTPUT_PRIVATE", 2)
}

async function readResourceSource(file: string) {
  await assertResourceDirectory(file)
  const source = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    .catch(() => { throw new EvalFailure("RESOURCE_SOURCE_PRIVATE", 2) })
  try {
    const before = await source.stat()
    if (!before.isFile() || before.uid !== process.getuid?.() || before.nlink !== 1 || (before.mode & 0o777) !== 0o600)
      throw new EvalFailure("RESOURCE_SOURCE_PRIVATE", 2)
    const bytes = await source.readFile()
    const after = await lstat(file)
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
      after.uid !== before.uid || after.nlink !== 1 || (after.mode & 0o777) !== 0o600) throw new EvalFailure("RESOURCE_SOURCE_CHANGED", 2)
    return bytes
  } finally { await source.close() }
}

function resourceReceipt(file: string, bytes: Buffer) {
  try {
    if (!bytes.length || bytes.at(-1) !== 10) throw new EvalFailure("RESOURCE_SAMPLES_INVALID", 2)
    const samples = bytes.toString("utf8").trimEnd().split("\n").map(line => JSON.parse(line)) as
      (Parameters<typeof summarizeResourceSamples>[0][number] & { version: number; run_id: string | null; phase: "before" | "run" | "after" | null; interval_ms: number; duration_ms: number })[]
    if (samples.some((sample, index) => !validHostResources(sample.host) || sample.version !== 1 || sample.sequence !== index + 1 ||
      !Number.isFinite(sample.elapsed_ms) || sample.elapsed_ms < 0 || index > 0 && sample.elapsed_ms < samples[index - 1]!.elapsed_ms ||
      !Number.isSafeInteger(sample.missed_intervals) || sample.missed_intervals < 0 ||
      !Number.isSafeInteger(sample.interval_ms) || sample.interval_ms < 1 || !Number.isFinite(sample.duration_ms) || sample.duration_ms < 0 ||
      sample.run_id !== null && typeof sample.run_id !== "string" || ![null, "before", "run", "after"].includes(sample.phase) ||
      sample.run_id !== samples[0]!.run_id || sample.phase !== samples[0]!.phase || sample.interval_ms !== samples[0]!.interval_ms))
      throw new EvalFailure("RESOURCE_SAMPLES_INVALID", 2)
    return { version: 1, kind: "resource-summary", run_id: samples[0]!.run_id, phase: samples[0]!.phase,
      source: { file, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") },
      summary: summarizeResourceSamples(samples) }
  } catch { throw new EvalFailure("RESOURCE_SAMPLES_INVALID", 2) }
}

function validHostResources(value: unknown) {
  const host = resourceObject(value), cpu = resourceObject(host.cpu), memory = resourceObject(host.memory)
  if (host.cpu !== null && (!Array.isArray(cpu.ticks) || cpu.ticks.length < 8 ||
    !cpu.ticks.every(value => Number.isSafeInteger(value) && Number(value) >= 0))) return false
  if (host.memory !== null && !["available_bytes", "total_bytes", "swap_free_bytes", "swap_total_bytes"]
    .every(key => Number.isSafeInteger(memory[key]) && Number(memory[key]) >= 0)) return false
  return Array.isArray(host.filesystems) && host.filesystems.every(value => {
    const file = resourceObject(value), capacity = resourceObject(file.capacity)
    return typeof file.path === "string" && (file.capacity === null || ["available_bytes", "total_bytes", "available_inodes", "total_inodes"]
      .every(key => Number.isSafeInteger(capacity[key]) && Number(capacity[key]) >= 0))
  })
}

function resourceObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
