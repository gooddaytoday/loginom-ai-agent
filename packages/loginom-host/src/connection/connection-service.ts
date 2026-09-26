import { randomUUID } from "node:crypto"
import { Option, Schema } from "effect"
import { Loginom } from "@loginom-ai-agent/schema/loginom"
import { Product } from "@loginom-ai-agent/product"
import { connectionStore, type ActiveConnection } from "./connection-store"
import type { recoveryStore } from "./recovery-store"

export type RuntimeHandle = { close(): Promise<void>; reset?(): Promise<void> }
export type ConnectionRuntime = {
  check(candidate: ActiveConnection): Promise<void>
  prepare(candidate: ActiveConnection): Promise<RuntimeHandle>
}
const decodeCandidate = Schema.decodeUnknownOption(Loginom.Candidate)

export async function connectionService(
  store: ReturnType<typeof connectionStore>,
  runtime: ConnectionRuntime,
  recovery?: Pick<Awaited<ReturnType<typeof recoveryStore>>, "pending" | "acknowledge"> & {
    mode?: "strict" | "advisory"
  },
) {
  const state: {
    active?: ActiveConnection
    handle?: RuntimeHandle
    revision: number
    generation: number
    pending?: ActiveConnection
    phase: Loginom.View["state"]
    applying?: Promise<void>
    failure?: string
    writing?: boolean
    closing?: boolean
    recovering?: Promise<void>
  } = { revision: 0, generation: 0, phase: "unconfigured" }
  const checks = new Set<Promise<void>>()
  const validations = new Map<
    string,
    { candidate: ActiveConnection; expiresAt: number; timer: ReturnType<typeof setTimeout> }
  >()
  const leases = new Map<string, { generation: number; recovery: boolean; active: boolean }>()
  state.active = await store.read().catch(() => {
    state.phase = "recoverable-error"
    return undefined
  })
  state.revision = state.active?.revision ?? 0
  const pending = await store.pending().catch(() => {
    state.phase = "recoverable-error"
    state.failure = "LOGINOM_STORE_READ_FAILED"
    return undefined
  })
  if (pending && pending.generation > (state.active?.generation ?? 0)) {
    state.pending = pending
    state.revision = pending.revision
  }
  state.generation = Math.max(
    state.active?.generation ?? 0,
    pending?.generation ?? 0,
    await store.latestGeneration().catch(() => {
      state.phase = "recoverable-error"
      return 0
    }),
  )
  const restored = state.pending ?? state.active
  if (restored && isLegacyDefaultUrl(restored.url) && state.phase !== "recoverable-error") {
    // Keep old generations immutable and use the normal durable activation path.
    // A pending user edit takes precedence over the previously active connection.
    const migrated = {
      ...restored,
      url: Product.connection.url,
      generation: state.generation + 1,
      revision: state.revision + 1,
    }
    await store.savePending(migrated)
    state.pending = migrated
    state.generation = migrated.generation
    state.revision = migrated.revision
  }
  if (state.active && !(state.pending && isLegacyDefaultUrl(state.active.url))) {
    state.phase = "starting"
    state.applying = runtime
      .prepare(state.active)
      .then(
        (handle) => {
          state.handle = handle
          state.phase = state.pending ? "pending" : "ready"
        },
        () => {
          state.phase = "recoverable-error"
        },
      )
      .finally(() => {
        state.applying = undefined
        progress()
      })
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
      url: settingsAddress(current?.url ?? Product.connection.url),
      username: current?.username ?? Product.connection.username,
      folder: `/${current?.username ?? Product.connection.username}`,
      hasApiKey: !!current?.apiKey,
      hasPassword: !!current?.password,
      recoveryMode: recovery?.mode ?? "advisory",
      state:
        recovery?.pending().length || state.failure === "LOGINOM_STORE_READ_FAILED" ? "recoverable-error" : state.phase,
      ...(recovery?.pending().length ? { recoveries: recovery.pending() } : {}),
      ...(state.failure ? { failure: state.failure } : {}),
    }
  }
  function progress() {
    if (state.closing || !state.pending || leases.size || state.applying || state.writing || recovery?.pending().length)
      return
    const candidate = state.pending
    state.phase = "starting"
    state.applying = (async () => {
      const prepared = await runtime.prepare(candidate).catch(() => {
        state.failure = "LOGINOM_RUNTIME_START_FAILED"
        return undefined
      })
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
      const committed = await store
        .staged(candidate.generation)
        .then((previous) => {
          if (!previous) return store.stage(candidate)
          if (
            previous.revision !== candidate.revision ||
            previous.url !== candidate.url ||
            previous.username !== candidate.username ||
            previous.apiKey !== candidate.apiKey ||
            previous.password !== candidate.password
          )
            throw Error("LOGINOM_GENERATION_CONFLICT")
        })
        .then(() => store.activate(candidate.generation))
        .then(
          () => true,
          async () => {
            // A directory fsync can fail after rename has already changed the active pointer.
            // Keep the live runtime aligned with that pointer; report the durability failure.
            state.failure = "LOGINOM_STORE_WRITE_FAILED"
            const persisted = await store.read().catch(() => undefined)
            return (
              persisted?.generation === candidate.generation &&
              persisted.revision === candidate.revision &&
              persisted.url === candidate.url &&
              persisted.username === candidate.username &&
              persisted.apiKey === candidate.apiKey &&
              persisted.password === candidate.password
            )
          },
        )
      if (!committed) {
        state.failure = "LOGINOM_STORE_WRITE_FAILED"
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
      await store.clearPending().catch(() => {
        state.failure = "LOGINOM_STORE_WRITE_FAILED"
      })
      await previous?.close().catch(() => undefined)
    })().finally(() => {
      state.applying = undefined
      progress()
    })
  }
  const api: Loginom.API = {
    async acknowledgeRecovery(input) {
      if (state.closing) throw Error("LOGINOM_HOST_CLOSED")
      if (input.revision !== state.revision) throw Error("LOGINOM_REVISION_CONFLICT")
      if (state.applying || state.writing) throw Error("LOGINOM_APPLICATION_PENDING")
      if ([...leases.values()].some((lease) => lease.active)) throw Error("LOGINOM_RECOVERY_BUSY")
      if (!recovery) throw Error("LOGINOM_RECOVERY_UNAVAILABLE")
      const ids = recovery.pending()
      if (
        ids.length !== input.ids.length ||
        new Set(input.ids).size !== ids.length ||
        input.ids.some((id) => !ids.includes(id))
      )
        throw Error("LOGINOM_RECOVERY_CONFLICT")
      state.writing = true
      state.recovering = (async () => {
        await state.handle?.reset?.()
        if (state.closing) throw Error("LOGINOM_HOST_CLOSED")
        await recovery.acknowledge(input.ids)
        leases.clear()
      })()
      try {
        await state.recovering
      } finally {
        state.recovering = undefined
        state.writing = false
      }
      clearValidations()
      progress()
      return view()
    },
    async read() {
      return view()
    },
    async status() {
      return view()
    },
    async check(input) {
      if (state.closing) throw new Error("LOGINOM_HOST_CLOSED")
      const decoded = decodeCandidate(input)
      if (Option.isNone(decoded)) throw new Error("LOGINOM_CANDIDATE_INVALID")
      const candidate = decoded.value
      if (candidate.revision !== state.revision) throw new Error("LOGINOM_REVISION_CONFLICT")
      if (state.applying || state.writing) throw new Error("LOGINOM_APPLICATION_PENDING")
      validateAddress(candidate.url, candidate.username)
      const apiKey =
        candidate.apiKey.operation === "preserve" ? (state.pending ?? state.active)?.apiKey : candidate.apiKey.value
      if (!apiKey) throw new Error("LOGINOM_API_KEY_REQUIRED")
      const password =
        candidate.password.operation === "preserve"
          ? ((state.pending ?? state.active)?.password ?? "")
          : candidate.password.operation === "empty"
            ? ""
            : candidate.password.value
      const record = {
        generation: state.generation + 1,
        revision: state.revision + 1,
        url: settingsAddress(candidate.url),
        username: candidate.username,
        apiKey,
        password,
      }
      const checking = Promise.resolve().then(() => {
        if (state.closing) throw Error("LOGINOM_HOST_CLOSED")
        return runtime.check(record)
      })
      checks.add(checking)
      await checking
        .catch((error: unknown) => {
          const code =
            error instanceof Error &&
            [
              "LOGINOM_HOST_CLOSED",
              "LOGINOM_KNOWLEDGE_AUTH_FAILED",
              "LOGINOM_KNOWLEDGE_UNAVAILABLE",
              "LOGINOM_LOGIN_REJECTED",
              "LOGINOM_ACCOUNT_MISMATCH",
              "LOGINOM_LOGIN_UNAVAILABLE",
              "LOGINOM_BROWSER_START_FAILED",
            ].includes(error.message)
              ? error.message
              : "LOGINOM_CONNECTION_CHECK_FAILED"
          throw new Error(code)
        })
        .finally(() => checks.delete(checking))
      if (state.closing) throw new Error("LOGINOM_HOST_CLOSED")
      if (candidate.revision !== state.revision || state.applying || state.writing)
        throw new Error("LOGINOM_REVISION_CONFLICT")
      const validationId = randomUUID()
      const expiresAt = Date.now() + 5 * 60_000
      validations.forEach((entry, key) => {
        if (entry.expiresAt <= Date.now()) validations.delete(key)
      })
      const timer = setTimeout(() => validations.delete(validationId), 5 * 60_000)
      timer.unref()
      validations.set(validationId, { candidate: record, expiresAt, timer })
      return { validationId, expiresAt }
    },
    async save(input) {
      if (state.closing) throw new Error("LOGINOM_HOST_CLOSED")
      if (input.revision !== state.revision) throw new Error("LOGINOM_REVISION_CONFLICT")
      if (state.applying || state.writing) throw new Error("LOGINOM_APPLICATION_PENDING")
      const validation = validations.get(input.validationId)
      if (!validation || validation.expiresAt <= Date.now()) throw new Error("LOGINOM_VALIDATION_EXPIRED")
      clearValidations()
      state.writing = true
      const candidate = { ...validation.candidate, generation: state.generation + 1, revision: state.revision + 1 }
      try {
        await store.savePending(candidate)
      } finally {
        state.writing = false
      }
      state.failure = undefined
      state.generation = candidate.generation
      state.revision = candidate.revision
      state.pending = candidate
      state.phase = "pending"
      progress()
      return view()
    },
    async cancelPending(input) {
      if (state.closing) throw new Error("LOGINOM_HOST_CLOSED")
      if (input.revision !== state.revision) throw new Error("LOGINOM_REVISION_CONFLICT")
      // Once a filesystem commit begins, cancellation cannot race the active pointer.
      if (state.applying || state.writing) throw new Error("LOGINOM_APPLICATION_COMMITTING")
      if (!state.pending) return view()
      state.writing = true
      try {
        await store.clearPending()
      } finally {
        state.writing = false
      }
      state.pending = undefined
      state.revision++
      clearValidations()
      state.phase = state.handle ? "ready" : state.active ? "recoverable-error" : "unconfigured"
      return view()
    },
  }
  progress()
  return {
    api,
    idle: () =>
      !checks.size &&
      !state.closing &&
      !state.applying &&
      !state.writing &&
      ![...leases.values()].some((lease) => lease.active),
    acquire(run: string) {
      if (
        state.closing ||
        state.pending ||
        state.writing ||
        recovery?.pending().length ||
        state.failure === "LOGINOM_STORE_READ_FAILED" ||
        state.phase !== "ready" ||
        !state.active ||
        leases.has(run)
      )
        return
      const lease = { generation: state.active.generation, recovery: false, active: true }
      leases.set(run, lease)
      return {
        generation: lease.generation,
        // Uncertain effects outlive the model drain. Only reconciliation releases recovery.
        holdRecovery() {
          if (leases.get(run) === lease) lease.recovery = true
        },
        release() {
          if (leases.get(run) !== lease) return
          lease.active = false
          if (lease.recovery) return
          leases.delete(run)
          progress()
        },
        reconciled() {
          if (leases.get(run) !== lease) return
          lease.recovery = false
          if (lease.active) return
          leases.delete(run)
          progress()
        },
      }
    },
    async settled() {
      while (state.applying) await state.applying
    },
    async close() {
      state.closing = true
      state.pending = undefined
      clearValidations()
      await state.recovering?.catch(() => undefined)
      await state.applying
      await Promise.allSettled([...checks])
      await state.handle?.close()
      state.handle = undefined
      state.phase = state.active ? "recoverable-error" : "unconfigured"
    },
  }
}

// The browser adds its automation flag privately; old saved URLs may contain it.
function settingsAddress(value: string) {
  const url = new URL(value)
  if (!url.searchParams.has("testable")) return value
  url.searchParams.delete("testable")
  return url.href
}

function isLegacyDefaultUrl(url: string) {
  return url === "http://logi-test-plan.bg.local/app/" || url === "http://logi-test-plan.bg.local/app"
}

function validateAddress(url: string, username: string) {
  if (!URL.canParse(url)) throw new Error("LOGINOM_URL_INVALID")
  const parsed = new URL(url)
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new Error("LOGINOM_URL_INVALID")
  if (!username || username === "." || username === ".." || /[\/\\\x00-\x1f\x7f]/.test(username))
    throw new Error("LOGINOM_USERNAME_INVALID")
}
