import { Option, Schema } from "effect"
import { Loginom } from "@opencode-ai/schema/loginom"
import type { createLoginomHost } from "./host"

const candidate = Schema.decodeUnknownOption(Loginom.Check)
const save = Schema.decodeUnknownOption(Loginom.Save)
const cancel = Schema.decodeUnknownOption(Loginom.Cancel)
const recover = Schema.decodeUnknownOption(Loginom.AcknowledgeRecovery)

export async function nodeManagement(
  method: string,
  input: unknown,
  host: Awaited<ReturnType<typeof createLoginomHost>>,
  lifecycle: { stopped: Promise<void>; closed(): boolean },
) {
  if (method === "connection.status" || method === "connection.read") return host.api.status()
  if (method === "connection.cloud-start" || method === "connection.cloud-cancel" || method === "connection.cloud-disconnect") {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length)
      throw new Error("LOGINOM_INPUT_INVALID")
    if (method === "connection.cloud-start") return host.api.cloudStart()
    if (method === "connection.cloud-cancel") return host.api.cloudCancel()
    return host.api.cloudDisconnect()
  }
  if (method === "connection.ready") {
    const before = await host.api.status()
    if (!before.generation) throw new Error("LOGINOM_CONFIG_REQUIRED")
    await Promise.race([
      host.catalog(before.generation),
      lifecycle.stopped.then(() => {
        throw new Error("LOGINOM_HOST_CLOSED")
      }),
    ]).catch(() => {
      throw new Error(lifecycle.closed() ? "LOGINOM_HOST_CLOSED" : "LOGINOM_CONNECTION_NOT_READY")
    })
    const after = await host.api.status()
    if (after.generation !== before.generation || after.state !== "ready")
      throw new Error("LOGINOM_CONNECTION_NOT_READY")
    return after
  }
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
