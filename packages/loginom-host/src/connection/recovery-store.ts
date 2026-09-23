import { constants } from "node:fs"
import { lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { join } from "node:path"

type Entry = { id: string; chat: string; generation: number }

// Written before dispatch. An absent reply never becomes permission to replay a mutation.
// Strict mode keeps an uncertain dispatch until acknowledgement. Advisory mode drops it
// so a failed scenario does not block the next call.
export async function recoveryStore(directory: string, options?: { strict?: boolean }) {
  const strict = options?.strict === true
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const info = await lstat(directory)
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (process.getuid && info.uid !== process.getuid()) ||
    (process.platform !== "win32" && info.mode & 0o077)
  )
    throw Error("LOGINOM_RECOVERY_STORE_INVALID")
  const entries = new Map<string, Entry>()
  const active = new Set<string>()
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".json")) continue
    const handle = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const info = await handle.stat()
      if (
        !info.isFile() ||
        (process.getuid && info.uid !== process.getuid()) ||
        (process.platform !== "win32" && info.mode & 0o077)
      )
        throw Error("LOGINOM_RECOVERY_STORE_INVALID")
      const entry = JSON.parse(await handle.readFile("utf8")) as Entry
      if (
        !/^[a-f0-9-]{36}$/.test(entry.id) ||
        name !== `${entry.id}.json` ||
        !/^[a-f0-9]{64}$/.test(entry.chat) ||
        !Number.isSafeInteger(entry.generation) ||
        entry.generation < 1
      )
        throw Error("LOGINOM_RECOVERY_STORE_INVALID")
      entries.set(entry.id, entry)
    } finally {
      await handle.close()
    }
  }
  const recovered = new Set(entries.keys())
  async function sync() {
    if (process.platform === "win32") return
    const handle = await open(directory, constants.O_RDONLY)
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  }
  async function remove(entry: Entry) {
    await rm(join(directory, `${entry.id}.json`), { force: true })
    await sync()
    entries.delete(entry.id)
    recovered.delete(entry.id)
  }
  if (!strict) {
    for (const entry of [...entries.values()]) await remove(entry)
  }
  return {
    pending: () => [...recovered],
    async acknowledge(ids: readonly string[]) {
      if (active.size) throw Error("LOGINOM_RECOVERY_BUSY")
      if (ids.length !== recovered.size || new Set(ids).size !== ids.length || ids.some((id) => !recovered.has(id)))
        throw Error("LOGINOM_RECOVERY_CONFLICT")
      for (const id of ids) await remove(entries.get(id)!)
    },
    async begin(chat: string, generation: number) {
      if (!/^[a-f0-9]{64}$/.test(chat) || !Number.isSafeInteger(generation) || generation < 1)
        throw Error("LOGINOM_RECOVERY_IDENTITY_INVALID")
      const entry = { id: randomUUID(), chat, generation }
      const temporary = join(directory, `${entry.id}.tmp`)
      const handle = await open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      )
      try {
        await handle.writeFile(JSON.stringify(entry))
        await handle.sync()
      } finally {
        await handle.close()
      }
      await rename(temporary, join(directory, `${entry.id}.json`))
      await sync()
      entries.set(entry.id, entry)
      active.add(entry.id)
      return entry.id
    },
    async settle(id: string, certain: boolean) {
      active.delete(id)
      const entry = entries.get(id)
      if (!entry) return
      if (!certain && strict) {
        recovered.add(id)
        return
      }
      // A later successful operation is never evidence about an earlier uncertain one.
      await remove(entry)
    },
  }
}
