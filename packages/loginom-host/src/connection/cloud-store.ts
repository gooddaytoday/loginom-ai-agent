import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { lstat, mkdir, open, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { Option, Schema } from "effect"
import type { CredentialCodec } from "./credentials"

const CloudSchema = Schema.Struct({
  kind: Schema.Literal("loginom-cloud-v1"),
  installationKey: Schema.String.check(Schema.isNonEmpty()),
  email: Schema.String.check(Schema.isNonEmpty()),
  dock: Schema.Struct({
    primary: Schema.Struct({ apiKey: Schema.String.check(Schema.isNonEmpty()) }),
    reserve: Schema.Struct({ apiKey: Schema.String.check(Schema.isNonEmpty()) }),
  }),
})
export type CloudCredentials = typeof CloudSchema.Type
const decode = Schema.decodeUnknownOption(CloudSchema)

export function cloudStore(directory: string, codec: CredentialCodec) {
  const file = join(directory, "cloud.json")
  async function protectDirectory() {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid()))
      throw Error("LOGINOM_STORE_OWNER_INVALID")
    if (process.platform !== "win32" && (info.mode & 0o077) !== 0) throw Error("LOGINOM_STORE_PERMISSIONS_INVALID")
  }
  async function syncDirectory() {
    if (process.platform === "win32") return
    const parent = await open(directory, constants.O_RDONLY)
    try {
      await parent.sync()
    } finally {
      await parent.close()
    }
  }
  async function read(file: string): Promise<CloudCredentials | undefined> {
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw Error("LOGINOM_STORE_READ_FAILED")
    })
    if (!handle) return
    try {
      const info = await handle.stat()
      if (
        !info.isFile() ||
        (process.getuid && info.uid !== process.getuid()) ||
        (process.platform !== "win32" && (info.mode & 0o077) !== 0)
      )
        throw Error("LOGINOM_STORE_PERMISSIONS_INVALID")
      const parsed = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(await handle.readFile("utf8"))
      if (Option.isNone(parsed)) throw Error("LOGINOM_CLOUD_STORE_INVALID")
      try {
        return requireCredentials(await codec.decode(parsed.value))
      } catch {
        throw Error("LOGINOM_CLOUD_STORE_INVALID")
      }
    } finally {
      await handle.close()
    }
  }
  return {
    async read(): Promise<CloudCredentials | undefined> {
      await protectDirectory()
      return read(file)
    },
    async write(value: CloudCredentials) {
      const record = requireCredentials(value)
      await protectDirectory()
      const temporary = `${file}.${randomUUID()}.tmp`
      try {
        const handle = await open(
          temporary,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        )
        try {
          await handle.writeFile(JSON.stringify(await codec.encode(record)))
          await handle.sync()
        } finally {
          await handle.close()
        }
        await read(temporary)
        await rename(temporary, file)
        await syncDirectory()
      } finally {
        await rm(temporary, { force: true })
      }
    },
    async clear() {
      await protectDirectory()
      await rm(file, { force: true })
      await syncDirectory()
    },
  }
}

function requireCredentials(value: unknown): CloudCredentials {
  const result = decode(value)
  if (Option.isNone(result)) throw Error("LOGINOM_CLOUD_STORE_INVALID")
  return result.value
}
