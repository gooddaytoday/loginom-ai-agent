import { randomUUID } from "node:crypto"
import type { ReadFolder } from "@loginom-ai-agent/loginom-host/package-folder"
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

  async function read(input: ReadFolder, signal: AbortSignal) {
    signal.throwIfAborted()
    if (await host.generation() !== input.generation) throw Error("LOGINOM_GENERATION_UNAVAILABLE")
    const result = await host.read(input, signal)
    if (await host.generation() !== input.generation) throw Error("LOGINOM_GENERATION_UNAVAILABLE")
    signal.throwIfAborted()
    return result
  }

  function readError(cause: unknown) {
    if (isCode(cause, "LOGINOM_GENERATION_UNAVAILABLE")) return ["connection_changed", ru.connectionChanged] as const
    if (isCode(cause, "LOGINOM_SESSION_LIMIT")) return ["session_limit", ru.sessionLimit] as const
    return ["unavailable", ru.unavailable] as const
  }

  return {
    async list(input, { signal, error }) {
      try {
        return await read(input, signal)
      } catch (cause) {
        signal.throwIfAborted()
        const [type, message] = readError(cause)
        return error(type, message)
      }
    },
    async search({ folder, text, recursive, generation, cursor }: Search, { signal, error }) {
      const query = normalize(text.trim())
      const continuation = cursor ? continuations.get(cursor) : undefined
      if (
        cursor &&
        (!recursive ||
          !continuation ||
          continuation.folder !== folder ||
          continuation.text !== query ||
          continuation.generation !== generation ||
          continuation.expires <= Date.now() ||
          continuation.reading)
      )
        return error("search_expired", ru.searchExpired)
      if (continuation) continuation.reading = true
      try {
        signal.throwIfAborted()
        const [current, ...remaining] = continuation?.pending ?? [folder]
        if (!current) return error("search_expired", ru.searchExpired)

        const result = await read({ folder: current, generation }, signal)
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
        if (cursor && (signal.aborted || isCode(cause, "LOGINOM_GENERATION_UNAVAILABLE"))) continuations.delete(cursor)
        signal.throwIfAborted()
        const [type, message] = readError(cause)
        return error(type, message)
      } finally {
        if (continuation) continuation.reading = false
      }
    },
  }
}
