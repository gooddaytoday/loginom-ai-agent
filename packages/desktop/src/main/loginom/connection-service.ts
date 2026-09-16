import { randomUUID } from "node:crypto"
import { Option, Schema } from "effect"
import { Loginom } from "@loginom-ai-agent/schema/loginom"
import { Product } from "@loginom-ai-agent/product"
import { connectionStore, type ActiveConnection } from "./connection-store"

export type RuntimeHandle = { close(): Promise<void> }
export type ConnectionRuntime = {
  check(candidate: ActiveConnection): Promise<void>
  prepare(candidate: ActiveConnection): Promise<RuntimeHandle>
}
const decodeCandidate = Schema.decodeUnknownOption(Loginom.Candidate)

export async function connectionService(store: ReturnType<typeof connectionStore>, runtime: ConnectionRuntime) {
  const state: {
    active?: ActiveConnection
    handle?: RuntimeHandle
    revision: number
    generation: number
    pending?: ActiveConnection
    phase: Loginom.View["state"]
    applying?: Promise<void>
  } = { revision: 0, generation: 0, phase: "unconfigured" }
  const validations = new Map<string, { candidate: ActiveConnection; expiresAt: number; timer: ReturnType<typeof setTimeout> }>()
  const leases = new Map<string, { generation: number; recovery: boolean; active: boolean }>()
  state.active = await store.read()
  state.revision = state.active?.revision ?? 0
  state.generation = Math.max(state.active?.generation ?? 0, await store.latestGeneration())
  if (state.active) {
    state.phase = "starting"
    await runtime.prepare(state.active).then((handle) => {
      state.handle = handle
      state.phase = "ready"
    }, () => { state.phase = "recoverable-error" })
  }

  function clearValidations() {
    validations.forEach((entry) => clearTimeout(entry.timer))
    validations.clear()
  }
  function view(): Loginom.View {
    const current = state.active
    return {
      revision: state.revision,
      generation: current?.generation ?? 0,
      url: current?.url ?? Product.connection.url,
      username: current?.username ?? Product.connection.username,
      folder: `/${current?.username ?? Product.connection.username}`,
      hasApiKey: !!current?.apiKey,
      hasPassword: !!current?.password,
      state: state.phase,
    }
  }
  function progress() {
    if (!state.pending || leases.size || state.applying) return
    const candidate = state.pending
    state.phase = "starting"
    state.applying = (async () => {
      const prepared = await runtime.prepare(candidate).catch(() => undefined)
      if (!prepared) {
        if (state.pending === candidate) {
          state.pending = undefined
          state.phase = state.handle ? "ready" : "recoverable-error"
        }
        return
      }
      if (state.pending !== candidate) {
        await prepared.close().catch(() => undefined)
        return
      }
      const committed = await store.stage(candidate).then(() => store.activate(candidate.generation)).then(() => true, () => false)
      if (!committed) {
        await prepared.close().catch(() => undefined)
        state.pending = undefined
        state.phase = state.handle ? "ready" : "recoverable-error"
        return
      }
      const previous = state.handle
      state.active = candidate
      state.handle = prepared
      state.pending = undefined
      state.phase = "ready"
      await previous?.close().catch(() => undefined)
    })().finally(() => {
      state.applying = undefined
      progress()
    })
  }
  const api: Loginom.API = {
    async read() { return view() },
    async status() { return view() },
    async check(input) {
      const decoded = decodeCandidate(input)
      if (Option.isNone(decoded)) throw new Error("LOGINOM_CANDIDATE_INVALID")
      const candidate = decoded.value
      if (candidate.revision !== state.revision) throw new Error("LOGINOM_REVISION_CONFLICT")
      if (state.pending || state.applying) throw new Error("LOGINOM_APPLICATION_PENDING")
      validateAddress(candidate.url, candidate.username)
      const apiKey = candidate.apiKey.operation === "preserve" ? state.active?.apiKey : candidate.apiKey.value
      if (!apiKey) throw new Error("LOGINOM_API_KEY_REQUIRED")
      const password = candidate.password.operation === "preserve" ? state.active?.password ?? ""
        : candidate.password.operation === "empty" ? "" : candidate.password.value
      const record = { generation: state.generation + 1, revision: state.revision + 1, url: candidate.url, username: candidate.username, apiKey, password }
      await runtime.check(record).catch(() => { throw new Error("LOGINOM_CONNECTION_CHECK_FAILED") })
      if (candidate.revision !== state.revision || state.pending || state.applying) throw new Error("LOGINOM_REVISION_CONFLICT")
      const validationId = randomUUID()
      const expiresAt = Date.now() + 5 * 60_000
      validations.forEach((entry, key) => { if (entry.expiresAt <= Date.now()) validations.delete(key) })
      const timer = setTimeout(() => validations.delete(validationId), 5 * 60_000)
      timer.unref()
      validations.set(validationId, { candidate: record, expiresAt, timer })
      return { validationId, expiresAt }
    },
    async save(input) {
      if (input.revision !== state.revision) throw new Error("LOGINOM_REVISION_CONFLICT")
      if (state.pending || state.applying) throw new Error("LOGINOM_APPLICATION_PENDING")
      const validation = validations.get(input.validationId)
      if (!validation || validation.expiresAt <= Date.now()) throw new Error("LOGINOM_VALIDATION_EXPIRED")
      clearValidations()
      state.pending = { ...validation.candidate, generation: ++state.generation, revision: ++state.revision }
      state.phase = "pending"
      progress()
      return view()
    },
    async cancelPending(input) {
      if (input.revision !== state.revision) throw new Error("LOGINOM_REVISION_CONFLICT")
      // Once a filesystem commit begins, cancellation cannot race the active pointer.
      if (state.applying) throw new Error("LOGINOM_APPLICATION_COMMITTING")
      if (!state.pending) return view()
      state.pending = undefined
      state.revision++
      clearValidations()
      state.phase = state.handle ? "ready" : state.active ? "recoverable-error" : "unconfigured"
      return view()
    },
  }
  return {
    api,
    acquire(run: string) {
      if (state.pending || state.phase !== "ready" || !state.active || leases.has(run)) return
      const lease = { generation: state.active.generation, recovery: false, active: true }
      leases.set(run, lease)
      return {
        generation: lease.generation,
        // Uncertain effects outlive the model drain. Only reconciliation releases recovery.
        holdRecovery() { if (leases.get(run) === lease) lease.recovery = true },
        release() { if (leases.get(run) !== lease) return; lease.active = false; if (lease.recovery) return; leases.delete(run); progress() },
        reconciled() { if (leases.get(run) !== lease) return; lease.recovery = false; if (lease.active) return; leases.delete(run); progress() },
      }
    },
    async settled() { await state.applying },
    async close() {
      state.pending = undefined
      clearValidations()
      await state.applying
      await state.handle?.close()
      state.handle = undefined
      state.phase = state.active ? "recoverable-error" : "unconfigured"
    },
  }
}

function validateAddress(url: string, username: string) {
  if (!URL.canParse(url)) throw new Error("LOGINOM_URL_INVALID")
  const parsed = new URL(url)
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("LOGINOM_URL_INVALID")
  if (!username || username === "." || username === ".." || /[\/\\\x00-\x1f\x7f]/.test(username)) throw new Error("LOGINOM_USERNAME_INVALID")
}
