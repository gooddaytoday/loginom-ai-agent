import path from "node:path"
import { lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { evalrunnerHash } from "./evalrunner-series"

/** Never open the source SQLite: copy all closed DB sidecars, then inspect the copy. */
export async function verifyEvalrunnerModel(config: { root: string; profile: string }, input: { sessionId: string; cleanupFile: string }) {
  const cleanup = await Bun.file(input.cleanupFile).json() as { stages?: { stage: string; status: string; path?: string }[] }
  const archive = cleanup.stages?.find(item => item.stage === "profile_history" && item.status === "confirmed")?.path
  if (!input.sessionId || !archive || !archive.startsWith(config.profile + ".history/") || await realpath(archive) !== archive)
    throw new EvalFailure("Closed exact Session history required", 2)
  const source = path.join(archive, "data/loginom-ai-agent.db")
  const hashes = async () => {
    const files = []
    for (const file of [source, source + "-wal", source + "-shm"]) {
      const info = await lstat(file).catch(error => { if (error.code === "ENOENT" && file !== source) return undefined; throw error })
      if (!info) continue
      if (!info.isFile() || info.isSymbolicLink() || await realpath(file) !== file) throw new EvalFailure("Unsafe history source", 2)
      files.push({ file: path.basename(file), sha256: evalrunnerHash(await readFile(file)) })
    }
    return files
  }
  const before = await hashes()
  const privateRoot = path.join(config.root, "roles/evalrunner/work/model-verification")
  await mkdir(privateRoot, { recursive: true, mode: 0o700 })
  const copy = await mkdtemp(path.join(privateRoot, "session-"))
  for (const file of before) {
    const bytes = await readFile(path.join(path.dirname(source), file.file))
    if (evalrunnerHash(bytes) !== file.sha256) throw new EvalFailure("History changed while copying", 2)
    await writeFile(path.join(copy, file.file), bytes, { flag: "wx", mode: 0o600 })
  }
  const { Database } = await import("bun:sqlite")
  const db = new Database(path.join(copy, path.basename(source)), { readonly: true })
  const messages = (() => {
    try {
      return (db.query("SELECT id,data FROM message WHERE session_id=? ORDER BY id").all(input.sessionId) as { id: string; data: string }[])
        .map(item => ({ id: item.id, ...JSON.parse(item.data) as { role?: string; providerID?: string; modelID?: string; variant?: string } }))
        .filter(item => item.role === "assistant")
        .map(item => ({ message: item.id, providerID: item.providerID, modelID: item.modelID, variant: item.variant }))
    } finally { db.close() }
  })()
  const after = await hashes()
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new EvalFailure("History source changed", 2)
  if (!messages.length || messages.some(item => item.providerID !== "openai" || item.modelID !== "gpt-6.1-sol" || item.variant !== "medium"))
    throw new EvalFailure("Actual product model differs or has no assistant records", 2)
  return { kind: "evalrunner-actual-model-proof", status: "VERIFIED" as const, sessionId: input.sessionId,
    assistantMessages: messages.length, messages, archive, sourceHashesBefore: before, sourceHashesAfter: after,
    at: new Date().toISOString() }
}
