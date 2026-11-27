import { createServer } from "node:net"
import type { Definition, Mode, Status } from "@loginom-ai-agent/loginom-host/network-settings-rpc"
import type { RpcHandlers } from "@opencode/plugin/promise/rpc"
import { Effect, Semaphore } from "effect"
import { NetworkMode } from "../network-mode"
import { ServiceConfig } from "./service-config"

export const networkSettings = Effect.fnUntraced(function* (input: {
  directory: string
  activeMode: Mode
  editable: boolean
  hostname?: string
}) {
  const readService = ServiceConfig.read()
  const run = Effect.runPromiseWith(yield* Effect.context<Effect.Services<typeof readService>>())
  const gate = yield* Semaphore.make(1)
  let currentPort: number | undefined

  const status = async (): Promise<Status> => {
    const current = currentPort
    const mode = await NetworkMode.read(input.directory)
    if (current === undefined) return { mode, activeMode: input.activeMode }

    const saved = input.editable ? ((await run(readService)).port ?? current) : current
    return { mode, activeMode: input.activeMode, port: { current, saved, editable: input.editable } }
  }

  const handlers: RpcHandlers<typeof Definition> = {
    status,
    setMode: ({ mode }) =>
      run(
        gate.withPermit(
          Effect.tryPromise(async () => {
            await NetworkMode.write(input.directory, mode)
            return status()
          }),
        ),
      ),
    savePort: ({ port }) =>
      run(
        gate.withPermit(
          Effect.gen(function* () {
            if (!input.editable || currentPort === undefined) return "unavailable"

            const config = yield* readService
            if (port !== currentPort) {
              const result = yield* Effect.promise(() =>
                checkPort(input.hostname ?? config.hostname ?? "127.0.0.1", port),
              )
              if (result !== "free") return result
            }
            // The current service keeps its listener and registration until it stops.
            yield* ServiceConfig.savePort(port)
            return "saved"
          }),
        ),
      ),
  }

  return {
    handlers,
    listening(port: number) {
      currentPort = port
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
