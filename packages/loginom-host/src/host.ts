import type { AcceptanceProbe } from "../../loginom-runtime/src/start-input.mjs"
import { inputStore, type InputFile } from "./inputs"
import { appendFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path"
import { tmpdir } from "node:os"
import { createHash, randomUUID } from "node:crypto"
import { Option, Schema } from "effect"
import { Loginom } from "@opencode-ai/schema/loginom"
import { RuntimeStartupError, supervise, superviseKnowledge } from "./supervisor"
import { connectionService } from "./connection/connection-service"
import { connectionStore, type ActiveConnection } from "./connection/connection-store"
import type { CredentialCodec } from "./connection/credentials"
import { recoveryStore } from "./connection/recovery-store"
import { fileReferences } from "./file-reference"
import { dashboardRequest, type DashboardStorageOperation } from "../../loginom-runtime/src/dashboard-storage.mjs"
import { DashboardRead, DashboardDelete, DashboardDeleteResult, DashboardPublish, PublicationRef, PublicationSet, PublicationSource, PublicationWrite, decodeDashboardDeleteResult } from "./dashboard"
import { verifyResources } from "../../loginom-runtime/src/resources.mjs"
import release from "../../product/loginom-release.json"
import { startupDiagnostic } from "../../loginom-runtime/client/lib/catalog.mjs"
import { launchNodeHost, NodeHostStartupError } from "./node-client"

// Installer and CLI setup share the exact Host cache identity and verifier.
export async function verifyInstallationResources(options: {
  root: string
  resources: string
  resourceVersion: string
  signal?: AbortSignal
  forceHash?: boolean
}) {
  const started = performance.now()
  const phase = async (status: string, detail: object = {}) => {
    await mkdir(options.root, { recursive: true, mode: 0o700 }).catch(() => undefined)
    await appendFile(
      join(options.root, "startup-phases.jsonl"),
      JSON.stringify({
        version: 1,
        recorded_at: new Date().toISOString(),
        phase: "resources.verify",
        scope: "installation",
        status,
        duration_ms: Math.round(performance.now() - started),
        pid: process.pid,
        ...detail,
      }) + "\n",
      { mode: 0o600 },
    ).catch(() => undefined)
  }
  await phase("starting")
  try {
    const verified = await verifyResources(options.resources, {
      nodePath: join(options.resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
      nodeVersion: release.nodeVersion,
      cachePath: join(options.root, "resource-verification.json"),
      cacheVersion: options.resourceVersion,
      forceHash: options.forceHash !== false,
      requireCache: true,
      signal: options.signal,
    })
    await phase("ready", verified.verification)
    return verified
  } catch (error) {
    const diagnostic = startupDiagnostic(error)
    if (diagnostic && !diagnostic.code && /^LOGINOM_[A-Z_]+$/.test(diagnostic.message))
      diagnostic.code = diagnostic.message
    await phase("failed", { error: diagnostic })
    throw error
  }
}

export async function warmInstallationBrowser(options: {
  root: string
  resources: string
  verified: Awaited<ReturnType<typeof verifyInstallationResources>>
  // Tests may shorten this private budget, never increase the production limit.
  timeoutMs?: number
}) {
  const started = performance.now()
  const budget = Math.max(1, Math.min(60_000, options.timeoutMs ?? 60_000))
  const deadline = started + budget
  const reserve = Math.min(10_000, budget / 3)
  const remaining = () => {
    const left = Math.floor(deadline - performance.now() - reserve)
    if (left <= 0) throw Object.assign(Error("LOGINOM_BROWSER_WARMUP_TIMEOUT"), { code: "ETIMEDOUT" })
    return left
  }
  const path = join(options.root, "browser-warmup.json")
  let profile: string | undefined
  let failure: unknown
  const cleanup = { confirmed: true, exit: undefined as { code: number | null; signal: string | null } | undefined }
  const receipt = () => ({
    protocol: 1,
    profile,
    manifestHash: options.verified.manifestHash,
    browserHash: options.verified.browserHash,
  })
  const removeProfile = async () => {
    if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 })
  }
  try {
    const previous = await readFile(path, "utf8").then(
      (text) => JSON.parse(text),
      () => undefined,
    )
    if (previous?.profile) {
      const parent = dirname(previous.profile)
      const temporary = tmpdir()
      if (
        previous.protocol !== 1 ||
        !/^lbw[A-Za-z0-9]{6}$/.test(basename(previous.profile)) ||
        (process.platform === "win32" ? parent.toLowerCase() !== temporary.toLowerCase() : parent !== temporary)
      )
        throw Object.assign(Error("LOGINOM_BROWSER_WARMUP_PROFILE_INVALID"), {
          code: "LOGINOM_BROWSER_WARMUP_PROFILE_INVALID",
        })
      profile = previous.profile
      await removeProfile()
    }
    profile = undefined
    remaining()
    profile = await mkdtemp(join(tmpdir(), "lbw"))
    await writeFile(path, JSON.stringify({ ...receipt(), status: "starting" }) + "\n", { mode: 0o600 })
    const phases = join(options.root, "browser-warmup-phases.jsonl")
    if (
      await stat(phases).then(
        (s) => s.size > 1024 * 1024,
        () => false,
      )
    ) {
      await rm(phases + ".1", { force: true }).catch(() => undefined)
      await rename(phases, phases + ".1").catch(() => undefined)
    }
    cleanup.confirmed = false
    const worker = await launchNodeHost(
      {
        node: options.verified.nodePath,
        entry: join(options.resources, "runtime/src/browser-warmup-entry.mjs"),
        root: options.root,
        resources: options.resources,
        headless: true,
      },
      {
        start: Math.min(15_000, remaining()),
        close: Math.min(5000, reserve / 2),
        terminate: Math.min(2000, reserve / 4),
        teardown: reserve,
      },
    )
    try {
      const timeout = Math.min(30_000, remaining())
      const result = await worker.request(
        "warm",
        { browserPath: options.verified.browserPath, profile, timeout_ms: timeout },
        // Warm replies after Chromium closes. Its IPC budget includes that work;
        // the browser launch itself still has the separate 30-second ceiling.
        remaining(),
      )
      if (!result || typeof result !== "object" || !("warmed" in result) || result.warmed !== true) {
        if (result && typeof result === "object" && "reason" in result) failure = result.reason
        throw Error("LOGINOM_BROWSER_WARMUP_FAILED")
      }
    } finally {
      await worker.close()
      cleanup.confirmed = true
      cleanup.exit = await worker.exited
    }
    await removeProfile()
    await writeFile(
      path,
      JSON.stringify({
        ...receipt(),
        status: "ready",
        closed_ack: true,
        node_exit_code: cleanup.exit.code,
        duration_ms: Math.round(performance.now() - started),
        completed_at: new Date().toISOString(),
      }) + "\n",
      { mode: 0o600 },
    )
  } catch (error) {
    if (error instanceof NodeHostStartupError) cleanup.confirmed = error.cleanupConfirmed
    const removal = await removeProfile().then(
      () => undefined,
      (error: unknown) => startupDiagnostic(error),
    )
    const reason = startupDiagnostic(failure ?? error)
    if (reason && !reason.code)
      reason.code = /^LOGINOM_[A-Z_]+$/.test(reason.message) ? reason.message : "LOGINOM_BROWSER_WARMUP_FAILED"
    await writeFile(
      path,
      JSON.stringify({
        ...receipt(),
        status: "failed",
        reason,
        closed_ack: cleanup.confirmed,
        node_exit_code: cleanup.exit?.code,
        ...(removal ? { cleanup_error: removal } : {}),
        duration_ms: Math.round(performance.now() - started),
        completed_at: new Date().toISOString(),
      }) + "\n",
      { mode: 0o600 },
    ).catch(() => undefined)
    throw Error("LOGINOM_BROWSER_WARMUP_FAILED", { cause: error })
  }
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
  acceptanceProbe?: AcceptanceProbe
}) {
  if (![options.root, options.resources].every(isAbsolute)) throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const root = options.root
  const resources = options.resources
  const environment = { ...(options.environment ?? process.env) }
  let pendingProbe = options.acceptanceProbe
  let probeChat: string | undefined
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
  const validationCache = {
    directory: join(root, "validation", "http-cache"),
    connection: undefined as ActiveConnection | undefined,
    inUse: false,
    failed: false,
  }
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
  let prewarmHashedAll = false
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
        prewarmHashedAll = result.verification.hashedFiles === result.manifest.files.length
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
  async function prepareValidationCache(connection: ActiveConnection) {
    try {
      const previous = validationCache.connection
      if (!previous || previous.url !== connection.url || previous.username !== connection.username ||
          previous.password !== connection.password) {
        await rm(validationCache.directory, { recursive: true, force: true })
        await mkdir(validationCache.directory, { recursive: true, mode: 0o700 })
        validationCache.connection = connection
      }
      return true
    } catch {
      // A cache is optional; filesystem failure must not prevent a fresh login.
      validationCache.connection = undefined
      return false
    }
  }
  async function launch(
    connection: ActiveConnection,
    chat: string,
    purpose: "validation" | "dashboard" | "chat",
    signal?: AbortSignal,
    deadline?: number,
    validationHttpCache = false,
  ) {
    const validation = purpose === "validation"
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
    // Mutate cache state only after the existing resource-verification admission.
    const httpCache = validationHttpCache && await prepareValidationCache(connection)
    const acceptanceProbe = purpose === "chat" && chat === probeChat ? pendingProbe : undefined
    if (acceptanceProbe) pendingProbe = undefined
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
        validationHttpCache: httpCache,
        ...(acceptanceProbe ? { acceptanceProbe } : {}),
        // CLI supplies its explicit browser policy for background launches too.
        headless: purpose === "chat" ? options.headless === true : (options.preflightHeadless ?? true),
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
    ).catch((error: unknown) => {
      if (acceptanceProbe && error instanceof RuntimeStartupError && error.cleanupConfirmed)
        pendingProbe = acceptanceProbe
      return startupFailure(error)
    })
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
        // An overlapping check keeps its independent fresh cache; no queue or new deadline.
        const httpCache = !validationCache.inUse && !validationCache.failed && !startupCleanup.failed
        if (httpCache) validationCache.inUse = true
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
          const child = await launch(connection, chat, "validation", signal, undefined, httpCache).catch((error: unknown) => {
            if (error instanceof Error && Schema.is(Loginom.BrowserFailure)(error.message))
              return { state: "failed" as const, failure: error.message }
            throw error
          })
          if ("state" in child) return child
          await child.close().catch((error: unknown) => {
            if (httpCache) validationCache.failed = true
            throw error
          })
          signal?.throwIfAborted()
          return { state: "verified" as const }
        } finally {
          if (httpCache) validationCache.inUse = false
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
  const dashboardOperations = new Map<AbortController, Promise<unknown>>()
  function dashboardOperation(operation: DashboardStorageOperation, input: DashboardRead | DashboardPublish | DashboardDelete, signal?: AbortSignal) {
    const controller = new AbortController()
    const pending = performDashboard(operation, input, signal ? AbortSignal.any([signal, controller.signal]) : controller.signal)
    dashboardOperations.set(controller, pending)
    void pending.finally(() => dashboardOperations.delete(controller)).catch(() => undefined)
    return pending
  }
  async function performDashboard(operation: DashboardStorageOperation, input: DashboardRead | DashboardPublish | DashboardDelete, signal?: AbortSignal) {
    const request = input
    dashboardRequest(request, operation)
    if (!Number.isSafeInteger(request.generation) || request.generation < 1) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
    if (signal?.aborted) throw new Error("DASHBOARD_CANCELLED")
    const current = generations.get(request.generation)
    if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
    if (new URL(current.connection.url).origin !== request.origin) throw new Error("DASHBOARD_ORIGIN_MISMATCH")
    const chat = randomUUID()
    const lease = service.acquire(chat)
    if (!lease) throw new Error("LOGINOM_CONNECTION_NOT_READY")
    try {
      if (lease.generation !== request.generation) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      const child = await retain(current, chat, launch(current.connection, chat, "dashboard", signal)).catch((error: unknown) => {
        if (signal?.aborted && error instanceof RuntimeStartupError && error.cleanupConfirmed)
          throw new Error("DASHBOARD_CANCELLED")
        throw error
      })
      const cancel = () => { void child.request("interrupt").catch(() => undefined) }
      signal?.addEventListener("abort", cancel, { once: true })
      try {
        if (signal?.aborted) throw new Error("DASHBOARD_CANCELLED")
        return await child.request(operation, request)
      } catch (error) {
        if (operation === "dashboardPublish" && !(error instanceof Error && [
          "DASHBOARD_INPUT_INVALID", "DASHBOARD_VERSION_EXISTS", "DASHBOARD_ACCESS_DENIED", "DASHBOARD_STORAGE_UNAVAILABLE", "DASHBOARD_CANCELLED",
        ].includes(error.message))) throw new Error("DASHBOARD_WRITE_UNKNOWN")
        if (operation === "dashboardDelete" && !(error instanceof Error && error.message === "DASHBOARD_CANCELLED"))
          throw new Error("DASHBOARD_DELETE_UNKNOWN")
        throw error
      } finally {
        signal?.removeEventListener("abort", cancel)
        await child.close().catch(() => { shutdown.failed = true })
        current.children.delete(chat)
        lost.delete(chat)
      }
    } finally {
      lease.release()
    }
  }
  const recoveries = new Map<string, NonNullable<ReturnType<typeof service.acquire>>>()
  function beginClose() {
    service.beginClose()
    resourceController.abort()
    for (const controller of dashboardOperations.keys()) controller.abort(new Error("DASHBOARD_CANCELLED"))
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
    bindAcceptanceProbe(session: string) {
      if (!pendingProbe || probeChat || !session) throw new Error("LOGINOM_HANDSHAKE_INVALID")
      probeChat = createHash("sha256").update(session).digest("hex")
    },
    browserRecovery: options.browserRecovery === true,
    references,
    async readDashboard(input: DashboardRead, signal?: AbortSignal): Promise<PublicationSource | null> {
      if (!Schema.is(DashboardRead)(input)) throw new Error("DASHBOARD_INPUT_INVALID")
      const result = await dashboardOperation("dashboardRead", input, signal)
      if (!Schema.is(Schema.NullOr(PublicationSource))(result)) throw new Error("LOGINOM_REPLY_INVALID")
      return result
    },
    async publishDashboard(input: DashboardPublish, signal?: AbortSignal): Promise<PublicationWrite> {
      if (!Schema.is(DashboardPublish)(input)) throw new Error("DASHBOARD_INPUT_INVALID")
      const result = await dashboardOperation("dashboardPublish", input, signal)
      if (!Schema.is(PublicationWrite)(result)) throw new Error("DASHBOARD_WRITE_UNKNOWN")
      return result
    },
    async listDashboardVersions(input: DashboardRead, signal?: AbortSignal): Promise<readonly PublicationRef[]> {
      if (!Schema.is(DashboardRead)(input)) throw new Error("DASHBOARD_INPUT_INVALID")
      const result = Schema.decodeUnknownOption(PublicationSet, { onExcessProperty: "error" })(
        await dashboardOperation("dashboardVersions", input, signal),
      )
      if (Option.isNone(result)) throw new Error("LOGINOM_REPLY_INVALID")
      return result.value
    },
    async deleteDashboard(input: DashboardDelete, signal?: AbortSignal): Promise<DashboardDeleteResult> {
      if (!Schema.is(DashboardDelete)(input)) throw new Error("DASHBOARD_INPUT_INVALID")
      const result = decodeDashboardDeleteResult(await dashboardOperation("dashboardDelete", input, signal), input.expected.length)
      if (Option.isNone(result)) throw new Error("DASHBOARD_DELETE_UNKNOWN")
      return result.value
    },
    async close() {
      beginClose()
      await verifiedResources
      await Promise.allSettled([...dashboardOperations.values()])
      await service.close()
      // Startup failures and retired or unexpectedly exited children retain
      // cleanup uncertainty even if a later runtime succeeds.
      if (startupCleanup.failed || shutdown.failed || validationCache.failed) throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
      await rm(validationCache.directory, { recursive: true, force: true }).catch(() => { throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED") })
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
    async verifyInstallationResources(settings: { reusePrewarm?: boolean } = {}) {
      // Drain prewarming before replacing its cache; setup must finish the full
      // pass even if an unconfigured profile's Host is closed immediately after.
      await verifiedResources
      return verifyInstallationResources({
        root,
        resources,
        resourceVersion,
        signal: resourceController.signal,
        // A fresh CLI already hashed every resource in this invocation. Revalidate
        // metadata and require the durable cache, rather than hash the tree twice.
        forceHash: !(settings.reusePrewarm && prewarmHashedAll),
      }).catch((error: unknown) => {
        // Preserve setup's missing-Help classification before connection.check.
        // The verifier already recorded its original filesystem diagnostic.
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          "path" in error &&
          (error.code === "ENOENT" || error.code === "ENOTDIR") &&
          typeof error.path === "string"
        ) {
          const missing = relative(join(resources, "help"), error.path)
          if (!isAbsolute(missing) && missing !== ".." && !missing.startsWith(".." + sep))
            throw new Error("LOGINOM_KNOWLEDGE_UNAVAILABLE", { cause: error })
        }
        throw error
      })
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
      for (const controller of dashboardOperations.keys()) controller.abort(new Error("DASHBOARD_CANCELLED"))
      await Promise.allSettled([...dashboardOperations.values()])
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
        launch(current.connection, chat, "chat", startup?.signal, startup?.deadline).then(
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
