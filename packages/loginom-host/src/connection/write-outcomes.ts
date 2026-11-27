import { randomUUID } from "node:crypto"
import { constants, type Stats } from "node:fs"
import { lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { Schema } from "effect"

export const WriteOutcomeInput = Schema.Struct({ sessionID: Schema.NonEmptyString, writeID: Schema.optional(Schema.String) })
export const WriteVerdict = Schema.Literals(["applied", "not_applied", "unknown"])
export const SavedCopyReadback = Schema.Literals(["unchanged", "changed", "observed", "unavailable"])
export const WriteOutcomeResult = Schema.Struct({
  status: WriteVerdict,
  writeID: Schema.optional(Schema.String),
  readback: Schema.optional(SavedCopyReadback),
})
const identity = Schema.NonEmptyString
const path = Schema.String.check(Schema.isPattern(/^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/i))
const digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const id = Schema.String.check(Schema.isPattern(/^[a-f0-9-]{36}$/))
const receipt = Schema.Struct({ owner: id, operationID: Schema.NullOr(identity), fresh: Schema.Boolean })
const baseline = Schema.Struct({
  document: Schema.NullOr(identity), workflow: Schema.NullOr(identity),
  packagePath: Schema.NullOr(path), savedDigest: Schema.NullOr(digest), draft: Schema.Boolean,
})
const Write = Schema.Struct({
  effect: Schema.Literals(["save", "node", "package", "other"]),
  operation: identity,
  paths: Schema.Array(path),
  receipt,
  baseline,
})
export const WriteIntent = Schema.Union([Schema.Struct({ effect: Schema.Literal("read") }), Write])
const Record = Schema.Struct({
  ...Write.fields,
  id, chat: digest, turn: identity, call: identity,
  generation: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
  server: digest,
  status: WriteVerdict,
  createdAt: Schema.Number,
})
export type WriteRecord = typeof Record.Type

export async function writeOutcomes(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const privateFile = (info: Stats) =>
    (!process.getuid || info.uid === process.getuid()) && (process.platform === "win32" || (info.mode & 0o077) === 0)
  const info = await lstat(directory)
  if (!info.isDirectory() || !privateFile(info)) throw Error("LOGINOM_WRITE_JOURNAL_INVALID")
  const entries = new Map<string, WriteRecord>()
  const active = new Set<string>()
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".json")) continue
    const handle = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const info = await handle.stat()
      if (!info.isFile() || !privateFile(info)) throw Error("LOGINOM_WRITE_JOURNAL_INVALID")
      const entry = Schema.decodeUnknownSync(Record)(JSON.parse(await handle.readFile("utf8")))
      if (name !== `${entry.id}.json`) throw Error("LOGINOM_WRITE_JOURNAL_INVALID")
      entries.set(entry.id, entry)
    } finally {
      await handle.close()
    }
  }
  async function sync() {
    if (process.platform === "win32") return
    const handle = await open(directory, constants.O_RDONLY)
    try { await handle.sync() } finally { await handle.close() }
  }
  async function put(entry: WriteRecord) {
    const temporary = join(directory, `${entry.id}-${randomUUID()}.tmp`)
    const handle = await open(temporary, "wx", 0o600)
    try {
      await handle.writeFile(JSON.stringify(entry))
      await handle.sync()
    } finally { await handle.close() }
    await rename(temporary, join(directory, `${entry.id}.json`))
    await sync()
    entries.set(entry.id, entry)
  }
  return {
    async begin(input: Omit<WriteRecord, "id" | "status" | "createdAt">) {
      const paths = input.paths.map((value) => value.normalize("NFC").toLowerCase())
      if ([...entries.values()].some((entry) => entry.server === input.server &&
        (active.has(entry.id) || entry.status === "unknown") &&
        (entry.paths.some((value) => paths.includes(value.normalize("NFC").toLowerCase())) ||
          (!paths.length && !input.baseline.draft) || (!entry.paths.length && !entry.baseline.draft) ||
          (entry.chat === input.chat && (entry.baseline.draft || input.baseline.draft)))))
        throw Error("LOGINOM_WRITE_OUTCOME_UNKNOWN")
      const entry = { ...input, id: randomUUID(), status: "not_applied", createdAt: Date.now() } satisfies WriteRecord
      active.add(entry.id)
      entries.set(entry.id, entry)
      try { await put(entry) } catch (error) { active.delete(entry.id); throw error }
      return entry
    },
    pending: (chat: string) => [...entries.values()].filter((entry) => entry.chat === chat && entry.status === "unknown"),
    hasPending: (server: string) => [...entries.values()].some((entry) => entry.server === server && (active.has(entry.id) || entry.status === "unknown")),
    find(chat: string, writeID?: string) {
      if (writeID !== undefined) {
        const entry = entries.get(writeID)
        return entry?.chat === chat ? entry : undefined
      }
      const recent = [...entries.values()].filter((entry) => entry.chat === chat).sort((left, right) => right.createdAt - left.createdAt)
      return recent.find((entry) => entry.status === "unknown" || active.has(entry.id)) ?? recent[0]
    },
    active: (entry: WriteRecord) => active.has(entry.id),
    reserveCheck(entry: WriteRecord) {
      if (active.has(entry.id)) return false
      active.add(entry.id)
      return true
    },
    dispatch: (entry: WriteRecord) => put({ ...entry, status: "unknown" }),
    release: (entry: WriteRecord) => { active.delete(entry.id) },
    async finish(entry: WriteRecord, verdict: "applied" | "not_applied" | "complete") {
      if (verdict !== "complete") return put({ ...entry, status: verdict })
      await rm(join(directory, `${entry.id}.json`), { force: true })
      await sync()
      entries.delete(entry.id)
    },
  }
}
