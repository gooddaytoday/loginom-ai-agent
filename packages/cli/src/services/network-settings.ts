import { createServer } from "node:net"
import type { Definition, ProxyStatus, Status } from "@loginom-ai-agent/loginom-host/network-settings-rpc"
import type { RpcHandlers } from "@opencode/plugin/promise/rpc"
import { Effect, Semaphore } from "effect"
import { ServiceConfig } from "./service-config"

export const networkSettings = Effect.fnUntraced(function* (input: {
  editable: boolean
  hostname: string
  maximum: number
  proxy: ProxyStatus
}) {
  const readService = ServiceConfig.read()
  const run = Effect.runPromiseWith(yield* Effect.context<Effect.Services<typeof readService>>())
  const gate = yield* Semaphore.make(1)
  const { maximum } = input
  let listening: { current: number; fallback?: number } | undefined

  const status = Effect.gen(function* () {
    const port = listening
    if (!port) return { proxy: input.proxy }
    const saved = input.editable ? ((yield* readService).port ?? port.current) : port.current
    return { proxy: input.proxy, port: { ...port, saved, maximum, editable: input.editable } } satisfies Status
  })

  const handlers: RpcHandlers<typeof Definition> = {
    // After a lost save response, the status read waits for an atomic write already in progress.
    status: (_, { signal }) => run(gate.withPermit(status), { signal }),
    savePort: ({ port }, { signal }) => {
      if (port > maximum) return Promise.resolve("invalid")
      return run(
        gate.withPermit(
          Effect.gen(function* () {
            if (!input.editable || !listening) return "unavailable"
            if (port !== listening.current) {
              const result = yield* Effect.promise(() => checkPort(input.hostname, port))
              if (result !== "free") return result
            }
            // Once the write starts, finish its atomic rename even if the client goes away.
            yield* ServiceConfig.savePort(port).pipe(Effect.uninterruptible)
            return "saved"
          }),
        ),
        { signal },
      )
    },
  }

  return {
    handlers,
    listening(current: number, fallback?: number) {
      listening = fallback === undefined ? { current } : { current, fallback }
    },
  }
})

function checkPort(host: string, port: number): Promise<"free" | "occupied" | "unavailable"> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once("error", (error) =>
      resolve("code" in error && error.code === "EADDRINUSE" ? "occupied" : "unavailable"),
    )
    server.listen({ host, port, exclusive: true }, () =>
      server.close((error) => resolve(error ? "unavailable" : "free")),
    )
  })
}
