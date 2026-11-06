import { join } from "node:path"
import { Loginom } from "@opencode-ai/schema/loginom"
import type { ActiveConnection } from "./connection/connection-store"
import type { CloudAuth, CloudEndpoints, CallBudget } from "./cloud-auth"
import { RuntimeStartupError, superviseKnowledge } from "./supervisor"
import { knowledgeFailure } from "./errors"

export type KnowledgeSession = {
  admission: Promise<void>
  ensure(input: CallBudget): Promise<void>
  catalog(input: CallBudget): Promise<unknown>
  call(input: { run: string; id: string; name: string; arguments?: unknown }, budget: CallBudget): Promise<unknown>
  interrupt(input: { run: string; id?: string }): Promise<void>
  invalidate(): Promise<void>
  close(): Promise<void>
}
export type KnowledgeSessionOptions = {
  generation: number
  connection: ActiveConnection
  cloud: CloudAuth
  endpoints: CloudEndpoints
  resources: string
  stateDir: string
  environment: NodeJS.ProcessEnv
  signal: AbortSignal
  changed(status: { state: Loginom.HelpState; failure?: string }): void
  selected(): "primary" | "reserve"
  selectReserve(): void
}

export function createKnowledgeSession(options: KnowledgeSessionOptions): KnowledgeSession {
  let child: Awaited<ReturnType<typeof superviseKnowledge>> | undefined
  let childRevision = -1
  let childServer: "primary" | "reserve" = "primary"
  let catalog: unknown
  let loading: Promise<void> | undefined
  let attempt = 0
  let closed = false
  let controller: AbortController | undefined
  let cleanupFailed = false
  let retirement = Promise.resolve()
  // Keep the outcome for late 401 replies already dispatched by this failed child.
  const refreshes = new WeakMap<object, Promise<void>>()
  const admission = Promise.withResolvers<void>()
  // Validation observes ensure; prepare separately observes the local admission outcome.
  void admission.promise.catch(() => {})
  async function invalidate() {
    const invalidation = ++attempt
    catalog = undefined
    const pending = loading
    loading = undefined
    controller?.abort(Error("LOGINOM_CONNECTION_NOT_READY"))
    controller = undefined
    const previous = child
    child = undefined
    retirement = Promise.all([
      retirement.catch(() => {}),
      previous?.close().catch(() => {
        cleanupFailed = true
      }),
      pending?.catch(() => {}),
    ]).then(() => {
      if (cleanupFailed) {
        const failure = Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
        if (invalidation === attempt) admission.reject(failure)
        throw failure
      }
      if ((closed || options.signal.aborted) && invalidation === attempt) admission.reject(Error("LOGINOM_HOST_CLOSED"))
    })
    return retirement
  }
  async function connect(budget: CallBudget, route: { server: "primary" | "reserve" }) {
    await withinBudget(retirement, budget)
    if (closed || options.signal.aborted) {
      admission.reject(Error("LOGINOM_HOST_CLOSED"))
      throw Error("LOGINOM_HOST_CLOSED")
    }
    budget.signal.throwIfAborted()
    if (Date.now() >= budget.deadline) throw Error("LOGINOM_RUNTIME_TIMEOUT")
    if (options.connection.mode === "cloud" && options.selected() === "reserve") route.server = "reserve"
    if (catalog && childServer === route.server && (options.connection.mode === "custom" || childRevision === options.cloud.revision())) return
    if (loading) {
      if (childServer === "reserve") route.server = "reserve"
      await withinBudget(loading, budget)
      return connect(budget, route)
    }
    if (child) { await withinBudget(invalidate(), budget); return connect(budget, route) }
    const server = route.server
    const credentials = options.cloud.credentials()
    const endpoint = options.connection.mode === "custom" ? options.connection.endpoint : options.endpoints[server]
    const apiKey = options.connection.mode === "custom" ? options.connection.apiKey : credentials?.dock[server].apiKey
    if (!endpoint || !apiKey) {
      options.changed({ state: "connection-required" })
      admission.resolve()
      throw Error("LOGINOM_CONNECTION_REQUIRED")
    }
    const currentAttempt = ++attempt
    const revision = options.cloud.revision()
    const current = () =>
      !closed &&
      !options.signal.aborted &&
      currentAttempt === attempt &&
      (options.connection.mode === "custom" || revision === options.cloud.revision())
    options.changed({ state: "starting" })
    const cancellation = new AbortController()
    controller = cancellation
    const signal = AbortSignal.any([
      cancellation.signal,
      options.signal,
      budget.signal,
      AbortSignal.timeout(Math.max(1, budget.deadline - Date.now())),
    ])
    childServer = server
    const pending = (async () => {
      const runtime = await superviseKnowledge(
        {
          node: join(options.resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
          entry: join(options.resources, "runtime/src/knowledge-entry.mjs"),
          stateDir: options.stateDir,
          generation: options.generation,
          deadline: budget.deadline,
          endpoint,
          apiKey,
          environment: options.environment,
        },
        signal,
      )
      if (!current()) {
        await runtime.close().catch(() => {
          cleanupFailed = true
        })
        throw Error("LOGINOM_CONNECTION_NOT_READY")
      }
      child = runtime
      childRevision = revision
      admission.resolve()
      const abort = () => {
        void runtime.close().catch(() => {
          cleanupFailed = true
        })
      }
      signal.addEventListener("abort", abort, { once: true })
      try {
        const result = await runtime.request("list", undefined, Math.max(1, budget.deadline - Date.now()))
        signal.throwIfAborted()
        if (!current()) throw Error("LOGINOM_CONNECTION_NOT_READY")
        catalog = result
        if (options.connection.mode === "cloud" && server === "reserve") options.selectReserve()
        options.changed({ state: "ready" })
      } finally {
        signal.removeEventListener("abort", abort)
      }
    })()
      .catch(async (error: unknown) => {
        if (error instanceof RuntimeStartupError && !error.cleanupConfirmed) cleanupFailed = true
        if (current()) {
          const previous = child
          child = undefined
          await previous?.close().catch(() => {
            cleanupFailed = true
          })
          if (current()) options.changed({ state: "recoverable-error", failure: "LOGINOM_RUNTIME_START_FAILED" })
        }
        const failure = cleanupFailed ? Error("LOGINOM_RUNTIME_CLEANUP_FAILED", { cause: error }) : error
        if (currentAttempt === attempt) admission.reject(failure)
        throw failure
      })
      .finally(() => {
        if (loading === pending) loading = undefined
        if (controller === cancellation) controller = undefined
      })
    loading = pending
    return pending
  }
  async function recover<T>(budget: CallBudget, operation: (route: { server: "primary" | "reserve" }) => Promise<T>, failed?: () => typeof child): Promise<T> {
    const route = { server: options.selected() }
    // Lease/catalog recovery and the read consume the same original operation allowance.
    const recovery = budget.recovery ?? { refreshed: false, switched: false }
    for (;;) {
      budget.signal.throwIfAborted()
      if (closed || options.signal.aborted) throw Error("LOGINOM_HOST_CLOSED")
      if (Date.now() >= budget.deadline) throw Error("LOGINOM_RUNTIME_TIMEOUT")
      try { return await withinBudget(operation(route), budget) }
      catch (error) {
        budget.signal.throwIfAborted()
        if (closed || options.signal.aborted || Date.now() >= budget.deadline || options.connection.mode !== "cloud") throw error
        const failedChild = failed?.()
        const retire = async () => {
          if (failedChild && child === failedChild) await withinBudget(invalidate(), budget)
        }
        const kind = knowledgeFailure(error)?.kind
        if (kind === "unauthorized" && !recovery.refreshed && error instanceof Error) {
          recovery.refreshed = true
          const source = failedChild ?? error
          const refresh = refreshes.get(source) ?? options.cloud.refresh({ deadline: budget.deadline, signal: options.signal })
          refreshes.set(source, refresh)
          try { await withinBudget(refresh, budget) }
          catch (failure) {
            await retire()
            if (!closed && !options.signal.aborted && options.cloud.credentials())
              options.changed({ state: "recoverable-error", failure: "LOGINOM_KNOWLEDGE_UNAVAILABLE" })
            throw failure
          }
          await retire()
          continue
        }
        if (kind === "unavailable" && route.server === "primary" && !recovery.switched) {
          recovery.switched = true
          await retire()
          route.server = "reserve"
          continue
        }
        if (kind === "unavailable" || kind === "unauthorized") {
          await retire()
          options.changed({ state: "recoverable-error", failure: "LOGINOM_KNOWLEDGE_UNAVAILABLE" })
        }
        throw error
      }
    }
  }
  const ensure = (budget: CallBudget) => recover(budget, route => connect(budget, route))
  return {
    admission: admission.promise,
    ensure,
    async catalog(budget) {
      await ensure(budget)
      return structuredClone(catalog)
    },
    async call(input, budget) {
      let runtime: typeof child
      return recover(budget, async route => {
        runtime = undefined
        await connect(budget, route)
        runtime = child!
        return runtime.request("call", { ...input, deadline: budget.deadline }, budget.deadline - Date.now(), budget.signal)
      }, () => runtime)
    },
    async interrupt(input) {
      await child?.request("interrupt", input)
    },
    invalidate,
    async close() {
      closed = true
      await invalidate()
    },
  }
}

async function withinBudget<T>(operation: Promise<T>, budget: CallBudget): Promise<T> {
  // Cleanup retains its outcome even when the caller has already expired.
  void operation.catch(() => {})
  budget.signal.throwIfAborted()
  if (Date.now() >= budget.deadline) throw Error("LOGINOM_RUNTIME_TIMEOUT")
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      abort = () => reject(budget.signal.reason)
      budget.signal.addEventListener("abort", abort, { once: true })
      timer = setTimeout(() => reject(Error("LOGINOM_RUNTIME_TIMEOUT")), Math.max(0, budget.deadline - Date.now()))
    })])
  } finally {
    clearTimeout(timer)
    if (abort) budget.signal.removeEventListener("abort", abort)
  }
}
