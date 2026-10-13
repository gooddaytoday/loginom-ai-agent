export type ServerSession = {
  remoteKey: string
  userKey: string
  username: string
  serverEpoch: string
  pendingDisconnect: boolean
  activeOperations: number | null
}

export function selectOwnedSessions(observed: ServerSession[], owned: ServerSession[]): ServerSession[] {
  if ([observed, owned].some(rows => new Set(rows.map(row => row.remoteKey)).size !== rows.length))
    throw new EvalFailure("SESSION_IDENTITY_AMBIGUOUS", 2)
  return observed.filter(row => {
    const session = owned.find(session => session.remoteKey === row.remoteKey)
    if (!session) return false
    if (row.serverEpoch !== session.serverEpoch) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
    if (row.userKey !== session.userKey || row.username !== session.username) throw new EvalFailure("SESSION_IDENTITY_CHANGED", 2)
    return true
  })
}
import { EvalFailure } from "./fail"
import type { ServerIdentity } from "./slots"
import path from "node:path"
import { constants } from "node:fs"
import { lstat, open, readdir, realpath } from "node:fs/promises"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"

export type AdminOperation = "init" | "inspect" | "reconcile-user" | "close-session" | "dispose"
export type AdminRequest = { v: 1; id: string; op: AdminOperation; expectedIdentity: ServerIdentity; deadline: number; payload: unknown }
export type AdminReply = { v: 1; id: string; outcome: "confirmed" | "not_applied" | "unknown"; data: unknown }
const frameLimit = 1024 * 1024

export function createJournaledAdminChannel(input: ReadableStream<Uint8Array>, output: WritableStream<Uint8Array>, journalDir: string) {
  const channel = createAdminChannel(input, output)
  let sequence = Promise.resolve()
  let unresolved = false
  let reconciled = false
  return {
    request(input: unknown) {
      const result = sequence.then(async () => {
        const request = requireAdminRequest(input)
        if (unresolved && request.op !== "inspect" && request.op !== "dispose")
          return { v: 1 as const, id: request.id, outcome: "not_applied" as const, data: { code: "ADMIN_RECONCILIATION_REQUIRED" } }
        const info = await lstat(journalDir).catch(() => { throw new EvalFailure("ADMIN_JOURNAL_PRIVATE", 2) })
        if (!path.isAbsolute(journalDir) || await realpath(journalDir) !== journalDir || !info.isDirectory() || info.isSymbolicLink() ||
          info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700) throw new EvalFailure("ADMIN_JOURNAL_PRIVATE", 2)
        if (!reconciled) {
          unresolved = (await Promise.all((await readdir(journalDir)).map(async name => {
            if (!/^[a-zA-Z0-9_-]{1,128}\.json$/.test(name)) return true
            const row = await readLeaseReceipt(path.join(journalDir, name)).catch(() => { throw new EvalFailure("ADMIN_JOURNAL_INVALID", 2) })
            if (!jsonObject(row) || row.version !== 1 || row.kind !== "loginom-admin-command" || `${row.id}.json` !== name ||
              !["intent", "confirmed", "not_applied", "unknown"].includes(String(row.state))) throw new EvalFailure("ADMIN_JOURNAL_INVALID", 2)
            return row.state === "intent" || row.state === "unknown" || JSON.stringify(row.expectedIdentity) !== JSON.stringify(request.expectedIdentity)
          }))).some(Boolean)
          reconciled = true
        }
        if (unresolved && request.op !== "inspect" && request.op !== "dispose")
          return { v: 1 as const, id: request.id, outcome: "not_applied" as const, data: { code: "ADMIN_RECONCILIATION_REQUIRED" } }
        const file = path.join(journalDir, `${request.id}.json`)
        const journal = { version: 1, kind: "loginom-admin-command", id: request.id, op: request.op, expectedIdentity: request.expectedIdentity,
          desiredHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(request.payload)).digest("hex"), state: "intent", at: new Date().toISOString() }
        const handle = await open(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
          .catch((error: NodeJS.ErrnoException) => { throw new EvalFailure(error.code === "EEXIST" ? "ADMIN_COMMAND_REUSED" : "ADMIN_JOURNAL_UNAVAILABLE", 2) })
        try { await handle.writeFile(JSON.stringify(journal)); await handle.sync() }
        finally { await handle.close() }
        const directory = await open(journalDir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
        try { await directory.sync() } finally { await directory.close() }
        const reply = await channel.request(request)
        unresolved ||= reply.outcome === "unknown"
        const settled = await (async () => {
          const current = await lstat(journalDir)
          if (current.dev !== info.dev || current.ino !== info.ino || current.isSymbolicLink() || current.uid !== info.uid ||
            (current.mode & 0o777) !== 0o700 || await realpath(journalDir) !== journalDir ||
            JSON.stringify(await readLeaseReceipt(file)) !== JSON.stringify(journal)) throw new EvalFailure("ADMIN_JOURNAL_UNAVAILABLE", 2)
          await writeLeaseReceipt(file, { ...journal, state: reply.outcome,
            replyHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(reply)).digest("hex"), settledAt: new Date().toISOString() })
        })().then(() => true, () => false)
        if (!settled) {
          unresolved = true
          return { v: 1 as const, id: request.id, outcome: "unknown" as const, data: { code: "ADMIN_JOURNAL_UNAVAILABLE" } }
        }
        return reply
      })
      sequence = result.then(() => undefined, () => undefined)
      return result
    },
    close: channel.close,
  }
}

