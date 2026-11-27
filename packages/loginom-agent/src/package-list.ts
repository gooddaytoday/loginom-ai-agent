import { randomUUID } from "node:crypto"
import type { RpcHandlers } from "@opencode/plugin/promise/rpc"
import { ServiceHost } from "./host"
import type { Definition, Search } from "./package-list-contract"
import { packageList as ru } from "./ru"

type Continuation = {
  folder: string
  text: string
  generation: number
  pending: readonly string[]
  expires: number
  reading: boolean
}

const normalize = (text: string) => text.normalize("NFC").toLocaleLowerCase("ru")
const isCode = (error: unknown, code: string) => error instanceof Error && error.message === code

export function packageListHandlers(host = ServiceHost.packageFolders): RpcHandlers<typeof Definition> {
  const continuations = new Map<string, Continuation>()

  return {
    async list({ folder }, { signal, error }) {
      try {
        return await host.read({ folder, generation: await host.generation() }, signal)
      } catch (cause) {
        signal.throwIfAborted()
        return isCode(cause, "LOGINOM_SESSION_LIMIT")
          ? error("session_limit", ru.sessionLimit)
          : error("unavailable", ru.unavailable)
      }
    },
    async search({ folder, text, recursive, cursor }: Search, { signal, error }) {
      const query = normalize(text.trim())
      const continuation = cursor ? continuations.get(cursor) : undefined
      if (
        cursor &&
        (!recursive ||
          !continuation ||
          continuation.folder !== folder ||
          continuation.text !== query ||
          continuation.expires <= Date.now() ||
          continuation.reading)
      )
        return error("search_expired", ru.searchExpired)
      if (continuation) continuation.reading = true
      try {
        signal.throwIfAborted()
        const generation = continuation?.generation ?? (await host.generation())
        const [current, ...remaining] = continuation?.pending ?? [folder]
        if (!current) return error("search_expired", ru.searchExpired)

        const result = await host.read({ folder: current, generation }, signal)
        signal.throwIfAborted()
        const entries = result.entries
          .filter((entry) => entry.kind === "package")
          .filter((entry) => normalize(entry.name).includes(query))
        const children = recursive
          ? result.entries.filter((entry) => entry.kind === "folder").map((entry) => entry.path)
          : []
        const pending = [...children, ...remaining]

        if (cursor) continuations.delete(cursor)
        if (!pending.length) return { folder: current, entries, slow: result.slow }
        // Cursor state stays on the server and is bounded per Location.
        const next = randomUUID()
        continuations.set(next, {
          folder,
          text: query,
          generation,
          pending,
          expires: Date.now() + 5 * 60_000,
          reading: false,
        })
        if (continuations.size > 64) {
          const oldest = continuations.keys().next().value
          if (oldest) continuations.delete(oldest)
        }
        return { folder: current, entries, slow: result.slow, cursor: next }
      } catch (cause) {
        if (signal.aborted && cursor) continuations.delete(cursor)
        signal.throwIfAborted()
        if (continuation && isCode(cause, "LOGINOM_GENERATION_UNAVAILABLE"))
          return error("search_expired", ru.searchExpired)
        return isCode(cause, "LOGINOM_SESSION_LIMIT")
          ? error("session_limit", ru.sessionLimit)
          : error("unavailable", ru.unavailable)
      } finally {
        if (continuation) continuation.reading = false
      }
    },
  }
}
