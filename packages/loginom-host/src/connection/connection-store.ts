import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { link, lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { Option, Schema } from "effect"
import { credentials, type CredentialCodec } from "./credentials"

const RecordSchema = Schema.Struct({
  generation: Schema.Number,
  revision: Schema.Number,
  url: Schema.String,
  urlSource: Schema.optional(Schema.Literal("explicit")),
  username: Schema.String,
  secrets: Schema.Union([
    Schema.Struct({ apiKey: Schema.String, password: Schema.String }),
    Schema.Struct({ encrypted: Schema.String }),
    Schema.Struct({
      format: Schema.Literal("loginom-cli-secrets-v1"),
      protection: Schema.Literals(["plaintext", "dpapi", "keychain"]),
      payload: Schema.String,
    }),
  ]),
})
export type ConnectionRecord = typeof RecordSchema.Type
export type ActiveConnection = Omit<ConnectionRecord, "secrets"> & { apiKey: string; password: string }
const decode = Schema.decodeUnknownOption(Schema.fromJsonString(RecordSchema))
const decodeMigration = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ state: Schema.Literals(["resetting", "complete"]) })),
)

// Only the owning host accesses this directory; it is outside renderer stores.
export function connectionStore(directory: string, codec: CredentialCodec = credentials(process.platform)) {
  let initialized: Promise<void> | undefined
  async function protectDirectory() {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await mkdir(join(directory, "generations"), { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error
    })
    for (const path of [directory, join(directory, "generations")]) {
      const info = await lstat(path)
      if (!info.isDirectory() || info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid())) {
        throw new Error("LOGINOM_STORE_OWNER_INVALID")
      }
      if (process.platform !== "win32" && (info.mode & 0o077) !== 0)
        throw new Error("LOGINOM_STORE_PERMISSIONS_INVALID")
    }
  }
  async function write(file: string, record: ConnectionRecord | { state: "resetting" | "complete" }, replace: boolean) {
    await protectDirectory()
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      const handle = await open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      )
      try {
        await handle.writeFile(JSON.stringify(record))
        await handle.sync()
      } finally {
        await handle.close()
      }
      if (replace) await rename(temporary, file)
      if (!replace)
        await link(temporary, file).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "EEXIST") throw new Error("LOGINOM_GENERATION_EXISTS")
          throw error
        })
      // The directory entry must survive a power loss after the pointer commit.
      if (process.platform !== "win32") {
        const parent = await open(dirname(file), constants.O_RDONLY)
        try {
          await parent.sync()
        } finally {
          await parent.close()
        }
      }
    } finally {
      await rm(temporary, { force: true })
    }
  }
  async function readText(file: string) {
    await protectDirectory()
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw new Error("LOGINOM_STORE_READ_FAILED")
    })
    if (!handle) return
    try {
      const info = await handle.stat()
      if (
        !info.isFile() ||
        (process.getuid && info.uid !== process.getuid()) ||
        (process.platform !== "win32" && (info.mode & 0o077) !== 0)
      )
        throw new Error("LOGINOM_STORE_PERMISSIONS_INVALID")
      return await handle.readFile("utf8")
    } finally {
      await handle.close()
    }
  }
  async function read(file: string) {
    const value = await readText(file)
    if (value === undefined) return
    const result = decode(value)
    if (
      Option.isNone(result) ||
      !Number.isSafeInteger(result.value.generation) ||
      result.value.generation < 1 ||
      !Number.isSafeInteger(result.value.revision) ||
      result.value.revision < 1
    )
      throw new Error("LOGINOM_STORE_INVALID")
    return result.value
  }
  function initialize() {
    return initialized ??= migrate()
  }
  async function migrate() {
    const marker = join(directory, "v040-migration.json")
    const text = await readText(marker)
    const migration = text === undefined ? undefined : decodeMigration(text)
    if (migration && Option.isNone(migration)) throw new Error("LOGINOM_STORE_INVALID")
    if (migration && Option.isSome(migration) && migration.value.state === "complete") return
    const active = join(directory, "connection.json")
    const pending = join(directory, "pending.json")
    function foreign(record: ConnectionRecord | undefined) {
      if (!record) return false
      if (!URL.canParse(record.url)) throw new Error("LOGINOM_STORE_INVALID")
      return new URL(record.url).hostname !== "app.loginom.ai"
    }
    if (migration || foreign(await read(active)) || foreign(await read(pending))) {
      // Persist the intent first: an interrupted reset must finish removing
      // old secrets, even if its active pointer has already been removed.
      await write(marker, { state: "resetting" }, true)
      const generations = join(directory, "generations")
      const files = [
        active,
        pending,
        ...(await readdir(generations))
          .filter((name) => /^\d+\.json$/.test(name))
          .map((name) => join(generations, name)),
      ]
      for (const file of files) {
        if (foreign(await read(file))) await rm(file)
      }
      if (process.platform !== "win32") {
        const handle = await open(generations, constants.O_RDONLY)
        try {
          await handle.sync()
        } finally {
          await handle.close()
        }
      }
    }
    // New and already-public profiles are marked too, so subsequent user
    // choices are never mistaken for settings from a pre-0.4.0 version.
    await write(marker, { state: "complete" }, true)
  }
  function generationPath(generation: number) {
    if (!Number.isSafeInteger(generation) || generation < 1) throw new Error("LOGINOM_GENERATION_INVALID")
    return join(directory, "generations", `${generation}.json`)
  }
  async function decodeRecord(record: ConnectionRecord): Promise<ActiveConnection> {
    return {
      generation: record.generation,
      revision: record.revision,
      url: record.url,
      ...(record.urlSource ? { urlSource: record.urlSource } : {}),
      username: record.username,
      ...(await codec.decode(record.secrets)),
    }
  }
  return {
    initialize,
    async pending(): Promise<ActiveConnection | undefined> {
      const record = await read(join(directory, "pending.json"))
      return record && decodeRecord(record)
    },
    async savePending(value: ActiveConnection) {
      await initialize()
      await write(
        join(directory, "pending.json"),
        {
          generation: value.generation,
          revision: value.revision,
          url: value.url,
          ...(value.urlSource ? { urlSource: value.urlSource } : {}),
          username: value.username,
          secrets: await codec.encode(value),
        },
        true,
      )
    },
    async clearPending() {
      await protectDirectory()
      await rm(join(directory, "pending.json"), { force: true })
      if (process.platform === "win32") return
      const handle = await open(directory, constants.O_RDONLY)
      try {
        await handle.sync()
      } finally {
        await handle.close()
      }
    },
    async staged(generation: number) {
      const record = await read(generationPath(generation))
      return record && decodeRecord(record)
    },
    async latestGeneration() {
      await protectDirectory()
      const names = await readdir(join(directory, "generations"))
      return names.reduce(
        (highest, name) =>
          /^\d+\.json$/.test(name) && Number.isSafeInteger(Number(name.slice(0, -5)))
            ? Math.max(highest, Number(name.slice(0, -5)))
            : highest,
        0,
      )
    },
    async read(): Promise<ActiveConnection | undefined> {
      const record = await read(join(directory, "connection.json"))
      if (!record) return
      return decodeRecord(record)
    },
    async stage(value: ActiveConnection) {
      await initialize()
      const record = {
        generation: value.generation,
        revision: value.revision,
        url: value.url,
        ...(value.urlSource ? { urlSource: value.urlSource } : {}),
        username: value.username,
        secrets: await codec.encode(value),
      }
      await write(generationPath(value.generation), record, false)
    },
    async activate(generation: number) {
      await initialize()
      const record = await read(generationPath(generation))
      if (!record || record.generation !== generation) throw new Error("LOGINOM_GENERATION_MISSING")
      await write(join(directory, "connection.json"), record, true)
    },
  }
}
