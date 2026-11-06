import { inputStore, type InputFile } from "./inputs"
import { readFile, rm } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { randomUUID } from "node:crypto"
import { Schema } from "effect"
import { Loginom } from "@opencode-ai/schema/loginom"
import { RuntimeStartupError, supervise } from "./supervisor"
import { connectionService } from "./connection/connection-service"
import { connectionStore, type ActiveConnection } from "./connection/connection-store"
import type { CredentialCodec } from "./connection/credentials"
import { recoveryStore } from "./connection/recovery-store"
import { fileReferences } from "./file-reference"
import { Product } from "@loginom-ai-agent/product"
import { createCloudAuth, type CloudEndpoints, type CallBudget } from "./cloud-auth"
import { cloudStore } from "./connection/cloud-store"
import { createKnowledgeSession, type KnowledgeSession } from "./knowledge-session"

export async function createLoginomHost(options: {
  root: string
  cloudEndpoints?: CloudEndpoints
  resources: string
  codec: CredentialCodec
  environment?: NodeJS.ProcessEnv
  headless?: boolean
  preflightHeadless?: boolean
  strictRecovery?: boolean
  closeSavedPackageOnShutdown?: boolean
  // Private launcher capability baked into packaged release builds; never from env or the model.
  browserRecovery?: boolean
}) {
  if (![options.root, options.resources].every(isAbsolute)) throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const root = options.root
  const resources = options.resources
  const environment = { ...(options.environment ?? process.env) }
  const inputs = inputStore(join(root, "inputs"))
  const references = fileReferences(join(root, "file-references"))
  await references.cleanup()
  const journal = await recoveryStore(join(root, "recovery"), { strict: options.strictRecovery === true })
  const generations = new Map<
    number,
    {
      connection: ActiveConnection
      knowledge: KnowledgeSession
      children: Map<string, Promise<Awaited<ReturnType<typeof supervise>>>>
    }
  >()
  const lifetime = new AbortController()
  const endpoints = options.cloudEndpoints ?? Product.cloud
  const selection = { server: "primary" as "primary" | "reserve" }
  let cloudRevision = 0
  let cloudConnected = false
  const cloud = await createCloudAuth({
    store: cloudStore(join(root, "connection"), options.codec),
    endpoints,
    changed() {
      if (lifetime.signal.aborted || cloud.revision() === cloudRevision) return
      cloudRevision = cloud.revision()
      const connected = !!cloud.credentials()
      if (connected && cloudConnected) return
      cloudConnected = connected
      for (const generation of generations.values()) {
        if (generation.connection.mode !== "cloud") continue
        void generation.knowledge
          .invalidate()
          .then(() => generation.knowledge.ensure(budget()))
          .catch(backgroundFailure)
      }
    },
  })
  cloudConnected = !!cloud.credentials()
  function budget(): CallBudget {
    return { deadline: Date.now() + 120_000, signal: lifetime.signal }
  }
  function backgroundFailure(error: unknown) {
    try {
      startupFailure(error)
    } catch {}
  }
  let authClose: Promise<void> | undefined
  const restarts = new Map<string, number>()
  const lost = new Set<string>()
  const stale = new Set<string>()
  const startupCleanup = { failed: false }
  const shutdown = { failed: false }
  type Runtime = Awaited<ReturnType<typeof supervise>>
  function retain(generation: { children: Map<string, Promise<Runtime>> }, chat: string, child: Promise<Runtime>) {
    const tracked = child.then((runtime) => {
      const closing: { requested: boolean; promise?: Promise<void> } = { requested: false }
      void runtime.exited.then(() => {
        if (options.closeSavedPackageOnShutdown === true && !closing.requested) shutdown.failed = true
        if (generation.children.get(chat) !== tracked) return
        lost.add(chat)
        generation.children.delete(chat)
      })
      return {
        ...runtime,
        close() {
          closing.requested = true
          closing.promise ??= runtime.close().catch((error: unknown) => {
            if (options.closeSavedPackageOnShutdown === true) shutdown.failed = true
            throw error
          })
          return closing.promise
        },
      }
    })
    generation.children.set(chat, tracked)
    tracked.catch(() => {
      if (generation.children.get(chat) === tracked) generation.children.delete(chat)
    })
    return tracked
  }
  async function launch(
    connection: ActiveConnection,
    chat: string,
    validation = false,
    signal?: AbortSignal,
    deadline?: number,
  ) {
    const manifest = JSON.parse(await readFile(join(resources, "resource-manifest.json"), "utf8"))
    return supervise(
      {
        node: join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
        entry: join(resources, "runtime/src/managed-entry.mjs"),
        resources,
        stateDir: join(root, validation ? "validation" : "runtime"),
        generation: connection.generation,
        chat,
        connection: { password: connection.password, url: connection.url, username: connection.username },
        validation,
        // CLI applies its explicit browser policy to validation too; Desktop
        // retains quiet validation while Help readiness stays browser-free.
        headless: validation ? (options.preflightHeadless ?? true) : options.headless === true,
        closeSavedPackageOnShutdown: !validation && options.closeSavedPackageOnShutdown === true,
        browserRecovery: !validation && options.browserRecovery === true,
        environment,
        actionManifestUri: manifest.actionManifestUri,
        actionManifestSha256: manifest.actionManifestSha256,
        ...(deadline !== undefined ? { startupDeadline: deadline } : {}),
      },
      signal,
    ).catch(startupFailure)
  }
  function startupFailure(error: unknown): never {
    // Recoverable readiness/browser failures must not hide uncertain child cleanup.
    if (
      (error instanceof RuntimeStartupError && !error.cleanupConfirmed) ||
      (error instanceof Error && error.message === "LOGINOM_RUNTIME_CLEANUP_FAILED")
    ) {
      startupCleanup.failed = true
      throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED", { cause: error })
    }
    throw error
  }
  const service = await connectionService(
    connectionStore(join(root, "connection"), options.codec),
    {
      async check(candidate, signal, verifyBrowser) {
        signal?.throwIfAborted()
        const needsConnection = candidate.mode === "cloud" && !cloud.credentials()
        if (candidate.mode === "custom" && (!candidate.endpoint || !candidate.apiKey))
          throw Error("LOGINOM_CONNECTION_REQUIRED")
        const connection = candidate
        const chat = randomUUID()
        try {
          if (!needsConnection) {
            const knowledge = createKnowledgeSession({
              generation: connection.generation,
              connection,
              cloud,
              endpoints,
              resources,
              stateDir: join(root, "knowledge", String(connection.generation)),
              environment,
              signal: signal ?? lifetime.signal,
              changed() {},
              selected: () => selection.server,
              selectReserve() {
                selection.server = "reserve"
              },
            })
            try {
              await knowledge.ensure({ deadline: Date.now() + 120_000, signal: signal ?? lifetime.signal })
            } finally {
              await knowledge.close()
            }
          }
          signal?.throwIfAborted()
          const help = { state: needsConnection ? ("connection-required" as const) : ("ready" as const) }
          if (verifyBrowser === false) return { help, browser: { state: "unknown" as const } }
          const child = await launch(connection, chat, true, signal).catch((error: unknown) => {
            if (error instanceof Error && Schema.is(Loginom.BrowserFailure)(error.message))
              return { state: "failed" as const, failure: error.message }
            throw error
          })
          if ("state" in child) return { help, browser: child }
          await child.close()
          signal?.throwIfAborted()
          return { help, browser: { state: "verified" as const } }
        } finally {
          await Promise.all([
            rm(join(root, "validation", "generations", String(connection.generation), "chats", chat), {
              recursive: true,
              force: true,
            }),
          ])
        }
      },
      async prepare(connection) {
        let status: { state: Loginom.HelpState; failure?: string } = { state: "starting" }
        let observer: ((value: typeof status) => void) | undefined
        const knowledge = createKnowledgeSession({
          generation: connection.generation,
          connection,
          cloud,
          endpoints,
          resources,
          stateDir: join(root, "knowledge", String(connection.generation)),
          environment,
          signal: lifetime.signal,
          changed(value) {
            status = value
            observer?.(value)
          },
          selected: () => selection.server,
          selectReserve() {
            selection.server = "reserve"
          },
        })
        const generation = { connection, knowledge, children: new Map<string, Promise<Runtime>>() }
        generations.set(connection.generation, generation)
        void knowledge.ensure(budget()).catch(backgroundFailure)
        await knowledge.admission.catch(async (error: unknown) => {
          generations.delete(connection.generation)
          await knowledge.close().catch(startupFailure)
          startupFailure(error)
        })
        return {
          observeHelp(listener) {
            observer = listener
            listener(status)
          },
          async reset() {
            const results = await Promise.allSettled(
              [...generation.children.entries()].map(async ([chat, child]) => {
                await (await child).close()
                generation.children.delete(chat)
              }),
            )
            if (results.some((result) => result.status === "rejected"))
              throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
          },
          async close() {
            generations.delete(connection.generation)
            const results = await Promise.allSettled([
              knowledge.close(),
              ...[...generation.children.values()].map(async (child) => (await child).close()),
            ])
            if (results.some((result) => result.status === "rejected"))
              throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
          },
        }
      },
    },
    journal,
  )
  function management(view: Loginom.View): Loginom.View {
    return { ...view, cloud: cloud.status(), server: view.mode === "custom" ? "custom" : selection.server }
  }
  function beginClose() {
    authClose ??= cloud.close()
    if (!lifetime.signal.aborted) {
      lifetime.abort(Error("LOGINOM_HOST_CLOSED"))
      for (const generation of generations.values()) void generation.knowledge.invalidate().catch(backgroundFailure)
    }
    service.beginClose()
  }
  const recoveries = new Map<string, NonNullable<ReturnType<typeof service.acquire>>>()
  return {
    ...service,
    browserRecovery: options.browserRecovery === true,
    references,
    beginClose,
    async close() {
      beginClose()
      await Promise.all([service.close(), authClose])
      // Startup failures and retired or unexpectedly exited children retain
      // cleanup uncertainty even if a later runtime succeeds.
      if (startupCleanup.failed || shutdown.failed) throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
      await references.close()
    },
    api: {
      ...service.api,
      async read() {
        return management(await service.api.read())
      },
      async status() {
        return management(await service.api.status())
      },
      async save(input: Parameters<typeof service.api.save>[0]) {
        return management(await service.api.save(input))
      },
      async cancelPending(input: Parameters<typeof service.api.cancelPending>[0]) {
        return management(await service.api.cancelPending(input))
      },
      async cloudStart() {
        await cloud.start()
        return management(await service.api.status())
      },
      async cloudCancel() {
        await cloud.cancel()
        return management(await service.api.status())
      },
      async cloudDisconnect() {
        await cloud.disconnect()
        return management(await service.api.status())
      },
      async acknowledgeRecovery(input: Parameters<typeof service.api.acknowledgeRecovery>[0]) {
        const view = await service.api.acknowledgeRecovery(input)
        recoveries.clear()
        return management(view)
      },
    },
    journal,
    recoveries,
    async callKnowledge(generation: number, input: Parameters<KnowledgeSession["call"]>[0], inputBudget: CallBudget) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      return current.knowledge.call(input, inputBudget).catch(startupFailure)
    },
    async interruptKnowledge(generation: number, input: { run: string; id?: string }) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      return current.knowledge.interrupt(input)
    },
    async catalog(generation: number, inputBudget = budget()) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      return current.knowledge.catalog(inputBudget).catch(startupFailure)
    },
    resetRestarts(chat: string) {
      restarts.delete(chat)
      lost.delete(chat)
    },
    markRuntimeStale(chat: string) {
      stale.add(chat)
    },
    async retireRuntime(chat: string) {
      if (!stale.delete(chat)) return
      const closing: Promise<void>[] = []
      for (const generation of generations.values()) {
        const child = generation.children.get(chat)
        if (!child) continue
        generation.children.delete(chat)
        closing.push(
          child
            .then((runtime) => runtime.close())
            .then(
              () => undefined,
              () => undefined,
            ),
        )
      }
      await Promise.all(closing)
      restarts.delete(chat)
      lost.delete(chat)
    },
    async interruptAll() {
      const results = await Promise.allSettled(
        [...generations.values()].flatMap((generation) => [
          generation.knowledge.invalidate(),
          ...[...generation.children.values()].map(async (child) => (await child).request("interrupt")),
        ]),
      )
      if (results.some((result) => result.status === "rejected")) throw new Error("LOGINOM_RUNTIME_INTERRUPT_FAILED")
    },
    async inputs(generation: number, chat: string, userMessage: string, files: InputFile[]) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      return inputs.admit(`${generation}:${chat}`, userMessage, files, `/${current.connection.username}`)
    },
    hasRuntime(generation: number, chat: string) {
      return generations.get(generation)?.children.has(chat) === true
    },
    async workState(generation: number, chat: string) {
      // Inspect only the existing owner. Losing it is uncertainty, not evidence of idle work.
      if (lost.has(chat) || stale.has(chat)) throw new Error("LOGINOM_RUNTIME_UNAVAILABLE")
      const child = generations.get(generation)?.children.get(chat)
      if (!child) return { activeWork: false, unsettledWork: false, dispatching: false }
      const result = await (await child).request("work", undefined, 5000)
      if (
        !result ||
        typeof result !== "object" ||
        !("activeWork" in result) ||
        typeof result.activeWork !== "boolean" ||
        !("unsettledWork" in result) ||
        typeof result.unsettledWork !== "boolean" ||
        !("dispatching" in result) ||
        typeof result.dispatching !== "boolean"
      )
        throw new Error("LOGINOM_REPLY_INVALID")
      return { activeWork: result.activeWork, unsettledWork: result.unsettledWork, dispatching: result.dispatching }
    },
    async runtime(generation: number, chat: string, startup?: { deadline: number; signal: AbortSignal }) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      const previous = current.children.get(chat)
      if (previous) return previous
      if (lost.has(chat)) {
        const count = restarts.get(chat) ?? 0
        if (count >= 2) throw new Error("LOGINOM_RUNTIME_UNAVAILABLE")
        restarts.set(chat, count + 1)
        lost.delete(chat)
      }
      return retain(
        current,
        chat,
        launch(current.connection, chat, false, startup?.signal, startup?.deadline).then(
          (child) => {
            service.browserStatus(generation, { state: "verified" })
            return child
          },
          (error: unknown) => {
            if (error instanceof Error && Schema.is(Loginom.BrowserFailure)(error.message))
              service.browserStatus(generation, { state: "failed", failure: error.message })
            throw error
          },
        ),
      )
    },
  }
}
