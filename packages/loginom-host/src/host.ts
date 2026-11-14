import { inputStore, type InputFile } from "./inputs"
import { appendFile, mkdir, readFile, rm } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { randomUUID } from "node:crypto"
import { Schema } from "effect"
import { Loginom } from "@opencode-ai/schema/loginom"
import { RuntimeStartupError, supervise, superviseKnowledge } from "./supervisor"
import { connectionService } from "./connection/connection-service"
import { connectionStore, type ActiveConnection } from "./connection/connection-store"
import type { CredentialCodec } from "./connection/credentials"
import { recoveryStore } from "./connection/recovery-store"
import { fileReferences } from "./file-reference"
import { verifyResources } from "../../loginom-runtime/src/resources.mjs"
import release from "../../product/loginom-release.json"
import { startupDiagnostic } from "../../loginom-runtime/client/lib/catalog.mjs"

// Installer and CLI setup share the exact Host cache identity and verifier.
export function verifyInstallationResources(options: {
  root: string
  resources: string
  resourceVersion: string
  signal?: AbortSignal
}) {
  return verifyResources(options.resources, {
    nodePath: join(options.resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
    nodeVersion: release.nodeVersion,
    cachePath: join(options.root, "resource-verification.json"),
    cacheVersion: options.resourceVersion,
    forceHash: true,
    requireCache: true,
    signal: options.signal,
  })
}

export async function createLoginomHost(options: {
  root: string
  resources: string
  resourceVersion?: string
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
      knowledge: Awaited<ReturnType<typeof superviseKnowledge>>
      catalog: Promise<unknown>
      ready: Promise<void>
      children: Map<string, Promise<Awaited<ReturnType<typeof supervise>>>>
    }
  >()
  const restarts = new Map<string, number>()
  const lost = new Set<string>()
  const stale = new Set<string>()
  const startupCleanup = { failed: false }
  const shutdown = { failed: false }
  const resourceController = new AbortController()
  const resourceStarted = performance.now()
  // Desktop supplies its version; packaged CLI already carries the version in
  // its verified artifact manifest. Development fixtures may omit it.
  const resourceVersion =
    options.resourceVersion ??
    (await readFile(join(resources, "../../cli-manifest.json"), "utf8")
      .then(
        (text) => JSON.parse(text)?.metadata?.version ?? "",
        () => "",
      )
      .catch(() => ""))
  // Start before the settings click. No browser is admitted until this pass
  // drains; unchanged installations use the owner-authorized profile cache.
  const resourceCachePath = join(root, "resource-verification.json")
  const verifiedResources = appendFile(
    join(root, "startup-phases.jsonl"),
    JSON.stringify({
      version: 1,
      recorded_at: new Date().toISOString(),
      phase: "resources.verify",
      status: "starting",
      pid: process.pid,
    }) + "\n",
    { mode: 0o600 },
  )
    .catch(() => undefined)
    .then(() =>
      verifyResources(resources, {
        nodePath: join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
        nodeVersion: release.nodeVersion,
        signal: resourceController.signal,
        cachePath: resourceCachePath,
        cacheVersion: resourceVersion,
      }),
    )
    .then(
      async (result) => {
        await appendFile(
          join(root, "startup-phases.jsonl"),
          JSON.stringify({
            version: 1,
            recorded_at: new Date().toISOString(),
            phase: "resources.verify",
            status: "ready",
            duration_ms: Math.round(performance.now() - resourceStarted),
            files: result.manifest.files.length,
            pid: process.pid,
            ...result.verification,
          }) + "\n",
          { mode: 0o600 },
        ).catch(() => undefined)
        return result.manifestHash
      },
      async (error) => {
        await appendFile(
          join(root, "startup-phases.jsonl"),
          JSON.stringify({
            version: 1,
            recorded_at: new Date().toISOString(),
            phase: "resources.verify",
            status: "failed",
            duration_ms: Math.round(performance.now() - resourceStarted),
            error: startupDiagnostic(error),
          }) + "\n",
          { mode: 0o600 },
        ).catch(() => undefined)
        // The real runtime still performs full verification if prewarming failed.
        // This preserves fail-closed admission and the original classified failure.
        return undefined
      },
    )
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
    const startupDeadline = deadline ?? Date.now() + (validation ? 210_000 : 120_000)
    signal?.throwIfAborted()
    const timeout = AbortSignal.timeout(Math.max(1, startupDeadline - Date.now()))
    const waiting = signal ? AbortSignal.any([signal, timeout]) : timeout
    const cancelled: { reject?: (error: unknown) => void } = {}
    const cancel = () =>
      cancelled.reject?.(
        signal?.aborted
          ? signal.reason
          : Error("LOGINOM_RUNTIME_TIMEOUT", {
              cause: Object.assign(Error("Resource prewarm did not finish before the startup deadline"), {
                code: "LOGINOM_RESOURCE_PREWARM_PENDING",
              }),
            }),
      )
    const waitStarted = performance.now()
    const stateDir = join(root, validation ? "validation" : "runtime")
    const waitFailure = async (error: unknown): Promise<never> => {
      await mkdir(stateDir, { recursive: true, mode: 0o700 })
        .then(() =>
          appendFile(
            join(stateDir, "startup-failures.jsonl"),
            JSON.stringify({
              version: 1,
              recorded_at: new Date().toISOString(),
              phase: "resources.wait",
              generation: connection.generation,
              chat,
              elapsed_ms: Math.round(performance.now() - waitStarted),
              error: startupDiagnostic(error, [connection.username, connection.password, connection.apiKey]),
            }) + "\n",
            { mode: 0o600 },
          ),
        )
        .catch(() => undefined)
      throw error
    }
    await appendFile(
      join(root, "startup-phases.jsonl"),
      JSON.stringify({
        version: 1,
        recorded_at: new Date().toISOString(),
        phase: "resources.wait",
        status: "starting",
        generation: connection.generation,
        chat,
      }) + "\n",
      { mode: 0o600 },
    ).catch(() => undefined)
    const resourceManifestHash = await Promise.race([
      verifiedResources,
      new Promise<never>((_resolve, reject) => {
        cancelled.reject = reject
        waiting.addEventListener("abort", cancel, { once: true })
        if (waiting.aborted) cancel()
      }),
    ])
      .catch(waitFailure)
      .finally(() => waiting.removeEventListener("abort", cancel))
    await appendFile(
      join(root, "startup-phases.jsonl"),
      JSON.stringify({
        version: 1,
        recorded_at: new Date().toISOString(),
        phase: "resources.wait",
        status: "ready",
        generation: connection.generation,
        chat,
        duration_ms: Math.round(performance.now() - waitStarted),
      }) + "\n",
      { mode: 0o600 },
    ).catch(() => undefined)
    signal?.throwIfAborted()
    if (Date.now() >= startupDeadline)
      return waitFailure(
        Error("LOGINOM_RUNTIME_TIMEOUT", {
          cause: Object.assign(Error("Resource prewarm exhausted the startup deadline"), {
            code: "LOGINOM_RESOURCE_PREWARM_PENDING",
          }),
        }),
      )
    const manifest = JSON.parse(await readFile(join(resources, "resource-manifest.json"), "utf8"))
    return supervise(
      {
        node: join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
        entry: join(resources, "runtime/src/managed-entry.mjs"),
        resources,
        stateDir: join(root, validation ? "validation" : "runtime"),
        generation: connection.generation,
        chat,
        connection,
        validation,
        // CLI applies its explicit browser policy to validation too; Desktop
        // retains quiet validation while Help readiness stays browser-free.
        headless: validation ? (options.preflightHeadless ?? true) : options.headless === true,
        closeSavedPackageOnShutdown: !validation && options.closeSavedPackageOnShutdown === true,
        browserRecovery: !validation && options.browserRecovery === true,
        environment,
        actionManifestUri: manifest.actionManifestUri,
        actionManifestSha256: manifest.actionManifestSha256,
        startupDeadline,
        resourceManifestHash,
        resourceCachePath,
        resourceCacheVersion: resourceVersion,
      },
      signal,
    ).catch(startupFailure)
  }
  function startupFailure(error: unknown): never {
    // Recoverable readiness/browser failures must not hide uncertain child cleanup.
    if (error instanceof RuntimeStartupError && !error.cleanupConfirmed) {
      startupCleanup.failed = true
      throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED", { cause: error })
    }
    throw error
  }
  const service = await connectionService(
    connectionStore(join(root, "connection"), options.codec),
    {
      async check(connection, signal) {
        signal?.throwIfAborted()
        const chat = randomUUID()
        try {
          const knowledge = await superviseKnowledge(
            {
              node: join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
              entry: join(resources, "runtime/src/knowledge-entry.mjs"),
              // Knowledge has no mutable cwd state; retain its private close evidence after validation cleanup.
              stateDir: join(root, "knowledge", String(connection.generation)),
              generation: connection.generation,
              helpRoot: join(resources, "help"),
              environment,
            },
            signal,
          ).catch(startupFailure)
          const cancel = () => {
            void knowledge.close().catch(() => undefined)
          }
          signal?.addEventListener("abort", cancel, { once: true })
          try {
            signal?.throwIfAborted()
            await knowledge.request("list")
            signal?.throwIfAborted()
          } finally {
            signal?.removeEventListener("abort", cancel)
            await knowledge.close()
          }
          signal?.throwIfAborted()
          const child = await launch(connection, chat, true, signal).catch((error: unknown) => {
            if (error instanceof Error && Schema.is(Loginom.BrowserFailure)(error.message))
              return { state: "failed" as const, failure: error.message }
            throw error
          })
          if ("state" in child) return child
          await child.close()
          signal?.throwIfAborted()
          return { state: "verified" as const }
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
        const knowledge = await superviseKnowledge({
          node: join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
          entry: join(resources, "runtime/src/knowledge-entry.mjs"),
          stateDir: join(root, "knowledge", String(connection.generation)),
          generation: connection.generation,
          helpRoot: join(resources, "help"),
          environment,
        }).catch(startupFailure)
        const catalog = knowledge.request("list")
        const ready = catalog.then(() => undefined)
        const generation = { connection, knowledge, catalog, ready, children: new Map<string, Promise<Runtime>>() }
        generations.set(connection.generation, generation)
        void ready.catch(() => undefined)
        return {
          ready,
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
  const recoveries = new Map<string, NonNullable<ReturnType<typeof service.acquire>>>()
  function beginClose() {
    service.beginClose()
    resourceController.abort()
  }
  return {
    ...service,
    beginClose,
    async updateWorkState() {
      if (lost.size || stale.size || startupCleanup.failed || shutdown.failed)
        throw Error("LOGINOM_RUNTIME_UNAVAILABLE")
      const states = await Promise.all(
        [...generations.values()].flatMap((generation) =>
          [...generation.children.values()].map(async (child) => {
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
              throw Error("LOGINOM_REPLY_INVALID")
            return result
          }),
        ),
      )
      const leases = service.updateWorkState()
      return {
        activeWork: leases.activeWork || states.some((state) => state.activeWork),
        unsettledWork: leases.unsettledWork || states.some((state) => state.unsettledWork),
        dispatching: states.some((state) => state.dispatching),
      }
    },
    browserRecovery: options.browserRecovery === true,
    references,
    async close() {
      beginClose()
      await verifiedResources
      await service.close()
      // Startup failures and retired or unexpectedly exited children retain
      // cleanup uncertainty even if a later runtime succeeds.
      if (startupCleanup.failed || shutdown.failed) throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
      await references.close()
    },
    api: {
      ...service.api,
      async acknowledgeRecovery(input: Parameters<typeof service.api.acknowledgeRecovery>[0]) {
        const view = await service.api.acknowledgeRecovery(input)
        recoveries.clear()
        return view
      },
    },
    async verifyInstallationResources() {
      // Drain prewarming before replacing its cache; setup must finish the full
      // pass even if an unconfigured profile's Host is closed immediately after.
      await verifiedResources
      return verifyInstallationResources({ root, resources, resourceVersion, signal: resourceController.signal })
    },
    journal,
    recoveries,
    knowledge(generation: number) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      return current.knowledge
    },
    async catalog(generation: number) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      await current.ready
      return structuredClone(await current.catalog)
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
          generation.knowledge.request("interrupt", { all: true }),
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
