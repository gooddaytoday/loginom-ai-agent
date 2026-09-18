import { EventEmitter } from "node:events"
import { isAbsolute } from "node:path"
import { Option, Schema } from "effect"
import { Loginom } from "@loginom-ai-agent/schema/loginom"
import { createLoginomHost } from "./host"
import { loginomHostPort, type HostPort } from "./host-port"
import { cliCredentials } from "./connection/cli-credentials"
import { hostError } from "./errors"

if (!process.send) throw new Error("LOGINOM_PRIVATE_IPC_REQUIRED")

const events = new EventEmitter()
const operations = new Set<Promise<void>>()
const state: {
  starting?: Promise<void>
  host?: Awaited<ReturnType<typeof createLoginomHost>>
  port?: ReturnType<typeof loginomHostPort>
  stopping?: Promise<void>
  closed: boolean
} = { closed: false }
const port: HostPort = {
  postMessage: (value) => reply(value),
  on: (event, listener) => {
    events.on(event, listener)
  },
  start() {},
}
const candidate = Schema.decodeUnknownOption(Loginom.Candidate)
const save = Schema.decodeUnknownOption(Loginom.Save)
const cancel = Schema.decodeUnknownOption(Loginom.Cancel)
const recover = Schema.decodeUnknownOption(Loginom.AcknowledgeRecovery)

process.on("message", (message: unknown) => {
  const operation = dispatch(message)
  operations.add(operation)
  void operation
    .finally(() => operations.delete(operation))
    .catch(() => {
      process.exitCode = 1
    })
})
process.on("disconnect", () => {
  void stop().catch(() => {
    process.exitCode = 1
  })
})
process.on("SIGTERM", () => {
  void stop()
    .finally(() => {
      if (process.connected) process.disconnect()
    })
    .catch(() => {
      process.exitCode = 1
    })
})

async function dispatch(message: unknown) {
  if (
    !message ||
    typeof message !== "object" ||
    !("id" in message) ||
    typeof message.id !== "string" ||
    !("method" in message) ||
    typeof message.method !== "string"
  )
    return
  const input = "input" in message ? message.input : undefined
  try {
    if (state.closed) throw new Error("LOGINOM_HOST_CLOSED")
    if (message.method === "start") {
      if (state.starting || state.host) throw new Error("LOGINOM_HANDSHAKE_INVALID")
      if (
        !input ||
        typeof input !== "object" ||
        !("protocol" in input) ||
        input.protocol !== 1 ||
        !("root" in input) ||
        typeof input.root !== "string" ||
        !isAbsolute(input.root) ||
        !("resources" in input) ||
        typeof input.resources !== "string" ||
        !isAbsolute(input.resources) ||
        !("headless" in input) ||
        typeof input.headless !== "boolean"
      )
        throw new Error("LOGINOM_HANDSHAKE_INVALID")
      const options = {
        root: input.root,
        resources: input.resources,
        headless: input.headless,
        codec: cliCredentials(process.platform, { root: input.root, resources: input.resources }),
        environment: process.env,
      }
      state.starting = createLoginomHost(options).then(async (host) => {
        state.host = host
        state.port = loginomHostPort(port, host)
        await host.settled()
      })
      await state.starting
      if (state.closed) throw new Error("LOGINOM_HOST_CLOSED")
      reply({ id: message.id, result: { protocol: 1, ready: true, pid: process.pid } })
      return
    }
    if (!state.host) throw new Error("LOGINOM_HOST_NOT_READY")
    if (message.method === "close") {
      // Stop admission now, but exclude this close request from its own drain.
      const closing = stop()
      void closing.then(
        () => reply({ id: message.id, result: { closed: true } }, true),
        () => {
          reply({ id: message.id, error: "LOGINOM_HOST_CLEANUP_FAILED" }, true)
        },
      )
      return
    }
    if (!message.method.startsWith("connection.")) {
      events.emit("message", { data: message })
      return
    }
    const result = await management(message.method, input, state.host)
    reply({ id: message.id, result })
  } catch (error) {
    reply({ id: message.id, error: hostError(error) })
  }
}

async function management(method: string, input: unknown, host: Awaited<ReturnType<typeof createLoginomHost>>) {
  if (method === "connection.status" || method === "connection.read") return host.api.status()
  if (method === "connection.check") {
    const value = candidate(input)
    if (Option.isNone(value)) throw new Error("LOGINOM_CANDIDATE_INVALID")
    return host.api.check(value.value)
  }
  if (method === "connection.save") {
    const value = save(input)
    if (Option.isNone(value)) throw new Error("LOGINOM_SAVE_INVALID")
    await host.api.save(value.value)
    await host.settled()
    return host.api.status()
  }
  if (method === "connection.cancel-pending") {
    const value = cancel(input)
    if (Option.isNone(value)) throw new Error("LOGINOM_CANCEL_INVALID")
    return host.api.cancelPending(value.value)
  }
  if (method === "connection.recover") {
    const value = recover(input)
    if (Option.isNone(value)) throw new Error("LOGINOM_RECOVERY_INVALID")
    return host.api.acknowledgeRecovery(value.value)
  }
  throw new Error("LOGINOM_METHOD_INVALID")
}

function stop() {
  if (state.stopping) return state.stopping
  state.closed = true
  events.emit("close")
  state.stopping = (async () => {
    await state.starting
    const cancellation = Promise.allSettled([state.host?.interruptAll()])
    await Promise.all([...operations])
    await state.port?.close()
    const results = await Promise.allSettled([state.host?.close()])
    if ([...(await cancellation), ...results].some((result) => result.status === "rejected"))
      throw new Error("LOGINOM_HOST_CLEANUP_FAILED")
  })()
  return state.stopping
}

function reply(value: unknown, disconnect = false) {
  if (!process.connected) return
  process.send?.(value as object, (error) => {
    if (error) {
      void stop().catch(() => {
        process.exitCode = 1
      })
      return
    }
    if (disconnect && process.connected) process.disconnect()
  })
}
