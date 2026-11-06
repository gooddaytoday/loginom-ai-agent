import { join } from "node:path"
import { Loginom } from "@opencode-ai/schema/loginom"
import type { ActiveConnection } from "./connection/connection-store"
import type { CloudAuth, CloudEndpoints, CallBudget } from "./cloud-auth"
import { RuntimeStartupError, superviseKnowledge } from "./supervisor"

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
  let catalog: unknown
  let loading: Promise<void> | undefined
  let attempt = 0
  let closed = false
  let controller: AbortController | undefined
  let cleanupFailed = false
  let retirement = Promise.resolve()
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
  async function ensure(budget: CallBudget) {
    await retirement
    if (closed || options.signal.aborted) {
      admission.reject(Error("LOGINOM_HOST_CLOSED"))
      throw Error("LOGINOM_HOST_CLOSED")
    }
    budget.signal.throwIfAborted()
    if (Date.now() >= budget.deadline) throw Error("LOGINOM_CONNECTION_NOT_READY")
    if (catalog) return
    if (loading) return loading
    const credentials = options.cloud.credentials()
    const selected = options.selected()
    const endpoint = options.connection.mode === "custom" ? options.connection.endpoint : options.endpoints[selected]
    const apiKey = options.connection.mode === "custom" ? options.connection.apiKey : credentials?.dock[selected].apiKey
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
    const pending = (async () => {
      const runtime = await superviseKnowledge(
        {
          node: join(options.resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
          entry: join(options.resources, "runtime/src/knowledge-entry.mjs"),
          stateDir: options.stateDir,
          generation: options.generation,
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
  return {
    admission: admission.promise,
    ensure,
    async catalog(budget) {
      await ensure(budget)
      return structuredClone(catalog)
    },
    async call(input, budget) {
      await ensure(budget)
      return child!.request("call", input, Math.max(1, budget.deadline - Date.now()))
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
