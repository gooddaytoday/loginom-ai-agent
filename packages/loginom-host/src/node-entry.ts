import { EventEmitter } from "node:events"
import { isAbsolute } from "node:path"
import { join } from "node:path"
import { writeFile } from "node:fs/promises"
import { Option, Schema } from "effect"
import { Loginom } from "@loginom-ai-agent/schema/loginom"
import { createLoginomHost } from "./host"
import { loginomHostPort, type HostPort } from "./host-port"
import { cliCredentials } from "./connection/cli-credentials"
import { hostError } from "./errors"
import { retainFPStartup, retainAmountStartup, bindAmountHostStartup, bindFPHostStartup } from "./fp-startup-control"

if (!process.send) throw new Error("LOGINOM_PRIVATE_IPC_REQUIRED")

const events = new EventEmitter()
const operations = new Set<Promise<void>>()
const state: {
  starting?: Promise<void>
  fpStartup?: ReturnType<typeof retainFPStartup>
  amountStartup?: ReturnType<typeof retainAmountStartup>
  host?: Awaited<ReturnType<typeof createLoginomHost>>
  port?: ReturnType<typeof loginomHostPort>
  stopping?: Promise<void>
  closed: boolean
  root?: string
  shutdown?: { stages: object[], primaryFailure?:unknown, persistenceFailure?:unknown }
  closeFailure?: unknown
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
    .then(() => {
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
    if (message.method === "readonly.preReady.cancel" && input && typeof input === "object" && "phase" in input && input.phase === "startup") {
      const startup=state.fpStartup ?? state.amountStartup
      if (!startup?.cancel(input)) throw Error("LOGINOM_HANDSHAKE_INVALID")
      reply({id: message.id, result: {accepted: true, pending: startup.pending, nativeCancellationConfirmed: false}})
      return
    }
    if (message.method === "start") {
      if (state.starting || state.host || state.amountStartup) throw new Error("LOGINOM_HANDSHAKE_INVALID")
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
        typeof input.headless !== "boolean" ||
        ("strictRecovery" in input && typeof input.strictRecovery !== "boolean") ||
        ("acceptanceCleanupPackage" in input && (typeof input.acceptanceCleanupPackage !== "string" ||
          input.acceptanceCleanupPackage.length > 1024 ||
          !/^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/.test(input.acceptanceCleanupPackage) ||
          input.acceptanceCleanupPackage.split("/").some(segment => segment === "." || segment === "..")))
      )
        throw new Error("LOGINOM_HANDSHAKE_INVALID")
      const capture = "acceptanceCapture" in input ? input.acceptanceCapture : undefined
      if (capture !== undefined && (!capture || typeof capture !== "object"
          || !["authorization,packagePath", "authorization,harness,packagePath"].includes(Object.keys(capture).sort().join(","))
          || ("harness" in capture && capture.harness !== "amount-import-type-v1" && capture.harness !== "field-parameters-preservation-v1")
          || !("authorization" in capture) || typeof capture.authorization !== "string" || !/^[a-f0-9]{64}$/.test(capture.authorization)
          || !("packagePath" in capture) || typeof capture.packagePath !== "string" || capture.packagePath.length > 1024
          || !/^\/[^/\\\x00-\x1f]+\/[^/\\\x00-\x1f]+\.lgp$/.test(capture.packagePath)
          || capture.packagePath.split("/").some(x => x === "." || x === "..")))
        throw Error("LOGINOM_HANDSHAKE_INVALID")
      const amountStartup='amountStartup' in input
        ? retainAmountStartup(message as unknown as Parameters<typeof retainAmountStartup>[0],input as unknown as Parameters<typeof retainAmountStartup>[1]) : undefined
      state.amountStartup=amountStartup
      const fpOnly = capture && typeof capture === "object" && "harness" in capture && capture.harness === "field-parameters-preservation-v1"
        ? retainFPStartup(message as unknown as Parameters<typeof retainFPStartup>[0], input as unknown as Parameters<typeof retainFPStartup>[1]) : undefined
      const fpStartup=amountStartup ?? fpOnly
      state.fpStartup = fpOnly
      fpStartup?.guard()
      const options = {
        root: input.root,
        acceptanceCapture: capture as { authorization: string; packagePath: string; harness?: "amount-import-type-v1" | "field-parameters-preservation-v1" } | undefined,
        resources: input.resources,
        headless: input.headless,
        strictRecovery: "strictRecovery" in input && input.strictRecovery === true,
        acceptanceCleanupPackage: "acceptanceCleanupPackage" in input ? input.acceptanceCleanupPackage as string : undefined,
        codec: cliCredentials(process.platform, { root: input.root, resources: input.resources }),
        environment: process.env,
      }
      const guardFPStartup = () => {
        fpStartup?.guard()
        if (fpStartup && (options.root !== input.root || options.resources !== input.resources
            || options.headless !== input.headless || options.acceptanceCapture !== capture
            || options.strictRecovery !== ("strictRecovery" in input && input.strictRecovery === true)
            || options.acceptanceCleanupPackage !== ("acceptanceCleanupPackage" in input ? input.acceptanceCleanupPackage : undefined)))
          throw Error("LOGINOM_HANDSHAKE_INVALID")
      }
      guardFPStartup()
      if(amountStartup)bindAmountHostStartup(options,amountStartup)
      else if (fpOnly) bindFPHostStartup(options,fpOnly)
      state.root=input.root
      state.starting = createLoginomHost(options).then(async (host) => {
        state.host = host
        guardFPStartup()
        state.port = loginomHostPort(port, host)
        try { await host.settled() }
        catch (error) { throw fpStartup ? fpStartup.reject(error) : error }
        guardFPStartup()
      }, fpStartup ? error => { throw fpStartup.reject(error) } : undefined)
      let accepted = false
      try {
        await state.starting
        guardFPStartup()
        if (state.closed) throw new Error("LOGINOM_HOST_CLOSED")
        accepted = true
      } finally { fpStartup?.settle(accepted) }
      if (state.closed) throw new Error("LOGINOM_HOST_CLOSED")
      reply({ id: message.id, result: { protocol: 1, ready: true, pid: process.pid } })
      return
    }
    if ((state.fpStartup ?? state.amountStartup) && !(state.fpStartup ?? state.amountStartup)!.accepted) throw new Error("LOGINOM_HOST_NOT_READY")
    if (!state.host) throw new Error("LOGINOM_HOST_NOT_READY")
    if (message.method === "close") {
      // Stop admission now, but exclude this close request from its own drain.
      const closing = stop()
      void closing.then(
        () => reply({ id: message.id, result: { closed: true } }, true),
        () => {
          reply({ id: message.id, error: "LOGINOM_HOST_CLEANUP_FAILED" })
        },
      )
      return
    }
    if (!message.method.startsWith("connection.")) {
      events.emit("message", { data: message })
      return
    }
    if(state.amountStartup && !["connection.status","connection.read"].includes(message.method))throw Error("LOGINOM_RECOVERY_REQUIRED")
    const result = await management(message.method, input, state.host)
    reply({ id: message.id, result })
  } catch (error) {
    const startup = state.fpStartup ?? state.amountStartup
    if (message.method === "start" && startup) reply({id: message.id, rejection: closeRejection(error),
      ...(state.amountStartup?{rejectionOrigin:startup.rejectionOrigin}:{}),
      ...(startup.secondary ? {secondaryRejection: closeRejection(startup.secondary.value)} : {})})
    else reply({ id: message.id, error: hostError(error) })
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

function closeRejection(value: unknown): unknown {
  return value instanceof Error ? {kind:"Error",name:value.name,message:value.message,
    ...("cause" in value?{cause:closeRejection(value.cause)}:{})} :
    {kind:"value",value:value===undefined?null:value,is_undefined:value===undefined}
}
async function recordClose(stage: string, detail: object) {
  state.shutdown ??= {stages:[]}
  state.shutdown.stages.push({stage,...detail})
  if(state.root) await writeFile(join(state.root,"host-shutdown.json"),JSON.stringify(state.shutdown,null,2)+"\n",{mode:0o600})
}
function stop() {
  if (state.stopping) return state.stopping
  state.stopping = (async () => {
    await state.starting
    await recordClose("interrupt",{status:"started"})
    let primary: {stage:string,error:Error} | undefined
    try {
    const cancellation = await Promise.allSettled([Promise.resolve().then(()=>state.host?.interruptAll())])
    const interrupted=cancellation[0]
    if(interrupted.status==="rejected") primary={stage:"interrupt",error:new Error("LOGINOM_HOST_CLEANUP_FAILED",{cause:interrupted.reason})}
    await recordClose("interrupt",{status:interrupted.status,
      ...(interrupted.status==="rejected"?{rejection:closeRejection(interrupted.reason)}:{})})
    await Promise.all([...operations])
    await recordClose("host_close",{status:"started"})
    const results = await Promise.allSettled([Promise.resolve().then(()=>state.host?.close())])
    const closed=results[0]
    if(closed.status==="rejected" && !primary) primary={stage:"host_close",error:new Error("LOGINOM_HOST_CLEANUP_FAILED",{cause:closed.reason})}
    await recordClose("host_close",{status:closed.status,
      ...(closed.status==="rejected"?{rejection:closeRejection(closed.reason)}:{})})
    const refused=[...cancellation,...results].find(result=>result.status==="rejected")
    if (refused) throw primary?.error??new Error("LOGINOM_HOST_CLEANUP_FAILED",{cause:refused.reason})
    // Durable native/transport completion precedes the port's lease release.
    // "prepared" is not a claim that an outer acknowledgement was delivered.
    await recordClose("outer_acknowledgement",{status:"prepared"})
    await state.port?.close()
    state.closed = true
    events.emit("close")
    } catch(error) {
      const rejection=primary?.error??error
      state.closeFailure=rejection
      const shutdown=state.shutdown??={stages:[]}
      if(primary) shutdown.primaryFailure={stage:primary.stage,rejection:closeRejection(rejection)}
      if(primary && error!==rejection) shutdown.persistenceFailure=closeRejection(error)
      try { await recordClose("refused",{rejection:closeRejection(rejection)}) } catch(persistenceFailure) { shutdown.persistenceFailure=closeRejection(persistenceFailure) }
      throw rejection
    }
  })()
  const attempt = state.stopping
  void attempt.catch(error => {
    state.closeFailure=error
    if (state.stopping === attempt) state.stopping = undefined
  })
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
