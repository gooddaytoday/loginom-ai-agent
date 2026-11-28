import { randomUUID } from "node:crypto"
import type { FolderListing } from "@loginom-ai-agent/loginom-host/package-folder"
import type { RpcHandlers } from "@opencode/plugin/promise/rpc"
import { ServiceHost } from "./host"
import type { Definition, Search } from "./package-list-contract"
import { packageList as ru } from "./ru"

type Continuation = {
  folder: string
  text: string
  generation: number
  pages: readonly FolderListing[]
  index: number
  expires: number
}

const normalize = (text: string) => text.normalize("NFC").toLocaleLowerCase("ru")
const isCode = (error: unknown, code: string) => error instanceof Error && error.message === code

function readError(cause: unknown) {
  if (isCode(cause, "LOGINOM_SESSION_LIMIT")) return ["session_limit", ru.sessionLimit] as const
  if (isCode(cause, "LOGINOM_CONFIG_REQUIRED")) return ["not_connected", ru.notConnected] as const
  if (isCode(cause, "LOGINOM_RECOVERY_REQUIRED")) return ["recovering", ru.recovering] as const
  if (isCode(cause, "LOGINOM_PACKAGE_FOLDER_CANCELLED")) return ["cancelled", ru.cancelled] as const
  return ["unavailable", ru.unavailable] as const
}

export function packageListHandlers(host = ServiceHost.packageFolders): RpcHandlers<typeof Definition> {
  const continuations = new Map<string, Continuation>()

  return {
    async list({ folder }, { signal, error }) {
      try {
        const [listing] = await host.read({ folder, generation: await host.generation() }, signal)
        if (!listing) throw Error("LOGINOM_REPLY_INVALID")
        return listing
      } catch (cause) {
        signal.throwIfAborted()
        const [type, message] = readError(cause)
        return error(type, message)
      }
    },
    async search({ folder, text, recursive, cursor }: Search, { signal, error }) {
      const query = normalize(text.trim())
      const continuation = cursor ? continuations.get(cursor) : undefined
      if (cursor && (!recursive || !continuation || continuation.folder !== folder || continuation.text !== query ||
        continuation.expires <= Date.now())) return error("search_expired", ru.searchExpired)
      if (cursor) continuations.delete(cursor)
      try {
        signal.throwIfAborted()
        const generation = await host.generation()
        signal.throwIfAborted()
        if (continuation && continuation.generation !== generation) throw Error("LOGINOM_GENERATION_UNAVAILABLE")
        const pages = continuation?.pages ?? await host.read({ folder, generation, ...(recursive ? { query: text } : {}) }, signal)
        signal.throwIfAborted()
        const index = continuation?.index ?? 0
        const result = pages[index]
        if (!result) throw Error("LOGINOM_REPLY_INVALID")
        const entries = result.entries.filter((entry) => entry.kind === "package").filter((entry) => normalize(entry.name).includes(query))
        if (index + 1 >= pages.length) return { folder: result.folder, entries, slow: result.slow }

        const next = randomUUID()
        continuations.set(next, { folder, text: query, generation, pages, index: index + 1, expires: Date.now() + 5 * 60_000 })
        if (continuations.size > 64) {
          const oldest = continuations.keys().next().value
          if (oldest) continuations.delete(oldest)
        }
        return { folder: result.folder, entries, slow: result.slow, cursor: next }
      } catch (cause) {
        signal.throwIfAborted()
        if (continuation && isCode(cause, "LOGINOM_GENERATION_UNAVAILABLE")) return error("search_expired", ru.searchExpired)
        const [type, message] = readError(cause)
        return error(type, message)
      }
    },
  }
}
