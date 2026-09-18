import type { InputFile } from "./inputs"
export * as LoginomHost from "./adapter"

import { randomUUID } from "node:crypto"
import { transport, type Port } from "./transport"

const state: { connection?: ReturnType<typeof transport> } = {}
export function connect(port: Port) {
  state.connection?.close()
  state.connection = transport(port)
}
export function disconnect() {
  state.connection?.close()
  state.connection = undefined
}
export async function acquire(session: string) {
  const connection = state.connection
  if (!connection) return
  const run = randomUUID()
  const value = await connection.request("acquire", { session, run })
  if (!value || typeof value !== "object" || !("generation" in value) || typeof value.generation !== "number") return
  return {
    generation: value.generation,
    async admit(userMessage: string, files: InputFile[]) {
      return connection.request("admit", { run, userMessage, files })
    },
    async tools() {
      return connection.request("tools", { run })
    },
    async call(name: string, args: unknown, userMessage: string, signal?: AbortSignal) {
      const abort = () => {
        void connection.request("interrupt", { run }).catch(() => undefined)
      }
      signal?.addEventListener("abort", abort, { once: true })
      try {
        if (signal?.aborted) throw new Error("LOGINOM_RUN_ABORTED")
        return await connection.request("call", { run, name, args, userMessage })
      } finally {
        signal?.removeEventListener("abort", abort)
      }
    },
    async release() {
      await connection.request("release", { run }).catch(() => undefined)
    },
  }
}
