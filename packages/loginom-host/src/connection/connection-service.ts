import { randomUUID } from "node:crypto"
import { addAbortListener } from "node:events"
import { Option, Schema } from "effect"
import { Loginom } from "../loginom"
import { Address, settingsAddress } from "../settings-rpc"
import { Product } from "@loginom-ai-agent/product"
import { connectionStore, type ActiveConnection } from "./connection-store"
import type { recoveryStore } from "./recovery-store"

export type RuntimeHandle = {
  close(): Promise<void>
  reset?(): Promise<void>
  ready?: Promise<void>
  beforeActivate?(): void
}
export type ConnectionRuntime = {
  check(candidate: ActiveConnection, signal?: AbortSignal, settings?: boolean): Promise<void | Loginom.BrowserStatus>
  prepare(candidate: ActiveConnection, switchSignal?: AbortSignal): Promise<RuntimeHandle>
}
const decodeCandidate = Schema.decodeUnknownOption(Loginom.Candidate)

function runtimeStartFailure(error: unknown) {
  return error instanceof Error && error.message === "LOGINOM_RUNTIME_TIMEOUT"
    ? error.message
    : "LOGINOM_RUNTIME_START_FAILED"
}

export async function connectionService(
  store: ReturnType<typeof connectionStore>,
  runtime: ConnectionRuntime,
  recovery?: Pick<Awaited<ReturnType<typeof recoveryStore>>, "pending" | "acknowledge">,
  onApplication?: Loginom.ConnectionApplicationListener,
) {
  // Both Desktop and CLI cross this boundary before preparing any runtime.
  await store.initialize()
  const state: {
    active?: ActiveConnection
    handle?: RuntimeHandle
    revision: number
    generation: number
    setupRequired?: true
    pending?: ActiveConnection
    applied?: true
    browser: Loginom.BrowserStatus
    pendingBrowser?: Loginom.BrowserStatus
    phase: Loginom.View["state"]
    readiness: "starting" | "ready" | "recoverable-error"
    loading?: Promise<void>
    applying?: Promise<void>
    failure?: string
    runtimeFailure?: Loginom.View["runtimeFailure"]
    cleanupFailure?: Loginom.View["cleanupFailure"]
    pendingNotice?: string
    writing?: boolean
    acknowledging?: Promise<void>
    closing?: boolean
    recovering?: Promise<void>
    checkCleanupFailed?: boolean
  } = { revision: 0, generation: 0, phase: "unconfigured", readiness: "starting", browser: { state: "unknown" } }
  const validations = new Map<
    string,
    {
      candidate: ActiveConnection
      browser: Loginom.BrowserStatus
      settings: boolean
      expiresAt: number
      timer: ReturnType<typeof setTimeout>
    }
  >()
  const leases = new Map<string, { generation: number; task: string; recovery: boolean; active: boolean }>()
  const turns = new Map<string, string>()
  let applyAfter = new Map<string, string>()
  const checks = new Map<AbortController, Promise<void | Loginom.BrowserStatus>>()
  const switching = new AbortController()
  function loadProfile() {
    if (state.loading) return state.loading
    state.loading = (async (): Promise<{
      active?: ActiveConnection
      pending?: ActiveConnection
      latest: number
      failure?: string
      cleanupFailure?: Loginom.View["cleanupFailure"]
      pendingNotice?: string
    }> => {
      const active = await store.read()
      const latest = await store.latestGeneration()
      const activeGeneration = active?.generation ?? 0
      const saved = await store.pendingForStartup(activeGeneration).catch(() => "unavailable" as const)
      if (saved === "unavailable") return { active, latest, failure: "LOGINOM_PENDING_RESUME_FAILED" }
      if (saved && "interruptedGeneration" in saved) {
        const notApplied = saved.interruptedGeneration > activeGeneration
        const { pendingNotice, cleanupFailure } = await discardPending(notApplied ? activeGeneration : undefined)
        return {
          active,
          latest,
          pendingNotice,
          failure: notApplied ? "LOGINOM_PENDING_NOT_APPLIED" : cleanupFailure,
          cleanupFailure: notApplied ? cleanupFailure : undefined,
        }
      }
      if (saved) return { active, latest, pending: saved }
      return store.pendingDiscarded(activeGeneration).then(
        (pendingNotice) => ({
          active,
          latest,
          pendingNotice,
          failure: pendingNotice ? "LOGINOM_PENDING_NOT_APPLIED" : undefined,
        }),
        () => ({ active, latest, failure: "LOGINOM_PENDING_RESUME_FAILED" }),
      )
    })()
      .then(
        ({ active, pending, latest, failure, cleanupFailure, pendingNotice }) => {
          if (state.closing) return
          state.failure = failure
          state.cleanupFailure = cleanupFailure
          state.pendingNotice = pendingNotice
          state.active = active
          state.setupRequired = active ? undefined : true
          state.pending = pending
          state.revision = state.pending?.revision ?? active?.revision ?? 0
          state.generation = Math.max(active?.generation ?? 0, pending?.generation ?? 0, latest)
          state.phase = active ? "starting" : failure ? "recoverable-error" : "unconfigured"
          if (!active) return progress()
          state.applying = runtime
            .prepare(active)
            .then(
              (handle) => {
                state.handle = handle
                observeReadiness(handle)
              },
              (error: unknown) => {
                state.runtimeFailure = runtimeStartFailure(error)
                state.readiness = "recoverable-error"
                state.phase = "recoverable-error"
              },
            )
            .finally(() => {
              state.applying = undefined
              progress()
            })
        },
        () => {
          state.phase = "recoverable-error"
          state.failure = "LOGINOM_STORE_READ_FAILED"
        },
      )
      .finally(() => {
        state.loading = undefined
      })
    return state.loading
  }

  function requireProfile() {
    if (state.closing) throw Error("LOGINOM_HOST_CLOSED")
    if (state.failure === "LOGINOM_STORE_READ_FAILED") throw Error(state.failure)
  }

  function finishApplication(candidate: ActiveConnection, outcome: "applied" | "failed") {
    if (state.closing || state.revision !== candidate.revision) return
    if (outcome === "applied") state.applied = true
    onApplication?.(outcome, { revision: candidate.revision, generation: candidate.generation })
  }

  function observeReadiness(handle: RuntimeHandle, candidate?: ActiveConnection) {
    const ready = () => {
      state.readiness = "ready"
      state.runtimeFailure = undefined
      state.phase = state.pending ? "pending" : "ready"
      if (!state.failure) state.setupRequired = undefined
      if (candidate) finishApplication(candidate, "applied")
      else if (state.active)
        onApplication?.("ready", { revision: state.revision, generation: state.active.generation })
    }
    if (!handle.ready) return ready()
    state.readiness = "starting"
    state.phase = state.pending ? "pending" : "starting"
    void handle.ready.then(
      () => {
        if (state.closing || state.handle !== handle) return
        ready()
      },
      (error: unknown) => {
        if (state.closing || state.handle !== handle) return
        state.readiness = "recoverable-error"
        state.runtimeFailure = runtimeStartFailure(error)
        state.phase = state.pending ? "pending" : "recoverable-error"
        if (candidate) finishApplication(candidate, "failed")
      },
    )
  }

  function clearValidations() {
    validations.forEach((entry) => clearTimeout(entry.timer))
    validations.clear()
  }
  function beginClose() {
    if (state.closing) return
    state.closing = true
    switching.abort(Error("LOGINOM_HOST_CLOSED"))
    clearValidations()
    for (const controller of checks.keys()) controller.abort(Error("LOGINOM_HOST_CLOSED"))
  }
  function view(): Loginom.View {
    const current = state.active
    const failure = state.failure ?? state.runtimeFailure
    let application: Loginom.View["application"]
    if (state.pending) {
      const tasks = new Set(applyAfter.values())
      for (const lease of leases.values()) if (lease.active) tasks.add(lease.task)
      application = { state: "pending", tasks: tasks.size }
    } else if (state.applied) application = { state: "applied" }
    return {
      revision: state.revision,
      generation: current?.generation ?? 0,
      ...(state.setupRequired ? { setupRequired: state.setupRequired } : {}),
      url: legacyAddress(current?.url ?? Product.connection.url),
      username: current?.username ?? Product.connection.username,
      folder: `/${current?.username ?? Product.connection.username}`,
      hasPassword: !!current?.password,
      browser: { ...state.browser },
      state: recovery?.pending().length ? "recoverable-error" : state.phase,
      ...(application ? { application } : {}),
      ...(recovery?.pending().length ? { recoveries: recovery.pending() } : {}),
      ...(failure ? { failure } : {}),
      ...(state.runtimeFailure ? { runtimeFailure: state.runtimeFailure } : {}),
      ...(state.cleanupFailure ? { cleanupFailure: state.cleanupFailure } : {}),
      ...(state.pendingNotice ? { pendingNotice: state.pendingNotice } : {}),
    }
  }
  async function discardPending(rememberFor?: number) {
    const notice = rememberFor === undefined ? undefined : { activeGeneration: rememberFor, id: randomUUID() }
    try {
      // Leave the guarded request on disk until its outcome survives another restart.
      if (notice) await store.recordPendingDiscard(notice)
      await store.clearPending()
      return { pendingNotice: notice?.id }
    } catch {
      return { pendingNotice: notice?.id, cleanupFailure: "LOGINOM_PENDING_CLEAR_FAILED" as const }
    }
  }
  async function failPending(candidate: ActiveConnection, failure: string) {
    const { pendingNotice, cleanupFailure } = await discardPending(state.active?.generation ?? 0)
    state.failure = failure
    state.cleanupFailure = cleanupFailure
    state.pendingNotice = pendingNotice
    state.pending = undefined
    state.pendingBrowser = undefined
    state.phase = state.handle ? state.readiness : "recoverable-error"
    finishApplication(candidate, "failed")
  }
  function progress() {
    if (
      state.closing || !state.pending || leases.size || applyAfter.size || state.applying || state.writing || state.acknowledging ||
      recovery?.pending().length
    ) return
    const candidate = state.pending
    state.phase = "starting"
    state.applying = (async () => {
      const signal = state.active ? switching.signal : undefined
      let prepared: RuntimeHandle | undefined
      try {
        prepared = await runtime.prepare(candidate, signal)
        if (signal && prepared.ready) {
          // A replacement must serve its catalog before it can retire the active runtime.
          const aborted = Promise.withResolvers<never>()
          const listener = addAbortListener(signal, () => aborted.reject(signal.reason))
          try {
            await Promise.race([prepared.ready, aborted.promise])
          } finally {
            listener[Symbol.dispose]()
          }
        }
      } catch (error) {
        const cancelled =
          signal?.aborted && (error === signal.reason || (error instanceof Error && error.cause === signal.reason))
        await prepared?.close().catch(() => undefined)
        if (!cancelled) await failPending(candidate, runtimeStartFailure(error))
        return
      }
      const next = prepared
      // First setup can commit with the catalog still loading in the background.
      void next.ready?.catch(() => undefined)
      if (state.closing || state.pending !== candidate) {
        await next.close().catch(() => undefined)
        return
      }
      let durable = true
      const committed = await store
        .staged(candidate.generation)
        .then((previous) => {
          if (!previous) return store.stage(candidate)
          if (
            previous.revision !== candidate.revision ||
            previous.url !== candidate.url ||
            previous.urlSource !== candidate.urlSource ||
            previous.username !== candidate.username ||
            previous.apiKey !== candidate.apiKey ||
            previous.password !== candidate.password
          )
            throw Error("LOGINOM_GENERATION_CONFLICT")
        })
        .then(() => {
          next.beforeActivate?.()
          return store.activate(candidate.generation)
        })
        .then(
          () => true,
          async () => {
            // A directory fsync can fail after rename has already changed the active pointer.
            // Keep the live runtime aligned with that pointer; report the durability failure.
            durable = false
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
        await next.close().catch(() => undefined)
        await failPending(candidate, "LOGINOM_STORE_WRITE_FAILED")
        return
      }
      const previous = state.handle
      state.active = candidate
      state.browser = state.pendingBrowser ?? { state: "unknown" }
      state.pendingBrowser = undefined
      state.handle = next
      state.runtimeFailure = undefined
      state.pending = undefined
      // Finish the store writes before a window can observe successful activation.
      await store.clearPending().catch(() => {
        state.cleanupFailure = "LOGINOM_PENDING_CLEAR_FAILED"
        durable = false
      })
      state.failure = durable ? undefined : "LOGINOM_STORE_WRITE_FAILED"
      observeReadiness(next, durable ? candidate : undefined)
      if (!durable) finishApplication(candidate, "failed")
      await previous?.close().catch(() => undefined)
    })().finally(() => {
      state.applying = undefined
      progress()
    })
  }
  const api: Loginom.API = {
    async acknowledgeRecovery(input) {
      requireProfile()
      if (input.revision !== state.revision) throw Error("LOGINOM_REVISION_CONFLICT")
      if (state.applying || state.writing || state.acknowledging) throw Error("LOGINOM_APPLICATION_PENDING")
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
      if (state.closing) throw Error("LOGINOM_HOST_CLOSED")
      if (state.failure === "LOGINOM_STORE_READ_FAILED") await loadProfile()
      requireProfile()
      return view()
    },
    async status() {
      return view()
    },
    async acknowledgePendingNotice({ id }) {
      requireProfile()
      if (state.pendingNotice !== id) return view()
      if (state.writing || state.acknowledging) throw Error("LOGINOM_APPLICATION_PENDING")
      state.acknowledging = (async () => {
        // A guarded request left on disk would regenerate the notice at the next start.
        if (state.cleanupFailure) await store.clearPending()
        await store.clearPendingDiscard()
        state.pendingNotice = undefined
        state.cleanupFailure = undefined
        state.failure = undefined
        if (!state.active) state.phase = "unconfigured"
      })()
      try {
        await state.acknowledging
      } catch (cause) {
        throw Error("LOGINOM_STORE_WRITE_FAILED", { cause })
      } finally {
        state.acknowledging = undefined
        progress()
      }
      return view()
    },
    async check(input, settings = false, signal) {
      signal?.throwIfAborted()
      requireProfile()
      const decoded = decodeCandidate(input)
      if (Option.isNone(decoded)) throw new Error("LOGINOM_CANDIDATE_INVALID")
      const candidate = decoded.value
      if (candidate.revision !== state.revision) throw new Error("LOGINOM_REVISION_CONFLICT")
      if (state.applying || state.writing) throw new Error("LOGINOM_APPLICATION_PENDING")
      validateAddress(candidate.url, candidate.username)
      if (settings && !Schema.is(Address)(candidate.url)) throw new Error("LOGINOM_URL_INVALID")
      const url = settings ? settingsAddress(candidate.url) : legacyAddress(candidate.url)
      const stored = state.pending ?? state.active
      if (
        settings &&
        candidate.password.operation === "preserve" &&
        (!stored?.password ||
          stored.username !== candidate.username ||
          settingsAddress(stored.url) !== url)
      )
        throw new Error("LOGINOM_PASSWORD_REQUIRED")
      const password =
        candidate.password.operation === "preserve"
          ? (stored?.password ?? "")
          : candidate.password.operation === "empty"
            ? ""
            : candidate.password.value
      const record = {
        generation: state.generation + 1,
        revision: state.revision + 1,
        url,
        // Retain private provenance for the validated user choice. Startup
        // preserves saved URLs independently of this marker.
        urlSource: "explicit" as const,
        username: candidate.username,
        // The knowledge service uses the built-in key; a key sent by older clients is ignored.
        apiKey: "",
        password,
      }
      const controller = new AbortController()
      const checkSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
      const checking = Promise.resolve().then(() => runtime.check(record, checkSignal, settings))
      checks.set(controller, checking)
      const browser = (await checking
        .catch((error: unknown) => {
          if (error instanceof Error && error.message === "LOGINOM_RUNTIME_CLEANUP_FAILED")
            state.checkCleanupFailed = true
          checkSignal.throwIfAborted()
          const code =
            error instanceof Error &&
            [
              "LOGINOM_KNOWLEDGE_AUTH_FAILED",
              "LOGINOM_KNOWLEDGE_UNAVAILABLE",
              "LOGINOM_LOGIN_REJECTED",
              "LOGINOM_ACCOUNT_MISMATCH",
              "LOGINOM_LOGIN_UNAVAILABLE",
              "LOGINOM_BROWSER_START_FAILED",
              "LOGINOM_LOGOUT_UNCONFIRMED",
            ].includes(error.message)
              ? error.message
              : "LOGINOM_CONNECTION_CHECK_FAILED"
          throw new Error(code, { cause: error })
        })
        .finally(() => checks.delete(controller))) ?? { state: "unknown" as const }
      checkSignal.throwIfAborted()
      if (state.closing) throw new Error("LOGINOM_HOST_CLOSED")
      if (candidate.revision !== state.revision || state.applying || state.writing)
        throw new Error("LOGINOM_REVISION_CONFLICT")
      if (
        state.active?.url === record.url &&
        state.active.username === record.username &&
        state.active.password === record.password
      )
        state.browser = { ...browser }
      if (settings && browser.state !== "verified")
        throw new Error(browser.state === "failed" ? browser.failure : "LOGINOM_CONNECTION_CHECK_FAILED")
      const validationId = randomUUID()
      const expiresAt = Date.now() + 5 * 60_000
      validations.forEach((entry, key) => {
        if (entry.expiresAt <= Date.now()) validations.delete(key)
      })
      const timer = setTimeout(() => validations.delete(validationId), 5 * 60_000)
      timer.unref()
      validations.set(validationId, { candidate: record, browser, settings, expiresAt, timer })
      return { validationId, expiresAt, browser: { ...browser } }
    },
    async save(input, settings = false) {
      requireProfile()
      if (input.revision !== state.revision) throw new Error("LOGINOM_REVISION_CONFLICT")
      if (state.applying || state.writing || state.acknowledging) throw new Error("LOGINOM_APPLICATION_PENDING")
      const validation = validations.get(input.validationId)
      if (!validation || validation.settings !== settings || validation.expiresAt <= Date.now())
        throw new Error("LOGINOM_VALIDATION_EXPIRED")
      clearValidations()
      state.writing = true
      const candidate = { ...validation.candidate, generation: state.generation + 1, revision: state.revision + 1 }
      try {
        await store.savePending(candidate)
      } finally {
        state.writing = false
      }
      state.failure = undefined
      state.cleanupFailure = undefined
      state.pendingNotice = undefined
      state.applied = undefined
      state.generation = candidate.generation
      state.revision = candidate.revision
      state.pending = candidate
      state.pendingBrowser = validation.browser
      state.phase = "pending"
      // Even a turn without a Loginom lease must finish before this generation can activate.
      applyAfter = new Map(turns)
      progress()
      return view()
    },
    async cancelPending(input) {
      requireProfile()
      if (input.revision !== state.revision) throw new Error("LOGINOM_REVISION_CONFLICT")
      // Once a filesystem commit begins, cancellation cannot race the active pointer.
      if (state.applying || state.writing || state.acknowledging) throw new Error("LOGINOM_APPLICATION_COMMITTING")
      if (!state.pending) return view()
      state.writing = true
      try {
        await store.clearPending({ forgetDiscard: true })
      } finally {
        state.writing = false
      }
      state.pending = undefined
      state.pendingBrowser = undefined
      applyAfter.clear()
      state.revision++
      clearValidations()
      state.phase = state.handle ? state.readiness : state.active ? "recoverable-error" : "unconfigured"
      return view()
    },
  }
  await loadProfile()
  return {
    beginClose,
    // Launcher-only update gate. Keep lease activity out of the public settings API.
    updateWorkState() {
      return {
        activeWork: [...leases.values()].some((lease) => lease.active),
        unsettledWork: [...leases.values()].some((lease) => lease.recovery) || Boolean(recovery?.pending().length),
      }
    },
    api,
    turn(id: string, task: string, active: boolean) {
      if (active) turns.set(id, task)
      else {
        turns.delete(id)
        applyAfter.delete(id)
        progress()
      }
    },
    browserStatus(generation: number, browser: Loginom.BrowserStatus) {
      if (state.closing || generation !== state.active?.generation) return
      state.browser = { ...browser }
    },
    acquire(run: string, task = run) {
      if (
        state.closing ||
        state.pending ||
        state.writing ||
        recovery?.pending().length ||
        state.phase !== "ready" ||
        !state.active ||
        leases.has(run)
      )
        return
      const lease = { generation: state.active.generation, task, recovery: false, active: true }
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
      beginClose()
      await state.loading?.catch(() => undefined)
      await Promise.allSettled([...checks.values()])
      clearValidations()
      await state.recovering?.catch(() => undefined)
      await state.acknowledging?.catch(() => undefined)
      await state.applying
      await state.handle?.close()
      // A clean shutdown can hand off a change that was still waiting or cancelled by shutdown.
      const pending = state.pending
      state.pending = undefined
      if (pending && !state.writing && !state.checkCleanupFailed) await store.deferPending(pending).catch(() => undefined)
      state.handle = undefined
      state.phase = state.active ? "recoverable-error" : "unconfigured"
      if (state.checkCleanupFailed) throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
    },
  }
}

// The browser adds its automation flag privately; old saved URLs may contain it.
function legacyAddress(value: string) {
  const url = new URL(value)
  if (!url.searchParams.has("testable")) return value
  url.searchParams.delete("testable")
  return url.href
}

function validateAddress(url: string, username: string) {
  if (!URL.canParse(url)) throw new Error("LOGINOM_URL_INVALID")
  const parsed = new URL(url)
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new Error("LOGINOM_URL_INVALID")
  if (!username || username === "." || username === ".." || /[\/\\\x00-\x1f\x7f]/.test(username))
    throw new Error("LOGINOM_USERNAME_INVALID")
}
