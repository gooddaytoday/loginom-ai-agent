import { constants } from "node:fs"
import { open, mkdir, readdir, rename, lstat } from "node:fs/promises"
import { createHash, randomUUID } from "node:crypto"
import { join } from "node:path"
import { Option, Schema } from "effect"
import { Loginom } from "@loginom-ai-agent/schema/loginom"
import type { recoveryStore } from "./connection/recovery-store"

type Runtime = { request(operation: string, input?: unknown, timeout?: number): Promise<unknown> }
const identifier = /^[a-zA-Z0-9_-]{1,160}$/
const decodeBinding = Schema.decodeUnknownOption(Loginom.SessionCompletionBinding)
const decodeRequest = Schema.decodeUnknownOption(Loginom.FinishOwnSession)
const decodeReceipt = Schema.decodeUnknownOption(Loginom.SessionCompletionReceipt)

async function readPrivate(file: string) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (
      !stat.isFile() ||
      stat.size > 32768 ||
      (process.getuid && stat.uid !== process.getuid()) ||
      (process.platform !== "win32" && stat.mode & 0o077)
    )
      throw Error("LOGINOM_SESSION_STORE_INVALID")
    return JSON.parse(await handle.readFile("utf8")) as unknown
  } finally {
    await handle.close()
  }
}

// Written by the trusted launcher/controller before starting the private Host.
// No management request or model tool can create or replace this registration.
export async function readSessionRegistration(root: string): Promise<{ version: 1; attemptId: string } | undefined> {
  const value = await readPrivate(join(root, "session-registration.json")).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw Error("LOGINOM_SESSION_STORE_INVALID")
  })
  if (value === undefined) return
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("attemptId" in value) ||
    typeof value.attemptId !== "string" ||
    !identifier.test(value.attemptId) ||
    Object.keys(value).sort().join() !== "attemptId,version"
  )
    throw Error("LOGINOM_SESSION_STORE_INVALID")
  return { version: 1, attemptId: value.attemptId }
}

function same(left: Loginom.SessionCompletionBinding, right: Loginom.SessionCompletionBinding) {
  return Object.keys(left).every((key) => left[key as keyof typeof left] === right[key as keyof typeof right])
}

