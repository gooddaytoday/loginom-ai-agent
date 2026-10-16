import { inputStore, type InputFile } from "./inputs"
import { readFile, rm } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { randomUUID } from "node:crypto"
import { supervise } from "./supervisor"
import { connectionService } from "./connection/connection-service"
import { connectionStore, type ActiveConnection } from "./connection/connection-store"
import type { CredentialCodec } from "./connection/credentials"
import { recoveryStore } from "./connection/recovery-store"

export async function createLoginomHost(options: {
  root: string
  resources: string
  codec: CredentialCodec
  environment?: NodeJS.ProcessEnv
  headless?: boolean
  strictRecovery?: boolean
  // Acceptance-only forwarding of the existing managed shutdown binding.
  acceptanceCleanupPackage?: string
  acceptanceCapture?: { authorization: string; packagePath: string }
}) {
  if (![options.root, options.resources].every(isAbsolute)) throw new Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  const root = options.root
  const resources = options.resources
  const environment = { ...(options.environment ?? process.env) }
  const inputs = inputStore(join(root, "inputs"))
  // A closed diagnostic capture retains uncertainty durably even when ordinary
  // model calls use advisory recovery. Caller settings cannot weaken admission.
  const journal = await recoveryStore(join(root, "recovery"), {
    strict: options.acceptanceCapture !== undefined || options.strictRecovery === true,
  })
  const generations = new Map<
    number,
    { connection: ActiveConnection; children: Map<string, Promise<Awaited<ReturnType<typeof supervise>>>> }
  >()
  const restarts = new Map<string, number>()
  const lost = new Set<string>()
  const stale = new Set<string>()
  type CaptureBinding = NonNullable<Parameters<typeof supervise>[0]["acceptanceCapture"]>
  const captures = new Map<string, CaptureBinding>()
  type Runtime = Awaited<ReturnType<typeof supervise>>
  type ValidationAttempt = { directory: string; pending: Promise<Runtime>; runtime?: Runtime }
  const validations = new Map<string, ValidationAttempt>()
  const failedStarts = new Map<string, Runtime>()
  async function finishValidation(chat: string, attempt: ValidationAttempt) {
    try { attempt.runtime ??= await attempt.pending } catch (error) { if (!attempt.runtime) throw error }
    await attempt.runtime.close()
    await rm(attempt.directory, { recursive: true, force: true })
    validations.delete(chat)
  }
  function retain(
    generation: { children: Map<string, Promise<Runtime>> },
    chat: string,
    child: Promise<Runtime>,
  ) {
    const tracked = child.then((runtime) => {
      void runtime.exited.then(() => {
        if (generation.children.get(chat) !== tracked) return
        lost.add(chat)
        generation.children.delete(chat)
      })
      return runtime
    })
    generation.children.set(chat, tracked)
    tracked.catch(() => {
      if (generation.children.get(chat) === tracked) generation.children.delete(chat)
    })
    return tracked
  }
  async function launch(connection: ActiveConnection, chat: string, validation = false, acceptanceCapture?: CaptureBinding) {
    const startupKey = `${connection.generation}:${chat}`
    if (failedStarts.has(startupKey)) throw Error("LOGINOM_RUNTIME_UNAVAILABLE")
    const manifest = JSON.parse(await readFile(join(resources, "resource-manifest.json"), "utf8"))
    return supervise({
      node: join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
      entry: join(resources, "runtime/src/managed-entry.mjs"),
      resources,
      stateDir: join(root, validation ? "validation" : "runtime"),
      generation: connection.generation,
      chat,
      connection,
      validation,
      headless: validation || chat === "readiness" || options.headless === true,
      environment,
      endpoint: environment.LOGINOM_AI_AGENT_KNOWLEDGE_ENDPOINT ?? manifest.endpoint,
      actionManifestUri: manifest.actionManifestUri,
      actionManifestSha256: manifest.actionManifestSha256,
      acceptanceCleanupPackage: options.acceptanceCleanupPackage,
      acceptanceCapture,
    }).catch(error => {
      if (!validation && error?.retainedRuntime) failedStarts.set(startupKey, error.retainedRuntime)
      throw error
    })
  }
  const service = await connectionService(
    connectionStore(join(root, "connection"), options.codec),
    {
      async check(connection) {
        if (validations.size || failedStarts.size) throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
        const chat = randomUUID()
        const attempt = { directory: join(root, "validation", "generations", String(connection.generation), "chats", chat),
          pending: undefined as unknown as Promise<Runtime>, runtime: undefined as Runtime | undefined }
        validations.set(chat, attempt)
        attempt.pending = launch(connection, chat, true).catch(error => {
          if (error?.retainedRuntime) attempt.runtime = error.retainedRuntime
          throw error
        })
        attempt.runtime = await attempt.pending
        await finishValidation(chat, attempt)
      },
      async prepare(connection) {
        const child = await launch(connection, "readiness")
        const generation = { connection, children: new Map<string, Promise<Runtime>>() }
        generations.set(connection.generation, generation)
        retain(generation, "readiness", Promise.resolve(child))
        return {
          async reset() {
            const results = await Promise.allSettled(
              [...generation.children.entries()]
                .filter(([chat]) => chat !== "readiness")
                .map(async ([chat, child]) => {
                  await (await child).close()
                  generation.children.delete(chat)
                }),
            )
            if (results.some((result) => result.status === "rejected"))
              throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
          },
          async close() {
            const results = await Promise.allSettled(
              [...generation.children.values()].map(async (child) => (await child).close()),
            )
            if (results.some((result) => result.status === "rejected"))
              throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
            generations.delete(connection.generation)
          },
        }
      },
    },
    journal,
  )
  const recoveries = new Map<string, NonNullable<ReturnType<typeof service.acquire>>>()
  return {
    ...service,
    async close() {
      // A failed check is not part of active generations. Drain its exact
      // original runtime before the host can acknowledge exit or replacement.
      const results = await Promise.allSettled([
        ...[...validations].map(([chat, attempt]) => finishValidation(chat, attempt)),
        ...[...failedStarts].map(async ([key, runtime]) => { await runtime.close(); failedStarts.delete(key) }),
      ])
      const failure = results.find(result => result.status === "rejected")
      if (failure?.status === "rejected") throw failure.reason
      await service.close()
    },
    api: {
      ...service.api,
      async acknowledgeRecovery(input: Parameters<typeof service.api.acknowledgeRecovery>[0]) {
        const view = await service.api.acknowledgeRecovery(input)
        recoveries.clear()
        return view
      },
    },
    journal,
    recoveries,
    authorizeCapture(authorization: unknown) {
      return !!options.acceptanceCapture && authorization === options.acceptanceCapture.authorization
    },
    bindCapture(owner: string, run: string, chat: string, lease: NonNullable<ReturnType<typeof service.acquire>>) {
      if (!options.acceptanceCapture) return
      const current = generations.get(lease.generation)
      if (!current || current.children.has(chat) || captures.has(chat)
          || !options.acceptanceCapture.packagePath.startsWith(`/${current.connection.username}/`))
        throw Error("LOGINOM_HANDSHAKE_INVALID")
      captures.set(chat, { revision: 1, harness: "calculator-grouped-before-done-v1", owner, run,
        lease: `${owner}:${run}`, generation: lease.generation, chat, account: current.connection.username,
        packagePath: options.acceptanceCapture.packagePath, admission: randomUUID(), expires: Date.now()+600000 })
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
        closing.push(child.then((runtime) => runtime.close()).then(() => undefined, () => undefined))
      }
      await Promise.all(closing)
      restarts.delete(chat)
      lost.delete(chat)
    },
    async interruptAll() {
      const results = await Promise.allSettled(
        [...generations.values()].flatMap((generation) =>
          [...generation.children.entries()]
            .filter(([chat]) => chat !== "readiness")
            .map(async ([, child]) => (await child).request("interrupt")),
        ),
      )
      if (results.some((result) => result.status === "rejected")) throw new Error("LOGINOM_RUNTIME_INTERRUPT_FAILED")
    },
    async inputs(generation: number, chat: string, userMessage: string, files: InputFile[]) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      return inputs.admit(`${generation}:${chat}`, userMessage, files, `/${current.connection.username}`)
    },
    async runtime(generation: number, chat: string) {
      const current = generations.get(generation)
      if (!current) throw new Error("LOGINOM_GENERATION_UNAVAILABLE")
      const previous = current.children.get(chat)
      if (previous) return previous
      if (captures.has(chat) && (lost.has(chat) || stale.has(chat))) throw Error("LOGINOM_RUNTIME_UNAVAILABLE")
      if (lost.has(chat)) {
        const count = restarts.get(chat) ?? 0
        if (count >= 2) throw new Error("LOGINOM_RUNTIME_UNAVAILABLE")
        restarts.set(chat, count + 1)
        lost.delete(chat)
      }
      return retain(current, chat, launch(current.connection, chat, false, captures.get(chat)))
    },
  }
}