export function createAdminChannel(input: ReadableStream<Uint8Array>, output: WritableStream<Uint8Array>) {
  const reader = input.getReader()
  const writer = output.getWriter()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  const encoder = new TextEncoder()
  let buffer = ""
  let bufferBytes = 0
  let failed = false
  let sequence = Promise.resolve()
  return {
    request(input: unknown) {
      const result = sequence.then(async (): Promise<AdminReply> => {
        const value = requireAdminRequest(input)
        const encoded = encoder.encode(JSON.stringify(value) + "\n")
        if (encoded.byteLength > frameLimit) throw new EvalFailure("ADMIN_REQUEST_INVALID", 2)
        if (failed) return { v: 1, id: value.id, outcome: "unknown", data: { code: "ADMIN_RECONCILIATION_REQUIRED" } }
        if (value.deadline <= Date.now()) return { v: 1, id: value.id, outcome: "not_applied", data: { code: "ADMIN_DEADLINE" } }
        const deadline = Promise.withResolvers<never>()
        const timer = setTimeout(() => deadline.reject(new EvalFailure("ADMIN_DEADLINE", 2)), value.deadline - Date.now())
        try {
          const reply = await Promise.race([(async () => {
            await writer.write(encoded)
            while (!buffer.includes("\n")) {
              const chunk = await reader.read()
              if (chunk.done) throw new EvalFailure("ADMIN_EOF", 2)
              bufferBytes += chunk.value.byteLength
              if (bufferBytes > frameLimit) throw new EvalFailure("ADMIN_FRAME_TOO_LARGE", 2)
              buffer += decoder.decode(chunk.value, { stream: true })
            }
            const end = buffer.indexOf("\n")
            const frame = buffer.slice(0, end)
            buffer = buffer.slice(end + 1)
            bufferBytes -= encoder.encode(frame + "\n").byteLength
            return JSON.parse(frame) as unknown
          })(), deadline.promise])
          if (!jsonObject(reply) || Object.keys(reply).length !== 4 || reply.v !== 1 || reply.id !== value.id || typeof reply.outcome !== "string" ||
            !["confirmed", "not_applied", "unknown"].includes(reply.outcome) || !Object.hasOwn(reply, "data"))
            throw new EvalFailure("ADMIN_PROTOCOL", 2)
          return reply as AdminReply
        } catch (error) {
          failed = true
          return { v: 1, id: value.id, outcome: "unknown", data: { code: error instanceof EvalFailure &&
            ["ADMIN_EOF", "ADMIN_DEADLINE", "ADMIN_FRAME_TOO_LARGE"].includes(error.message) ? error.message : "ADMIN_PROTOCOL" } }
        } finally { clearTimeout(timer) }
      })
      sequence = result.then(() => undefined, () => undefined)
      return result
    },
    async close() { await writer.close(); await reader.cancel() },
  }
}

function requireAdminRequest(value: unknown): AdminRequest {
  if (!jsonObject(value) || Object.keys(value).length !== 6 || value.v !== 1 || typeof value.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.id) ||
    typeof value.op !== "string" || !["init", "inspect", "reconcile-user", "close-session", "dispose"].includes(value.op) ||
    typeof value.deadline !== "number" || !Number.isSafeInteger(value.deadline) || !Object.hasOwn(value, "payload") ||
    !jsonObject(value.expectedIdentity) || Object.keys(value.expectedIdentity).length !== 6)
    throw new EvalFailure("ADMIN_REQUEST_INVALID", 2)
  const identity = value.expectedIdentity
  if (["containerId", "serverEpoch", "studioContainerId", "configurationHash"].some(key => typeof identity[key] !== "string" || !/^[a-f0-9]{64}$/.test(identity[key])) ||
    ["startedAt", "studioStartedAt"].some(key => typeof identity[key] !== "string" || !Number.isFinite(Date.parse(identity[key]))))
    throw new EvalFailure("ADMIN_REQUEST_INVALID", 2)
  return value as AdminRequest
}

function jsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
