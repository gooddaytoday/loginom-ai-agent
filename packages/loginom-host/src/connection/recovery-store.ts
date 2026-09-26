import { constants } from "node:fs"
import { lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { join } from "node:path"

type Entry = { id: string; chat: string; generation: number; purpose?: "session-completion" }

// Written before dispatch. An absent reply never becomes permission to replay a mutation.
// Strict mode keeps an uncertain dispatch until acknowledgement. Advisory mode drops it
// so a failed scenario does not block the next call.
export async function recoveryStore(directory: string, options?: { strict?: boolean }) {
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
        entry.generation < 1 ||
        (entry.purpose !== undefined && entry.purpose !== "session-completion")
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
  // Strict profiles never silently downgrade on a flagless restart. Existing
  // dispatches also protect profiles written before the policy marker existed.
  const policy = join(directory, ".strict-policy")
  const policyHandle = await open(policy, constants.O_RDONLY | constants.O_NOFOLLOW).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw Error("LOGINOM_RECOVERY_STORE_INVALID")
    },
  )
  if (policyHandle) {
    try {
      const stat = await policyHandle.stat()
      if (
        !stat.isFile() ||
        stat.size !== 10 ||
        (process.getuid && stat.uid !== process.getuid()) ||
        (process.platform !== "win32" && stat.mode & 0o077) ||
        (await policyHandle.readFile("utf8")) !== "strict-v1\n"
      )
        throw Error("LOGINOM_RECOVERY_STORE_INVALID")
    } finally {
      await policyHandle.close()
    }
  }
  const strict = options?.strict === true || !!policyHandle || entries.size > 0
  if (strict && !policyHandle) {
    const handle = await open(
      policy,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    )
    try {
      await handle.writeFile("strict-v1\n")
      await handle.sync()
    } finally {
      await handle.close()
    }
    await sync()
  }
  return {
    mode: strict ? ("strict" as const) : ("advisory" as const),
    pending: () => [...recovered],
    completionMatches(id: string, chat: string, generation: number) {
      const entry = entries.get(id)
      return entry
        ? entry.purpose === "session-completion" && entry.chat === chat && entry.generation === generation
        : undefined
    },
    completionPending: () => [...entries.values()].some((entry) => entry.purpose === "session-completion"),
    async acknowledge(ids: readonly string[]) {
      if (active.size || [...entries.values()].some((entry) => entry.purpose === "session-completion"))
        throw Error("LOGINOM_RECOVERY_BUSY")
      if (ids.length !== recovered.size || new Set(ids).size !== ids.length || ids.some((id) => !recovered.has(id)))
        throw Error("LOGINOM_RECOVERY_CONFLICT")
      for (const id of ids) await remove(entries.get(id)!)
    },
    async begin(chat: string, generation: number, purpose?: "session-completion") {
      if (!/^[a-f0-9]{64}$/.test(chat) || !Number.isSafeInteger(generation) || generation < 1)
        throw Error("LOGINOM_RECOVERY_IDENTITY_INVALID")
      const entry = { id: randomUUID(), chat, generation, ...(purpose ? { purpose } : {}) }
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