export async function sessionCompletion(input: {
  root: string
  registration?: { attemptId: string }
  journal: Awaited<ReturnType<typeof recoveryStore>>
  idle(): boolean
  runtime(generation: number, chat: string): Promise<Runtime | undefined>
}) {
  const directory = join(input.root, "session-completions")
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const info = await lstat(directory)
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (process.getuid && info.uid !== process.getuid()) ||
    (process.platform !== "win32" && info.mode & 0o077)
  )
    throw Error("LOGINOM_SESSION_STORE_INVALID")
  const records = new Map<string, { recoveryId: string; receipt: Loginom.SessionCompletionReceipt }>()
  let active = false
  const fileName = (id: string) => `${createHash("sha256").update(id).digest("hex")}.json`
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".json")) continue
    const value = await readPrivate(join(directory, name))
    if (
      !value ||
      typeof value !== "object" ||
      !("recoveryId" in value) ||
      typeof value.recoveryId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(value.recoveryId) ||
      !("receipt" in value)
    )
      throw Error("LOGINOM_SESSION_STORE_INVALID")
    const receipt = decodeReceipt(value.receipt)
    if (
      Option.isNone(receipt) ||
      !identifier.test(receipt.value.completionId) ||
      name !== fileName(receipt.value.completionId) ||
      receipt.value.binding.attemptId !== input.registration?.attemptId ||
      (receipt.value.status === "SUCCEEDED" &&
        (!receipt.value.packageClosed || !receipt.value.loggedOut || receipt.value.reason !== null))
    )
      throw Error("LOGINOM_SESSION_STORE_INVALID")
    validate(receipt.value.binding)
    const matches = input.journal.completionMatches(
      value.recoveryId,
      receipt.value.binding.chat,
      receipt.value.binding.generation,
    )
    if (matches === false || (matches === undefined && receipt.value.status !== "SUCCEEDED"))
      throw Error("LOGINOM_SESSION_STORE_INVALID")
    records.set(receipt.value.completionId, { recoveryId: value.recoveryId, receipt: receipt.value })
    // The stored bound remote receipt, never a transport close, settles this intent.
    if (receipt.value.status === "SUCCEEDED") await input.journal.settle(value.recoveryId, true)
  }
  async function save(record: { recoveryId: string; receipt: Loginom.SessionCompletionReceipt }) {
    const temporary = join(directory, `${randomUUID()}.tmp`)
    const handle = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    )
    try {
      await handle.writeFile(JSON.stringify(record))
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, join(directory, fileName(record.receipt.completionId)))
    if (process.platform !== "win32") {
      const dir = await open(directory, constants.O_RDONLY)
      try {
        await dir.sync()
      } finally {
        await dir.close()
      }
    }
    records.set(record.receipt.completionId, record)
  }
  function validate(binding: Loginom.SessionCompletionBinding) {
    if (
      !input.registration ||
      input.journal.mode !== "strict" ||
      binding.attemptId !== input.registration.attemptId ||
      !/^[a-f0-9]{64}$/.test(binding.chat) ||
      binding.generation < 1 ||
      binding.packagePath.length > 1024 ||
      !/^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/.test(binding.packagePath) ||
      binding.packagePath.split("/").some((part) => part === "." || part === "..")
    )
      throw Error("LOGINOM_SESSION_BINDING_INVALID")
  }
  async function accept(record: { recoveryId: string; receipt: Loginom.SessionCompletionReceipt }, value: unknown) {
    const decoded = decodeReceipt(value)
    if (
      Option.isNone(decoded) ||
      decoded.value.completionId !== record.receipt.completionId ||
      !same(decoded.value.binding, record.receipt.binding) ||
      (decoded.value.status === "SUCCEEDED" &&
        (!decoded.value.packageClosed || !decoded.value.loggedOut || decoded.value.reason !== null))
    )
      return record.receipt
    await save({ recoveryId: record.recoveryId, receipt: decoded.value })
    if (decoded.value.status === "SUCCEEDED") await input.journal.settle(record.recoveryId, true)
    return decoded.value
  }
  return {
    blocked: () =>
      active ||
      input.journal.completionPending() ||
      [...records.values()].some((record) => record.receipt.status !== "SUCCEEDED"),
    completed: () => [...records.values()].some((record) => record.receipt.status === "SUCCEEDED"),
    async options(target: typeof Loginom.SessionCompletionTarget.Type) {
      if (!input.registration || input.journal.mode !== "strict") throw Error("LOGINOM_SESSION_UNREGISTERED")
      if (active || !input.idle()) throw Error("LOGINOM_SESSION_BUSY")
      const runtime = await input.runtime(target.generation, target.chat)
      if (!runtime) throw Error("LOGINOM_SESSION_UNAVAILABLE")
      const decoded = decodeBinding(await runtime.request("session-completion-options"))
      if (Option.isNone(decoded)) throw Error("LOGINOM_SESSION_BINDING_INVALID")
      validate(decoded.value)
      if (decoded.value.chat !== target.chat || decoded.value.generation !== target.generation)
        throw Error("LOGINOM_SESSION_BINDING_INVALID")
      return decoded.value
    },
    async finish(value: typeof Loginom.FinishOwnSession.Type) {
      const decoded = decodeRequest(value)
      if (Option.isNone(decoded) || !identifier.test(decoded.value.completionId))
        throw Error("LOGINOM_SESSION_BINDING_INVALID")
      const request = decoded.value
      validate(request.binding)
      if (active) throw Error("LOGINOM_SESSION_BUSY")
      const previous = records.get(request.completionId)
      if (previous && !same(previous.receipt.binding, request.binding))
        throw Error("LOGINOM_SESSION_COMPLETION_CONFLICT")
      if (previous?.receipt.status === "SUCCEEDED" || previous?.receipt.status === "BLOCKED") return previous.receipt
      if (!input.idle()) throw Error("LOGINOM_SESSION_BUSY")
      active = true
      try {
        const runtime = await input.runtime(request.binding.generation, request.binding.chat)
        if (previous) {
          // An uncertain effect is only observed. Never send finish twice.
          if (!runtime) return previous.receipt
          const observed = await runtime
            .request("session-completion-status", { completionId: request.completionId })
            .catch(() => undefined)
          return accept(previous, observed)
        }
        if ([...records.values()].some((record) => record.receipt.status === "SUCCEEDED"))
          throw Error("LOGINOM_SESSION_COMPLETED")
        if (records.size) throw Error("LOGINOM_RECOVERY_REQUIRED")
        if (input.journal.pending().length) throw Error("LOGINOM_RECOVERY_REQUIRED")
        if (!runtime) throw Error("LOGINOM_SESSION_UNAVAILABLE")
        const actual = decodeBinding(await runtime.request("session-completion-options"))
        if (Option.isNone(actual) || !same(actual.value, request.binding))
          throw Error("LOGINOM_SESSION_COMPLETION_CONFLICT")
        const recoveryId = await input.journal.begin(
          request.binding.chat,
          request.binding.generation,
          "session-completion",
        )
        await input.journal.settle(recoveryId, false)
        const record = {
          recoveryId,
          receipt: {
            version: 1 as const,
            completionId: request.completionId,
            binding: request.binding,
            status: "UNKNOWN" as const,
            packageClosed: false,
            loggedOut: false,
            reason: "COMPLETION_UNCONFIRMED",
          },
        }
        await save(record)
        const result = await runtime.request("session-finish", request, 30000).catch(() => undefined)
        return accept(record, result)
      } finally {
        active = false
      }
    },
  }
}
